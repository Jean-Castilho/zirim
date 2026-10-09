import { ObjectId } from "mongodb";
import { DataBase } from "../config/db.js";
import { MercadoPagoConfig, Payment } from 'mercadopago';
import crypto from 'crypto';
import { mapPaymentStatus, normalizePaymentStatus, resolveOrderStatus, isTerminalPaymentStatus } from '../services/paymentState.js';

import BaseRepository from "./BaseRepository.js";

const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN });
const paymentClient = new Payment(client);

export default class OrderRepository extends BaseRepository {
  
    constructor() {
        super("orders");
    }

    get db() {
        return DataBase();
    }

    getCollection() {
        return this.db.collection("orders");
    }

    async gerarPix(valor, userData) {
        if (!valor) {
            return { error: 'O campo "valor" é obrigatório.' };
        }

        const valorInteiro = parseFloat(valor).toFixed(2);
        const [firstName, ...lastNameParts] = (userData.name || 'Cliente').split(' ');
        
        // Define a expiração do PIX para 60 minutos a partir de agora
        const expirationDate = new Date();
        expirationDate.setMinutes(expirationDate.getMinutes() + 60);

        const payment_data = {
            transaction_amount: parseFloat(valorInteiro),
            description: 'Pagamento PIX - Zirim Store',
            payment_method_id: 'pix', // Always PIX for this function
            notification_url: process.env.MERCADOPAGO_WEBHOOK_URL || 'https://zirim.onrender.com/orders/webhook', // Use env var for webhook URL
            date_of_expiration: expirationDate.toISOString(),
            payer: {
                email: userData.email?.endereco || userData.email || "contato@zirim.com",
                first_name: firstName,
                last_name: lastNameParts.join(' ') || 'Zirim',
                identification: {
                    type: 'CPF',
                    number: userData.cpf || "17984881758", // Fallback para CPF de teste
                },
            },
        };

        try {
            const result = await paymentClient.create({ body: payment_data });

            const transactionData = result.point_of_interaction?.transaction_data ?? result.transaction_data ?? {};
            const { qr_code, qr_code_base64 } = transactionData;

            return {
                id: result.id,
                status: result.status,
                status_detail: result.status_detail,
                transaction_amount: result.transaction_amount,
                date_of_expiration: new Date(result.date_of_expiration || expirationDate),
                date_last_updated: result.date_last_updated,
                qr_code,
                qr_code_base64,
            };
        } catch (error) {
            console.error('Erro ao gerar PIX:', error);
            return { error: 'Erro ao gerar PIX: ' + error.message };
        }
    }

    mapStatus(mpStatus) {
        return mapPaymentStatus(mpStatus) || 'pendente';
    }

    async consultarPix(id) {
        if (!id) {
            return { error: 'O campo "id" é obrigatório.' };
        }
        try {
            const paymentId = String(id);
            await this.getCollection().updateOne(
                {
                    $or: [
                        { "payment.id": id },
                        { "payment.id": paymentId },
                        { "payment.id": Number(id) }
                    ]
                },
                { $set: { "payment.lastSyncAttemptAt": new Date() } }
            );
            const paymentInfo = await paymentClient.get({ id });
            if (paymentInfo) {
                await this.sincronizarStatusPedido(paymentInfo);
            }
            return paymentInfo;
        } catch (error) {
            console.error('Erro ao consultar PIX:', error);
            return { error: 'Erro ao consultar PIX' };
        }
    }

    /**
     * Atualiza o status do pedido manualmente (ex: cancelamento via API)
     * @param {string} orderId 
     * @param {string} mpStatus Status bruto do Mercado Pago (ex: 'cancelled')
     */
    async updateOrderStatus(orderId) {
        const order = await this.findById(orderId);
        if (!order) {
            return { error: 'Pedido não encontrado.' };
        }

        const paymentId = order.payment?.id;
        if (!paymentId) {
            return { error: 'Pagamento não associado a este pedido.' };
        }

        const paymentInfo = await paymentClient.get({ id: paymentId });
        await this.sincronizarStatusPedido(paymentInfo);
        return { success: true, status: this.mapStatus(paymentInfo.status) };
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
        const collection = this.getCollection();
        let updatedOrder = null;

        try {
            for (let attempt = 0; attempt < 5; attempt++) {
                const order = await collection.findOne(paymentQuery);
                if (!order) return null;

                const incomingUpdatedAt = Date.parse(paymentInfo.date_last_updated || '');
                const storedUpdatedAt = Date.parse(order.payment?.date_last_updated || '');
                if (Number.isFinite(incomingUpdatedAt) && Number.isFinite(storedUpdatedAt) && incomingUpdatedAt < storedUpdatedAt) {
                    return order;
                }

                const nextOrderStatus = resolveOrderStatus(order.statusInterno, paymentStatus);
                const now = new Date();
                const setFields = {
                    "payment.status": paymentStatus,
                    "payment.status_detail": paymentInfo.status_detail || null,
                    "payment.lastSyncedAt": now,
                    updatedAt: now,
                };

                if (paymentInfo.date_last_updated) {
                    setFields["payment.date_last_updated"] = paymentInfo.date_last_updated;
                }
                if (paymentInfo.date_of_expiration) {
                    setFields["payment.date_of_expiration"] = new Date(paymentInfo.date_of_expiration);
                }
                if (nextOrderStatus !== order.statusInterno) {
                    setFields.statusInterno = nextOrderStatus;
                }

                const transactionData = paymentInfo.point_of_interaction?.transaction_data || {};
                const update = { $set: setFields, $inc: { stateVersion: 1 } };
                if (isTerminalPaymentStatus(paymentStatus)) {
                    update.$unset = { "payment.qr_code": "", "payment.qr_code_base64": "" };
                } else {
                    if (transactionData.qr_code) setFields["payment.qr_code"] = transactionData.qr_code;
                    if (transactionData.qr_code_base64) setFields["payment.qr_code_base64"] = transactionData.qr_code_base64;
                }

                const currentVersion = order.stateVersion;
                const filter = { _id: order._id };
                filter.stateVersion = currentVersion === undefined ? { $exists: false } : currentVersion;
                const result = await collection.updateOne(filter, update);
                if (result.modifiedCount > 0) {
                    updatedOrder = await collection.findOne({ _id: order._id });
                    break;
                }
            }

            if (!updatedOrder) {
                throw new Error(`Não foi possível sincronizar o pagamento ${paymentId} após conflitos concorrentes.`);
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
        const ordersCollection = this.getCollection();
        const reservation = await ordersCollection.updateOne(
            {
                _id: order._id,
                inventoryProcessed: { $ne: true },
                inventoryProcessing: { $ne: true },
                inventoryProcessingFailed: { $ne: true }
            },
            { $set: { inventoryProcessing: true, inventoryProcessingAt: new Date() } }
        );
        if (reservation.modifiedCount === 0) return;

        const productsCollection = this.db.collection("products");
        const bulkOps = order.items.map(item => {
            const elemMatch = {
                estoque: { $gte: Number(item.quantidade || 0) }
            };

            if (item.sku) {
                elemMatch.sku = item.sku;
            } else {
                if (item.cor) {
                    elemMatch.cores = { $in: [item.cor] };
                }
                if (item.tamanho) {
                    elemMatch.tamanhos = { $in: [item.tamanho] };
                }
            }

            return {
                updateOne: {
                    filter: {
                        _id: new ObjectId(item.id),
                        "variacoes": {
                            $elemMatch: elemMatch
                        }
                    },
                    update: {
                        $inc: { "variacoes.$.estoque": -Number(item.quantidade || 0) }
                    }
                }
            };
        });

        const appliedOps = [];
        try {
            for (const operation of bulkOps) {
                const result = await productsCollection.updateOne(
                    operation.updateOne.filter,
                    operation.updateOne.update
                );
                if (result.matchedCount !== 1) {
                    throw new Error(`Estoque insuficiente ou variação indisponível no pedido ${order._id}.`);
                }
                appliedOps.push(operation);
            }

            await ordersCollection.updateOne(
                { _id: order._id, inventoryProcessing: true },
                {
                    $set: {
                        inventoryProcessed: true,
                        inventoryProcessedAt: new Date()
                    },
                    $unset: { inventoryProcessing: "", inventoryProcessingAt: "", inventoryProcessingFailed: "", inventoryProcessingError: "" }
                }
            );
        } catch (error) {
            const rollbackErrors = [];
            for (const operation of appliedOps.reverse()) {
                const rollbackFilter = {
                    ...operation.updateOne.filter,
                    variacoes: {
                        $elemMatch: { ...operation.updateOne.filter.variacoes.$elemMatch }
                    }
                };
                delete rollbackFilter.variacoes.$elemMatch.estoque;

                try {
                    const quantity = Math.abs(operation.updateOne.update.$inc["variacoes.$.estoque"]);
                    const rollbackResult = await productsCollection.updateOne(
                        rollbackFilter,
                        { $inc: { "variacoes.$.estoque": quantity } }
                    );
                    if (rollbackResult.matchedCount !== 1) {
                        throw new Error("A variação não foi encontrada durante a compensação.");
                    }
                } catch (rollbackError) {
                    rollbackErrors.push(rollbackError.message);
                }
            }

            const failureMessage = rollbackErrors.length > 0
                ? `${error.message} Falha ao reverter parte do estoque: ${rollbackErrors.join('; ')}`
                : error.message;
            await ordersCollection.updateOne(
                { _id: order._id, inventoryProcessing: true },
                {
                    $set: {
                        inventoryProcessingFailed: true,
                        inventoryProcessingError: failureMessage,
                        inventoryProcessingFailedAt: new Date()
                    },
                    $unset: { inventoryProcessing: "", inventoryProcessingAt: "" }
                }
            );
            throw error;
        }
    }

    async syncExpiredPendingOrders(userId = null) {
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
                        { "payment.lastSyncAttemptAt": { $exists: false } },
                        { "payment.lastSyncAttemptAt": { $lte: retryCutoff } }
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

        const orders = await this.getCollection().find(query).sort({ createdAt: 1 }).limit(25).toArray();
        let synchronized = 0;
        for (const order of orders) {
            const result = await this.consultarPix(order.payment.id);
            if (!result.error) synchronized++;
        }
        return synchronized;
    }

    /**
     * Atualiza os dados de pagamento e o status interno do pedido
     * @param {string|ObjectId} orderId 
     * @param {object} paymentResult 
     * @param {string} [statusInterno] 
     */
    async updateOrderPayment(orderId, paymentResult, statusInterno) {
        if (!orderId) {
            throw new Error("ID do pedido é obrigatório para atualizar o pagamento.");
        }
        const filter = ObjectId.isValid(orderId) ? { _id: new ObjectId(orderId) } : { _id: orderId };
        const novoStatus = statusInterno || (paymentResult?.status ? this.mapStatus(paymentResult.status) : 'pendente');

        return await this.getCollection().updateOne(
            filter,
            {
                $set: {
                    payment: paymentResult || {},
                    statusInterno: novoStatus,
                    updatedAt: new Date()
                }
            }
        );
    }

    async handleWebhook(req) {
        const { type, data } = req.body;
        const xSignature = req.headers['x-signature'];
        const xRequestId = req.headers['x-request-id'];

        // Validação de Assinatura
        if (xSignature && process.env.MERCADOPAGO_WEBHOOK_SECRET) {
            try {
                const parts = xSignature.split(',');
                const ts = parts.find(p => p.startsWith('ts=')).split('=')[1];
                const hash = parts.find(p => p.startsWith('v1=')).split('=')[1];
                
                const manifest = `id:${data.id};request-id:${xRequestId};ts:${ts};`;
                const hmac = crypto.createHmac('sha256', process.env.MERCADOPAGO_WEBHOOK_SECRET)
                    .update(manifest)
                    .digest('hex');

                if (hmac !== hash) {
                    console.error('Assinatura do webhook inválida!');
                    throw new Error('Invalid signature');
                }
            } catch (err) {
                console.error('Erro ao validar assinatura:', err.message);
                throw err; // Evita o processamento de payloads maliciosos caso a assinatura falhe
            }
        }

        if (type === 'payment' && data && data.id) {
            try {
                const paymentInfo = await this.consultarPix(data.id);
                return paymentInfo;
            } catch (error) {
                console.error('Erro ao processar webhook de pagamento:', error);
                throw error;
            }
        }

        return { message: 'Evento ignorado' };
    }

    async findUserOrders(userId) {
        return await this.getCollection().find({
            $or: [
                { "user._id": userId },
                { "user._id": String(userId) },
                { "user._id": new ObjectId(userId) }
            ]
        }).sort({ createdAt: -1 }).toArray();
    }

    async cancelExpiredOrder(orderId) {
        return await this.getCollection().updateOne(
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

        const salesStats = await this.getCollection().aggregate([
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
        return await this.getCollection().countDocuments({ statusInterno });
    }

    async getPaidOrders() {
        return await this.getCollection().find({ 
            statusInterno: { $in: ['pago', 'preparado', 'em_rota'] } 
        }).sort({ createdAt: -1 }).toArray();
    }

    async getLogisticsDashboardData() {
        const allOrders = await this.getCollection().find({}).sort({ createdAt: -1 }).toArray();
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

    async prepareOrderForDelivery(orderId) {
        if (!orderId || !ObjectId.isValid(orderId)) {
            return { error: "ID de pedido inválido." };
        }

        const order = await this.getCollection().findOne({ _id: new ObjectId(orderId) });
        if (!order) {
            return { error: "Pedido não encontrado." };
        }

        if (order.statusInterno !== "pago" && order.payment?.status !== "approved") {
            return { error: "Apenas pedidos pagos podem ser preparados para entrega." };
        }

        const confirmationCode = order.delivery?.confirmationCodePlain || Math.floor(1000 + Math.random() * 9000).toString();

        await this.getCollection().updateOne(
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

        return {
            success: true,
            message: "Pedido preparado e liberado para entrega!",
            orderId,
            confirmationCode
        };
    }

    async getCourierDeliveries(courierId) {
        const idVariants = ObjectId.isValid(courierId)
            ? [courierId, String(courierId), new ObjectId(courierId)]
            : [courierId, String(courierId)];

        return await this.getCollection().find({
            "delivery.courierId": { $in: idVariants },
            statusInterno: { $in: ["pago", "em_transporte", "em_rota"] }
        }).sort({ updatedAt: -1, createdAt: -1 }).toArray();
    }

    async getAvailableDeliveries() {
        return await this.getCollection().find({
            statusInterno: "preparado",
            $or: [
                { "delivery.courierId": { $exists: false } },
                { "delivery.courierId": null }
            ]
        }).sort({ createdAt: 1 }).toArray();
    }

    async selectOrderForDelivery(orderId, courierUser) {
        if (!orderId || !ObjectId.isValid(orderId)) {
            return { error: "ID de pedido inválido." };
        }

        const courierRole = courierUser.role;
        if (courierRole !== "entregador" && courierRole !== "admin") {
            return { error: "Apenas usuários com perfil de entregador podem aceitar entregas." };
        }

        const courierId = courierUser._id;
        const currentOrder = await this.getCollection().findOne({ _id: new ObjectId(orderId) });
        const confirmationCode = currentOrder?.delivery?.confirmationCodePlain || Math.floor(1000 + Math.random() * 9000).toString();

        // Operação atômica: garante que o pedido está "preparado" e sem entregador associado
        const updateResult = await this.getCollection().findOneAndUpdate(
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
                    "delivery.courierId": courierId,
                    "delivery.courierName": courierUser.name || "Entregador",
                    "delivery.courierPhone": (typeof courierUser.phone === "object" ? courierUser.phone?.number : courierUser.phone) || "",
                    "delivery.confirmationCodePlain": confirmationCode,
                    "delivery.startedAt": new Date(),
                    updatedAt: new Date()
                }
            },
            { returnDocument: "after" }
        );

        const updatedOrder = updateResult?.value ?? updateResult;
        if (!updatedOrder) {
            return { error: "Pedido indisponível: não está pronto para entrega ou já foi aceito por outro entregador." };
        }

        return {
            success: true,
            message: "Pedido selecionado para entrega com sucesso!",
            orderId: updatedOrder._id,
            statusInterno: "em_rota"
        };
    }

    async confirmDelivery(orderId, courierId, code) {
        if (!orderId || !code) {
            return { error: "ID do pedido e código são obrigatórios." };
        }

        const idVariants = ObjectId.isValid(courierId)
            ? [courierId, String(courierId), new ObjectId(courierId)]
            : [courierId, String(courierId)];

        const order = await this.getCollection().findOne({
            _id: new ObjectId(orderId),
            "delivery.courierId": { $in: idVariants }
        });

        if (!order) {
            return { error: "Pedido não encontrado ou não atribuído a você." };
        }

        if (order.statusInterno === "entregue") {
            return { error: "Este pedido já foi finalizado como entregue." };
        }

        const attempts = Number(order.delivery?.attempts || 0);
        if (attempts >= 5) {
            return { error: "Limite de tentativas excedido (5x). Contate a central de suporte." };
        }

        const cleanInput = String(code).trim();
        const expectedCode = order.delivery?.confirmationCodePlain || order.delivery?.confirmationCode;
        const expectedHash = order.delivery?.confirmationCodeHash;

        let isValid = false;
        if (expectedCode && String(expectedCode).trim() === cleanInput) {
            isValid = true;
        } else if (expectedHash) {
            const inputHash = crypto.createHash("sha256").update(cleanInput).digest("hex");
            if (inputHash === expectedHash) {
                isValid = true;
            }
        }

        if (!isValid) {
            const nextAttempts = attempts + 1;
            await this.getCollection().updateOne(
                { _id: order._id },
                { $inc: { "delivery.attempts": 1 } }
            );
            return { error: `Código incorreto. Tentativa ${nextAttempts} de 5.` };
        }

        await this.getCollection().updateOne(
            { _id: order._id },
            {
                $set: { statusInterno: "entregue", "delivery.deliveredAt": new Date(), updatedAt: new Date() },
                $unset: { "delivery.confirmationCodeHash": "", "delivery.confirmationCodePlain": "" }
            }
        );

        return { success: true, message: "Entrega confirmada com sucesso!" };
    }
}