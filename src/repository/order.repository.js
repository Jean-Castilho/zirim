import { ObjectId } from "mongodb";
import {
    mapPaymentStatus,
    normalizePaymentStatus,
    resolveOrderStatus,
    isTerminalPaymentStatus,
    isStockHeld,
    SHIPPED_STATUSES,
    APPROVED_PAYMENT_STATUSES,
    RELEASING_PAYMENT_STATUSES,
} from '../services/payment-state.js';
import { ValidationError, GeneralError } from "../utils/errors.js";
import { findLegacyVariations } from "../utils/variation-match.js";

import BaseRepository from "./base.repository.js";

/** Tempo após o qual a trava de estoque de um pedido é considerada abandonada (processo caiu). */
const STOCK_LOCK_TTL_MS = 2 * 60 * 1000;

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

/** Campos lidos pelas telas de entrega (lista branca: PIN, e-mail e CPF ficam de fora). */
const DELIVERY_PROJECTION = {
    _id: 1,
    statusInterno: 1,
    createdAt: 1,
    location: 1,
    address: 1,
    "user.name": 1,
    "user.phone": 1,
    "delivery.courierId": 1,
    "delivery.courierName": 1,
    "delivery.courierPhone": 1,
    "delivery.startedAt": 1,
    "delivery.deliveredAt": 1,
};

/** Pedido disponível: não carrega nenhum dado pessoal (regra de aceite). */
const AVAILABLE_PROJECTION = { _id: 1, statusInterno: 1, createdAt: 1, location: 1, "address.neighborhood": 1 };

/** Condição "sem entregador atribuído". */
const UNASSIGNED = { $or: [{ "delivery.courierId": { $exists: false } }, { "delivery.courierId": null }] };

/**
 * Repository de pedidos: SOMENTE acesso a dados (queries, updates atômicos).
 * Chamadas ao gateway de pagamento ficam em PaymentService; regras de entrega em DeliveryService.
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

            if (APPROVED_PAYMENT_STATUSES.includes(paymentStatus)) {
                await this.ensureStockHeld(updatedOrder._id);
            } else if (RELEASING_PAYMENT_STATUSES.includes(paymentStatus)) {
                await this.releaseStock(updatedOrder._id);
            }

            return await this.collection.findOne({ _id: updatedOrder._id });
        } catch (error) {
            console.error(`[sincronizarStatusPedido] Erro ao sincronizar o pedido (paymentId: ${paymentId}):`, error);
            throw error;
        }
    }

    // ------------------------------------------------------------------
    // Estoque
    //
    // Regra: quem PAGA primeiro fica com a unidade. O pedido NÃO reserva estoque na criação.
    // O débito acontece na aprovação do pagamento (atômico, por variação). Se não houver
    // mais unidade quando o pagamento for aprovado, o pedido vai para `erro_estoque`
    // e o pagamento é estornado no Mercado Pago.
    // Estoque é devolvido só quando um pagamento já aprovado é estornado (antes do envio).
    // ------------------------------------------------------------------

    /** Identificador da variação comprada (pedidos antigos resolvem por SKU/cor/tamanho, com correspondência única). */
    async #resolveVariationId(productsCollection, item) {
        if (item.variacaoId) return new ObjectId(item.variacaoId);

        const product = await productsCollection.findOne(
            { _id: new ObjectId(item.id) },
            { projection: { variacoes: 1 } }
        );
        if (!product) throw new ValidationError(`Produto ID ${item.id} não encontrado para a baixa de estoque.`);

        const matches = findLegacyVariations(product.variacoes, item);
        if (matches.length !== 1 || !matches[0]._id) {
            throw new ValidationError(
                `Não foi possível identificar a variação do produto ID ${item.id} (${matches.length} correspondências).`
            );
        }
        return matches[0]._id;
    }

    /** Operações de estoque (produto, variação, quantidade) a partir dos itens do pedido. */
    async #opsFor(items = []) {
        const productsCollection = this.db.collection("products");
        const ops = [];
        for (const item of items) {
            const quantity = Number(item.quantidade || 0);
            if (quantity <= 0) continue;
            ops.push({
                productId: new ObjectId(item.id),
                variationId: await this.#resolveVariationId(productsCollection, item),
                quantity,
            });
        }
        return ops;
    }

    /**
     * Debita todas as operações, uma a uma, com filtro de saldo na própria atualização.
     * Tudo ou nada: se uma falhar, as anteriores são devolvidas.
     */
    async #debit(ops) {
        const productsCollection = this.db.collection("products");
        const applied = [];
        try {
            for (const op of ops) {
                const result = await productsCollection.updateOne(
                    {
                        _id: op.productId,
                        variacoes: {
                            $elemMatch: { _id: op.variationId, ativo: { $ne: false }, estoque: { $gte: op.quantity } },
                        },
                    },
                    { $inc: { "variacoes.$.estoque": -op.quantity } }
                );
                if (result.modifiedCount !== 1) {
                    throw new ValidationError(
                        `Estoque insuficiente ou variação indisponível para o produto ID ${op.productId} (variação ${op.variationId}).`
                    );
                }
                applied.push(op);
            }
            return applied;
        } catch (error) {
            await this.#credit(applied);
            throw error;
        }
    }

    /** Devolve unidades ao estoque, sem checar saldo. Falhas são registradas em log, não lançadas. */
    async #credit(ops) {
        const productsCollection = this.db.collection("products");
        for (const op of [...ops].reverse()) {
            try {
                const result = await productsCollection.updateOne(
                    { _id: op.productId, "variacoes._id": op.variationId },
                    { $inc: { "variacoes.$.estoque": op.quantity } }
                );
                if (result.modifiedCount !== 1) {
                    console.warn(`[Estoque] Variação ${op.variationId} do produto ${op.productId} não encontrada para devolução.`);
                }
            } catch (error) {
                console.error(`[Estoque] Falha ao devolver ${op.quantity} un. do produto ${op.productId}:`, error.message);
            }
        }
    }

    /**
     * Executa `work(order)` com a trava do pedido. Webhook, consulta de status e varredura
     * não mexem no estoque do mesmo pedido ao mesmo tempo. A trava expira sozinha
     * se o processo cair no meio da operação.
     * Retorna "busy" quando outra execução já está com o pedido.
     */
    async #withStockLock(orderId, work) {
        const id = new ObjectId(orderId);
        const staleBefore = new Date(Date.now() - STOCK_LOCK_TTL_MS);
        const locked = await this.collection.findOneAndUpdate(
            { _id: id, $or: [{ stockLocked: { $ne: true } }, { stockLockedAt: { $lt: staleBefore } }] },
            { $set: { stockLocked: true, stockLockedAt: new Date() } }
        );
        if (!locked) return "busy";

        try {
            const order = await this.collection.findOne({ _id: id });
            if (!order) return "missing";
            return await work(order);
        } finally {
            await this.collection.updateOne({ _id: id }, { $unset: { stockLocked: "", stockLockedAt: "" } });
        }
    }

    /** Cria o pedido sem reservar estoque. Retorna o _id (ObjectId). */
    async createPendingOrder(order) {
        const result = await this.collection.insertOne({ ...order, stockHeld: false });
        return result.insertedId;
    }

    /**
     * Garante o débito do estoque de um pedido aprovado. Não faz nada se a reserva existe.
     * Se não houver saldo, marca `erro_estoque` (não vai para preparo). Retorna
     * "held", "failed", "busy" ou "missing".
     */
    async ensureStockHeld(orderId) {
        return await this.#withStockLock(orderId, async (order) => {
            if (isStockHeld(order)) return "held";

            try {
                await this.#debit(await this.#opsFor(order.items));
            } catch (error) {
                console.error(`[Estoque] Pedido ${order._id} aprovado sem estoque: ${error.message}`);
                await this.collection.updateOne(
                    { _id: order._id },
                    {
                        $set: {
                            statusInterno: "erro_estoque",
                            stockRefundPending: true,
                            inventoryProcessingFailed: true,
                            inventoryProcessingError: error.message,
                            inventoryProcessingFailedAt: new Date(),
                            updatedAt: new Date(),
                        },
                    }
                );
                return "failed";
            }

            const set = { stockHeld: true, stockHeldAt: new Date(), updatedAt: new Date() };
            // Recuperado: o pedido que estava sem estoque volta a "pago" (agora com reserva).
            if (order.statusInterno === "erro_estoque") set.statusInterno = "pago";
            await this.collection.updateOne(
                { _id: order._id },
                {
                    $set: set,
                    $unset: { inventoryProcessingFailed: "", inventoryProcessingError: "", inventoryProcessingFailedAt: "", stockRefundPending: "" },
                }
            );
            return "held";
        });
    }

    /**
     * Devolve o estoque de um pedido que ainda o segura. Pedido já enviado não é devolvido
     * automaticamente (vai para conferência manual). `statusInterno` ajusta o status junto,
     * e `when` permite reconferir a condição dentro da trava.
     * Retorna "released", "noop", "manual", "busy" ou "missing".
     */
    async releaseStock(orderId, { statusInterno = null, when = () => true } = {}) {
        return await this.#withStockLock(orderId, async (order) => {
            if (!isStockHeld(order) || !when(order)) return "noop";

            if (SHIPPED_STATUSES.includes(order.statusInterno)) {
                console.warn(`[Estoque] Pedido ${order._id} já enviado: devolução exige conferência manual.`);
                await this.collection.updateOne(
                    { _id: order._id },
                    { $set: { stockReturnPending: true, updatedAt: new Date() } }
                );
                return "manual";
            }

            await this.#credit(await this.#opsFor(order.items));

            const set = { stockHeld: false, stockReleasedAt: new Date(), updatedAt: new Date() };
            if (statusInterno) set.statusInterno = statusInterno;
            await this.collection.updateOne(
                { _id: order._id },
                { $set: set, $unset: { inventoryProcessed: "" } }
            );
            return "released";
        });
    }

    /** Registra que o estorno sem estoque foi solicitado (evita pedir de novo). */
    async markStockRefundRequested(orderId) {
        return await this.collection.updateOne(
            { _id: new ObjectId(orderId) },
            { $set: { stockRefundRequestedAt: new Date(), updatedAt: new Date() } }
        );
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

    /** Faturamento aprovado do período atual e do anterior (mesma duração), numa só consulta. */
    async getSalesComparison(days = 30) {
        const now = Date.now();
        const currentStart = new Date(now - days * 24 * 60 * 60 * 1000);
        const previousStart = new Date(now - 2 * days * 24 * 60 * 60 * 1000);

        const rows = await this.collection.aggregate([
            { $match: { "payment.status": 'approved', createdAt: { $gte: previousStart } } },
            {
                $group: {
                    _id: { $cond: [{ $gte: ["$createdAt", currentStart] }, "current", "previous"] },
                    total: { $sum: "$payment.transaction_amount" },
                    count: { $sum: 1 }
                }
            }
        ]).toArray();

        const byPeriod = Object.fromEntries(rows.map((r) => [r._id, r]));
        return {
            current: byPeriod.current?.total || 0,
            previous: byPeriod.previous?.total || 0,
            ordersCurrent: byPeriod.current?.count || 0,
        };
    }

    async countByStatus(statusInterno) {
        return await this.collection.countDocuments({ statusInterno });
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

    /** Pedidos pagos aguardando preparo (painel de preparo). Sem PIN e sem dados de pagamento. */
    async getOrdersToPrepare() {
        return await this.collection.find(
            { statusInterno: "pago" },
            { projection: { _id: 1, createdAt: 1, "user.name": 1, items: 1 } }
        ).sort({ createdAt: 1 }).toArray();
    }

    /** Mapa do admin: todos os pedidos ativos, sem PIN. */
    async getMapOrdersForAdmin() {
        return await this.collection.find(
            { statusInterno: { $in: ["pago", "preparado", "em_rota"] } },
            { projection: DELIVERY_PROJECTION }
        ).sort({ createdAt: -1 }).toArray();
    }

    /** Mapa do entregador: pedidos prontos sem entregador e os próprios pedidos em rota. */
    async getMapOrdersForCourier(courierId) {
        return await this.collection.find({
            $or: [
                { $and: [{ statusInterno: "preparado" }, UNASSIGNED] },
                { statusInterno: "em_rota", "delivery.courierId": { $in: idVariants(courierId) } }
            ]
        }, { projection: DELIVERY_PROJECTION }).sort({ createdAt: 1 }).toArray();
    }

    /** Pedidos aceitos e ainda em rota do entregador. */
    async getCourierDeliveries(courierId) {
        return await this.collection.find({
            "delivery.courierId": { $in: idVariants(courierId) },
            statusInterno: "em_rota"
        }, { projection: DELIVERY_PROJECTION }).sort({ "delivery.startedAt": 1 }).toArray();
    }

    /** Entregas concluídas pelo entregador (últimas 50). */
    async getCourierHistory(courierId, limit = 50) {
        return await this.collection.find({
            "delivery.courierId": { $in: idVariants(courierId) },
            statusInterno: "entregue"
        }, { projection: DELIVERY_PROJECTION }).sort({ "delivery.deliveredAt": -1 }).limit(limit).toArray();
    }

    async getAvailableDeliveries() {
        return await this.collection.find({
            statusInterno: "preparado",
            ...UNASSIGNED
        }, { projection: AVAILABLE_PROJECTION }).sort({ createdAt: 1 }).toArray();
    }

    // ------------------------------------------------------------------
    // Entregas: primitivas de persistência (regras vivem em DeliveryService)
    // ------------------------------------------------------------------

    async markPrepared(orderId, confirmationCode, preparedBy) {
        return await this.collection.updateOne(
            { _id: new ObjectId(orderId) },
            {
                $set: {
                    statusInterno: "preparado",
                    "delivery.confirmationCodePlain": confirmationCode,
                    "delivery.preparedAt": new Date(),
                    "delivery.preparedBy": String(preparedBy),
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

    /**
     * Libera um pedido em rota: volta para 'preparado' sem entregador.
     * O PIN é mantido. Retorna true quando o pedido foi liberado.
     */
    async releaseOrder(orderId, courierId) {
        const result = await this.collection.updateOne(
            {
                _id: new ObjectId(orderId),
                statusInterno: "em_rota",
                "delivery.courierId": { $in: idVariants(courierId) }
            },
            {
                $set: { statusInterno: "preparado", updatedAt: new Date() },
                $unset: {
                    "delivery.courierId": "",
                    "delivery.courierName": "",
                    "delivery.courierPhone": "",
                    "delivery.startedAt": ""
                }
            }
        );
        return result.modifiedCount > 0;
    }

    /** Atribui um pedido preparado ou em rota a outro entregador. Retorna o pedido ou null. */
    async reassignOrder(orderId, courier) {
        return await this.collection.findOneAndUpdate(
            { _id: new ObjectId(orderId), statusInterno: { $in: ["preparado", "em_rota"] } },
            {
                $set: {
                    statusInterno: "em_rota",
                    "delivery.courierId": String(courier.id),
                    "delivery.courierName": courier.name,
                    "delivery.courierPhone": courier.phone,
                    "delivery.startedAt": new Date(),
                    updatedAt: new Date()
                }
            },
            { returnDocument: "after" }
        );
    }

    /**
     * Reserva uma tentativa de PIN de forma atômica. Retorna o número da tentativa
     * ou null quando o limite já foi atingido (requisições paralelas não ultrapassam o limite).
     */
    async reserveDeliveryAttempt(orderId, maxAttempts) {
        const updated = await this.collection.findOneAndUpdate(
            {
                _id: new ObjectId(orderId),
                $or: [
                    { "delivery.attempts": { $lt: maxAttempts } },
                    { "delivery.attempts": { $exists: false } },
                ],
            },
            { $inc: { "delivery.attempts": 1 } },
            { returnDocument: "after", projection: { "delivery.attempts": 1 } }
        );
        return updated ? Number(updated.delivery?.attempts) : null;
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
