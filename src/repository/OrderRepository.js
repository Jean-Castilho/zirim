import { ObjectId } from "mongodb";
import { mapPaymentStatus, normalizePaymentStatus, resolveOrderStatus, isTerminalPaymentStatus } from '../services/paymentState.js';
import { ValidationError, GeneralError } from "../utils/errors.js";

import BaseRepository from "./BaseRepository.js";

const paymentFields = [
    "id",
    "status",
    "status_detail",
    "transaction_amount",
    "date_of_expiration",
    "qr_code",
    "qr_code_base64",
    "error"
];

const buildPaymentData = (paymentResult = {}) => Object.fromEntries(
    paymentFields
        .filter((field) => paymentResult[field] !== undefined)
        .map((field) => [field, paymentResult[field]])
);

const idVariants = (id) => ObjectId.isValid(id)
    ? [id, String(id), new ObjectId(id)]
    : [id, String(id)];

/**
 * Repository de pedidos: SOMENTE acesso a dados (queries, updates atômicos).
 */
export default class OrderRepository extends BaseRepository {

    constructor() {
        super("orders");
    }

    /** Pagamento -> status interno (default 'pendente'). */
    mapStatus(mpStatus) {
        return mapPaymentStatus(mpStatus) || 'pendente';
    }

    async findByPaymentId(paymentId) {
        return await this.collection.findOne({ "payment.id": { $in: [paymentId, String(paymentId), Number(paymentId)] } });
    }

    /** Marca a última tentativa de sincronização do pagamento. */
    async touchPaymentSync(paymentId) {
        return await this.collection.updateOne(
            { "payment.id": { $in: [paymentId, String(paymentId), Number(paymentId)] } },
            { $set: { "paymentSync.lastAttemptAt": new Date() }, $unset: { "payment.lastSyncAttemptAt": "" } }
        );
    }

    /** Pedidos pendentes cujo PIX expirou e ainda precisam ser reconciliados. */
    async findExpiredPendingOrders(userId = null, limit = 25) {
        const now = new Date();
        const fallbackExpiration = new Date(now.getTime() - 60 * 60 * 1000);
        const retryCutoff = new Date(now.getTime() - 5 * 60 * 1000);
        const query = {
            "payment.id": { $exists: true, $ne: null },
            $and: [
                {
                    $or: [
                        { statusInterno: 'pendente' },
                        {
                            statusInterno: { $in: ['cancelado', 'expirado'] },
                            "paymentSync.lastSyncedAt": { $exists: false },
                            "payment.lastSyncedAt": { $exists: false }
                        }
                    ]
                },
                {
                    $or: [
                        { "payment.date_of_expiration": { $lte: now } },
                        { "payment.date_of_expiration": { $exists: false }, createdAt: { $lte: fallbackExpiration } }
                    ]
                },
                {
                    $or: [
                        { "paymentSync.lastAttemptAt": { $lte: retryCutoff } },
                        {
                            "paymentSync.lastAttemptAt": { $exists: false },
                            $or: [
                                { "payment.lastSyncAttemptAt": { $exists: false } },
                                { "payment.lastSyncAttemptAt": { $lte: retryCutoff } }
                            ]
                        }
                    ]
                }
            ]
        };

        if (userId) {
            const userIdVariants = ObjectId.isValid(userId)
                ? [userId, String(userId), new ObjectId(userId)]
                : [String(userId)];
            query["user._id"] = { $in: userIdVariants };
        }
        return await this.collection.find(query).sort({ createdAt: 1 }).limit(limit).toArray();
    }

    async sincronizarStatusPedido(paymentInfo) {
        const paymentId = paymentInfo?.id;
        const paymentStatus = normalizePaymentStatus(paymentInfo?.status);
        if (!paymentId || !paymentStatus) return null;

        const paymentQuery = {
            $or: [
                { "payment.id": paymentId },
                { "payment.id": String(paymentId) },
                { "payment.id": Number(paymentId) }
            ]
        };
        let updatedOrder = null;

        try {
            for (let attempt = 0; attempt < 5; attempt++) {
                const order = await this.collection.findOne(paymentQuery);
                if (!order) return null;

                const incomingUpdatedAt = Date.parse(paymentInfo.date_last_updated || '');
                const storedUpdatedAt = Date.parse(order.paymentSync?.providerUpdatedAt || order.payment?.date_last_updated || '');
                if (Number.isFinite(incomingUpdatedAt) && Number.isFinite(storedUpdatedAt) && incomingUpdatedAt < storedUpdatedAt) {
                    return order;
                }

                const nextOrderStatus = resolveOrderStatus(order.statusInterno, paymentStatus);
                const now = new Date();
                const setFields = {
                    "payment.status": paymentStatus,
                    "payment.status_detail": paymentInfo.status_detail || null,
                    "paymentSync.lastSyncedAt": now,
                    updatedAt: now,
                };

                if (paymentInfo.date_last_updated) {
                    setFields["paymentSync.providerUpdatedAt"] = paymentInfo.date_last_updated;
                }
                if (paymentInfo.date_of_expiration) {
                    setFields["payment.date_of_expiration"] = new Date(paymentInfo.date_of_expiration);
                }
                if (nextOrderStatus !== order.statusInterno) {
                    setFields.statusInterno = nextOrderStatus;
                }

                const transactionData = paymentInfo.point_of_interaction?.transaction_data || {};
                const update = {
                    $set: setFields,
                    $unset: {
                        "payment.lastSyncAttemptAt": "",
                        "payment.lastSyncedAt": "",
                        "payment.date_last_updated": ""
                    },
                    $inc: { stateVersion: 1 }
                };
                if (isTerminalPaymentStatus(paymentStatus)) {
                    update.$unset["payment.qr_code"] = "";
                    update.$unset["payment.qr_code_base64"] = "";
                } else {
                    if (transactionData.qr_code) setFields["payment.qr_code"] = transactionData.qr_code;
                    if (transactionData.qr_code_base64) setFields["payment.qr_code_base64"] = transactionData.qr_code_base64;
                }

                const currentVersion = order.stateVersion;
                const filter = { _id: order._id };
                filter.stateVersion = currentVersion === undefined ? { $exists: false } : currentVersion;
                const result = await this.collection.updateOne(filter, update);
                if (result.modifiedCount > 0) {
                    updatedOrder = await this.collection.findOne({ _id: order._id });
                    break;
                }
            }

            if (!updatedOrder) {
                throw new GeneralError(`Não foi possível sincronizar o pagamento ${paymentId} após conflitos concorrentes.`, 409);
            }

            if (paymentStatus === 'approved' || paymentStatus === 'authorized') {
                await this.executarBaixaEstoque(updatedOrder);
            }

            return updatedOrder;
        } catch (error) {
            console.error(`[sincronizarStatusPedido] Erro ao sincronizar o pedido (paymentId: ${paymentId}):`, error);
            throw error;
        }
    }

    async executarBaixaEstoque(order) {
        // 1. Trava atômica utilizando `this.collection` (herdada de BaseRepository para a collection "orders")
        const reservation = await this.collection.updateOne(
            {
                _id: order._id,
                inventoryProcessed: { $ne: true },
                inventoryProcessing: { $ne: true },
                inventoryProcessingFailed: { $ne: true }
            },
            { 
                $set: {                      inventoryProcessing: true,                      inventoryProcessingAt: new Date(),                     updatedAt: new Date()                 },$inc: { stateVersion: 1 }
            }
        );

        if (reservation.modifiedCount === 0) return;

        const appliedOps = [];
        const db = this.db;
        const productsCollection = db.collection("products"); // Acesso correto à collection de produtos

        try {
            // 2. Loop de baixa atômica por item do pedido
            for (const item of order.items) {
                const quantityToSubtract = Number(item.quantidade || 0);
                if (quantityToSubtract <= 0) continue;

                const elemMatchFilter = {
                    estoque: { $gte: quantityToSubtract }
                };

                if (item.sku) {
                    elemMatchFilter.sku = item.sku;
                } else {
                    if (item.cor) elemMatchFilter.cores = { $in: [item.cor] };
                    if (item.tamanho) elemMatchFilter.tamanhos = { $in: [String(item.tamanho)] };
                }

                // Atualização atômica estrita na collection de produtos
                const updateResult = await productsCollection.updateOne(
                    {
                        _id: new ObjectId(item.id),
                        variacoes: {
                            $elemMatch: elemMatchFilter
                        }
                    },
                    {
                        $inc: { "variacoes.$.estoque": -quantityToSubtract }
                    }
                );

                if (updateResult.modifiedCount !== 1) {
                    throw new ValidationError(`Estoque insuficiente ou variação indisponível para o produto ID ${item.id}.`);
                }

                appliedOps.push({
                    productId: item.id,
                    filter: elemMatchFilter,
                    quantity: quantityToSubtract
                });
            }

            // 3. Confirmação do processamento usando `this.collection`
            await this.collection.updateOne(
                { _id: order._id, inventoryProcessing: true },
                {
                    $set: {                         inventoryProcessed: true,                         inventoryProcessedAt: new Date(),                         updatedAt: new Date()                     },$unset: { 
                        inventoryProcessing: "", 
                        inventoryProcessingAt: "", 
                        inventoryProcessingFailed: "", 
                        inventoryProcessingError: "" 
                    }
                }
            );

        } catch (error) {
            console.error(`[BaixaEstoque] Falha ao processar estoque para o pedido ${order._id}:`, error.message);

            // 4. Rollback (compensação) dos itens debitados em caso de falha parcial
            const rollbackErrors = [];
            for (const op of appliedOps.reverse()) {
                try {
                    const rollbackResult = await productsCollection.updateOne(
                        {
                            _id: new ObjectId(op.productId),
                            variacoes: { $elemMatch: { ...op.filter } }
                        },
                        {
                            $inc: { "variacoes.$.estoque": op.quantity }
                        }
                    );
                    if (rollbackResult.modifiedCount !== 1) {
                        console.warn(`[Rollback] Falha ao reverter estoque do produto ${op.productId}`);
                    }
                } catch (rollbackError) {
                    rollbackErrors.push(rollbackError.message);
                }
            }

            const failureMessage = rollbackErrors.length > 0
                ? `${error.message} | Erros no rollback: ${rollbackErrors.join('; ')}`
                : error.message;

            // 5. Atualização do status de erro utilizando `this.collection`
            await this.collection.updateOne(
                { _id: order._id, inventoryProcessing: true },
                {
                    $set: {
                        inventoryProcessingFailed: true,
                        inventoryProcessingError: failureMessage,
                        inventoryProcessingFailedAt: new Date(),
                        statusInterno: "erro_estoque",
                        updatedAt: new Date()
                    },
                    $unset: { inventoryProcessing: "", inventoryProcessingAt: "" }
                }
            );

            throw error;
        }
    }

    /**
     * Atualiza os dados de pagamento e o status interno do pedido
     * @param {string|ObjectId} orderId 
     * @param {object} paymentResult 
     * @param {string} [statusInterno] 
     */
    async updateOrderPayment(orderId, paymentResult, statusInterno) {
        if (!orderId) {
            throw new ValidationError("ID do pedido é obrigatório para atualizar o pagamento.");
        }
        const filter = ObjectId.isValid(orderId) ? { _id: new ObjectId(orderId) } : { _id: orderId };
        const novoStatus = statusInterno || (paymentResult?.status ? this.mapStatus(paymentResult.status) : 'pendente');
        const paymentData = buildPaymentData(paymentResult);
        const setFields = {
            payment: paymentData,
            statusInterno: novoStatus,
            updatedAt: new Date()
        };
        if (paymentResult?.date_last_updated) {
            setFields["paymentSync.providerUpdatedAt"] = paymentResult.date_last_updated;
        }

        return await this.collection.updateOne(
            filter,
            {
                $set: setFields
            }
        );
    }

    async findUserOrders(userId) {
        return await this.collection.find({
            $or: [
                { "user._id": userId },
                { "user._id": String(userId) },
                { "user._id": new ObjectId(userId) }
            ]
        }).sort({ createdAt: -1 }).toArray();
    }

    async cancelExpiredOrder(orderId) {
        return await this.collection.updateOne(
            { _id: new ObjectId(orderId) },
            {
                $set: {
                    statusInterno: 'cancelado',
                    "payment.status": 'cancelled',
                    updatedAt: new Date()
                },
                $unset: {
                    "payment.qr_code": "",
                    "payment.qr_code_base64": ""
                }
            }
        );
    }

    async getMonthlySalesVolume(days = 30) {
        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - days);

        const salesStats = await this.collection.aggregate([
            {
                $match: {
                    "payment.status": 'approved',
                    createdAt: { $gte: dateThreshold }
                }
            },
            {
                $group: {
                    _id: null,
                    totalVolume: { $sum: "$payment.transaction_amount" }
                }
            }
        ]).toArray();

        return salesStats[0]?.totalVolume || 0;
    }

    async countByStatus(statusInterno) {
        return await this.collection.countDocuments({ statusInterno });
    }

    async getPaidOrders() {
        return await this.collection.find({ 
            statusInterno: { $in: ['pago', 'preparado', 'em_rota'] } 
        }).sort({ createdAt: -1 }).toArray();
    }

    async getLogisticsDashboardData() {
        const allOrders = await this.collection.find({}).sort({ createdAt: -1 }).toArray();
        const stats = {
            total: allOrders.length,
            pendente: 0,
            pago: 0,
            preparado: 0,
            em_rota: 0,
            entregue: 0,
            cancelado: 0,
            expirado: 0,
            faturamento: 0
        };

        for (let i = 0; i < allOrders.length; i++) {
            const order = allOrders[i];
            const status = order.statusInterno || 'pendente';
            if (status === 'pendente') {
                stats.pendente++;
            } else if (status === 'pago') {
                stats.pago++;
            } else if (status === 'preparado') {
                stats.preparado++;
            } else if (status === 'em_rota') {
                stats.em_rota++;
            } else if (status === 'entregue') {
                stats.entregue++;
            } else if (status === 'cancelado') {
                stats.cancelado++;
            } else if (status === 'expirado') {
                stats.expirado++;
            }

            if (order.payment?.status === 'approved') {
                stats.faturamento += Number(order.payment?.transaction_amount || 0);
            }
        }

        return { orders: allOrders, stats };
    }

    async getCourierDeliveries(courierId) {
        const idVariants = ObjectId.isValid(courierId)
            ? [courierId, String(courierId), new ObjectId(courierId)]
            : [courierId, String(courierId)];

        return await this.collection.find({
            "delivery.courierId": { $in: idVariants },
            statusInterno: { $in: ["pago", "em_transporte", "em_rota"] }
        }).sort({ updatedAt: -1, createdAt: -1 }).toArray();
    }

    async getAvailableDeliveries() {
        return await this.collection.find({
            statusInterno: "preparado",
            $or: [
                { "delivery.courierId": { $exists: false } },
                { "delivery.courierId": null }
            ]
        }).sort({ createdAt: 1 }).toArray();
    }

    // ------------------------------------------------------------------
    // Entregas: primitivas de persistência (regras vivem em DeliveryService)
    // ------------------------------------------------------------------

    async markPrepared(orderId, confirmationCode) {
        return await this.collection.updateOne(
            { _id: new ObjectId(orderId) },
            {
                $set: {
                    statusInterno: "preparado",
                    "delivery.confirmationCodePlain": confirmationCode,
                    "delivery.preparedAt": new Date(),
                    updatedAt: new Date()
                }
            }
        );
    }

    /** Atribuição atômica: só um entregador consegue pegar o pedido 'preparado'. */
    async claimForCourier(orderId, courier, confirmationCode) {
        const result = await this.collection.findOneAndUpdate(
            {
                _id: new ObjectId(orderId),
                statusInterno: "preparado",
                $or: [
                    { "delivery.courierId": { $exists: false } },
                    { "delivery.courierId": null }
                ]
            },
            {
                $set: {
                    statusInterno: "em_rota",
                    "delivery.courierId": courier.id,
                    "delivery.courierName": courier.name,
                    "delivery.courierPhone": courier.phone,
                    "delivery.confirmationCodePlain": confirmationCode,
                    "delivery.startedAt": new Date(),
                    updatedAt: new Date()
                }
            },
            { returnDocument: "after" }
        );
        return result?.value ?? result;
    }

    async findCourierOrder(orderId, courierId) {
        return await this.collection.findOne({
            _id: new ObjectId(orderId),
            "delivery.courierId": { $in: idVariants(courierId) }
        });
    }

    async incrementDeliveryAttempts(orderId) {
        return await this.collection.updateOne(
            { _id: new ObjectId(orderId) },
            { $inc: { "delivery.attempts": 1 } }
        );
    }

    async markDelivered(orderId) {
        return await this.collection.updateOne(
            { _id: new ObjectId(orderId) },
            {
                $set: { statusInterno: "entregue", "delivery.deliveredAt": new Date(), updatedAt: new Date() },
                $unset: { "delivery.confirmationCodeHash": "", "delivery.confirmationCodePlain": "" }
            }
        );
    }
}
