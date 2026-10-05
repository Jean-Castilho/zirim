import { ObjectId } from "mongodb";
import { DataBase } from "../config/db.js";
import { MercadoPagoConfig, Payment } from 'mercadopago';
import crypto from 'crypto';

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
                transaction_amount: result.transaction_amount,
                qr_code,
                qr_code_base64,
            };
        } catch (error) {
            console.error('Erro ao gerar PIX:', error);
            return { error: 'Erro ao gerar PIX: ' + error.message };
        }
    }

    mapStatus(mpStatus) {
        const mapping = {
            'pending': 'pendente',
            'approved': 'pago',
            'authorized': 'pago',
            'in_process': 'pendente',
            'rejected': 'cancelado',
            'cancelled': 'cancelado',
            'refunded': 'cancelado',
            'charged_back': 'cancelado'
        };
        return mapping[mpStatus] || 'pendente';
    }

    async consultarPix(id) {
        if (!id) {
            return { error: 'O campo "id" é obrigatório.' };
        }
        try {
            const paymentInfo = await paymentClient.get({ id });
            if (paymentInfo) {
                await this.sincronizarStatusPedido(id, paymentInfo.status);
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
    async updateOrderStatus(orderId, mpStatus) {
        const order = await this.findById(orderId);
        if (!order) {
            return { error: 'Pedido não encontrado.' };
        }

        const paymentId = order.payment?.id;
        if (!paymentId) {
            return { error: 'Pagamento não associado a este pedido.' };
        }

        await this.sincronizarStatusPedido(paymentId, mpStatus);
        return { success: true, status: this.mapStatus(mpStatus) };
    }

    async sincronizarStatusPedido(paymentId, mpStatus) {
        let order = await this.getCollection().findOne({ // Use let to reassign if needed
            $or: [
                { "payment.id": paymentId },
                { "payment.id": Number(paymentId) }
            ]
        });
        if (!order) return;
        try {
            const novoStatus = this.mapStatus(mpStatus);
            
            // Evita processamento redundante se o status não mudou
            const statusInalterado = order.payment?.status === mpStatus && order.statusInterno === novoStatus;
            if (statusInalterado) {
                if (mpStatus === 'approved' && !order.inventoryProcessed) {
                    await this.executarBaixaEstoque(order);
                }
                return;
            }

            // 1. Atualiza status do pedido
            await this.getCollection().updateOne(
                { _id: order._id },
                { 
                    $set: { 
                        "payment.status": mpStatus, 
                        "statusInterno": novoStatus,
                        "updatedAt": new Date() 
                    } 
                }
            );

            // 3. Se aprovado, processa baixa de estoque
            if (mpStatus === 'approved' && !order.inventoryProcessed) {
               await this.executarBaixaEstoque(order);
            }
        } catch (error) {
            console.error(`[sincronizarStatusPedido] Erro ao sincronizar status do pedido ${order._id} (paymentId: ${paymentId}):`, error);
            // Dependendo da política de erro, pode-se relançar, registrar em um sistema de monitoramento, etc.
            throw error; 
        }
    }

    async executarBaixaEstoque(order) {
        // Baixa de estoque otimizada via bulkWrite
        const productsCollection = this.db.collection("products");
        const bulkOps = order.items.map(item => ({
            updateOne: {
                filter: {
                    _id: new ObjectId(item.id),
                    "variacoes": {
                        $elemMatch: {
                            // Assumindo que 'cores' e 'tamanhos' nas variações do produto são arrays de strings
                            // e que item.cor/item.tamanho são strings únicas selecionadas.
                            cores: { $in: [item.cor] }, 
                            tamanhos: { $in: [item.tamanho] },
                            estoque: { $gte: Number(item.quantidade || 0) }
                        }
                    }
                },
                update: {
                    $inc: { "variacoes.$.estoque": -Number(item.quantidade || 0) }
                }
            }
        }));
        if (bulkOps.length > 0) {
            const bulkResult = await productsCollection.bulkWrite(bulkOps);
            
            if (bulkResult.writeErrors && bulkResult.writeErrors.length > 0) {
                console.error(`[executarBaixaEstoque] Erros durante bulkWrite para pedido ${order._id}:`, bulkResult.writeErrors);
                // Considerar como lidar com erros parciais: reverter estoque, marcar pedido como problemático, etc.
                // Por enquanto, apenas logamos e continuamos para marcar o pedido como processado.
                // Uma abordagem mais robusta poderia lançar um erro aqui e impedir o inventoryProcessed.
            }

            // Marca o pedido como processado para evitar múltiplas baixas de estoque
            await this.getCollection().updateOne(
                { _id: order._id },
                { $set: { inventoryProcessed: true } }
            );
        }
    }

    async creatOrder(req, res) {
        try {
            const { user } = req.session;
            if (!user) {
                return res.status(401).send('Usuário não autenticado');
            }
            const validatedItems = await validateCartItems(req.body.items);
            const itemsTotal = validatedItems.reduce((acc, item) => acc + item.preco * Number(item.quantidade), 0);

            const addressData = req.body.address || {};
            const shippingData = req.body.shipping || {};
            const shippingCost = Number(shippingData.cost ?? addressData.shippingCost ?? 0);
            const validShippingCost = (Number.isFinite(shippingCost) && shippingCost > 0) ? shippingCost : 0;
            const totalPrice = itemsTotal + validShippingCost;

            const payloadOrder = {
                user: { 
                    _id: user._id, 
                    name: user.name || 'Cliente Zirim',
                    phone: user.phone?.number || user.phone || 'Não informado',
                    email: user.email?.endereco || user.email || ''
                },
                items: validatedItems,
                address: {
                    cep: addressData.cep || '',
                    street: addressData.street || '',
                    neighborhood: addressData.neighborhood || '',
                    city: addressData.city || '',
                    state: addressData.state || '',
                    complement: addressData.complement || ''
                },
                location: {
                    lat: Number(addressData.lat || -23.5505),
                    lng: Number(addressData.lng || -46.6333)
                },
                shipping: {
                    method: shippingData.method || 'padrao',
                    cost: validShippingCost
                },
                subtotal: itemsTotal,
                total: totalPrice,
                statusInterno: 'pendente', // Inicia como pendente
                createdAt: new Date(),
                inventoryProcessed: false, // Garante que o estoque não foi baixado
                payment: {} // Objeto de pagamento vazio inicialmente
            };

            const orderInsertResult = await this.getCollection().insertOne(payloadOrder);
            const orderId = orderInsertResult.insertedId;

            // 2. Gera o PIX para o pedido recém-criado
            const paymentResult = await this.gerarPix(totalPrice, user);

            if (paymentResult.error) {
                // Se o pagamento falhar, atualiza o status do pedido para cancelado/falha e lança erro
                await this.getCollection().updateOne(
                    { _id: orderId },
                    { $set: { statusInterno: 'pagamento_falhou', "payment.error": paymentResult.error, updatedAt: new Date() } }
                );
                throw new Error(`Erro ao gerar PIX: ${paymentResult.error}`);
            }

            // 3. Atualiza o pedido com os detalhes do pagamento e o status inicial do MP
            await this.getCollection().updateOne(
                { _id: orderId },
                {
                    $set: {
                        "payment": paymentResult,
                        "statusInterno": this.mapStatus(paymentResult.status),
                        "updatedAt": new Date()
                    }
                }
            );

            return res.redirect(`/checkout/${orderId.toString()}`);
        } catch (error) {
            console.error('Erro ao criar pedido:', error);
            return res.status(500).send('Erro ao criar pedido: ' + error.message);
        }
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
            { $set: { statusInterno: 'cancelado', updatedAt: new Date() } }
        );
    }

    async getMonthlySalesVolume(days = 30) {
        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - days);

        const salesStats = await this.getCollection().aggregate([
            {
                $match: {
                    statusInterno: 'pago',
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
        return await this.getCollection().find({ statusInterno: 'pago' }).sort({ createdAt: -1 }).toArray();
    }

    async getLogisticsDashboardData() {
        const allOrders = await this.getCollection().find({}).sort({ createdAt: -1 }).toArray();
        const stats = {
            total: allOrders.length,
            pendente: 0,
            pago: 0,
            cancelado: 0,
            faturamento: 0
        };

        for (let i = 0; i < allOrders.length; i++) {
            const order = allOrders[i];
            const status = order.statusInterno;
            if (status === 'pendente') {
                stats.pendente++;
            } else if (status === 'pago') {
                stats.pago++;
                stats.faturamento += Number(order.payment?.transaction_amount || 0);
            } else if (status === 'cancelado') {
                stats.cancelado++;
            }
        }

        return { orders: allOrders, stats };
    }
}