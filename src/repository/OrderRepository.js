import { ObjectId } from "mongodb";
import { DataBase } from "../config/db.js";
import { MercadoPagoConfig, Payment } from 'mercadopago';
import crypto from 'crypto';

import BaseRepository from "./BaseRepository.js";
import { validateCartItems } from "../services/orderService.js";

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
        
        const payment_data = {
            transaction_amount: parseFloat(valorInteiro),
            description: 'Pagamento PIX - Zirim Store',
            payment_method_id: 'pix',
            notification_url: 'https://zirim.onrender.com/orders/webhook',
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

    async sincronizarStatusPedido(paymentId, mpStatus) {
        const order = await this.getCollection().findOne({
            $or: [
                { "payment.id": paymentId },
                { "payment.id": Number(paymentId) }
            ]
        });

        if (!order) return;

        const novoStatus = this.mapStatus(mpStatus);
        
        // Evita processamento redundante se o status não mudou
        if (order.payment && order.payment.status === mpStatus && order.statusInterno === novoStatus) {
             // Se for aprovado, garantimos que a baixa de estoque foi feita (pode ter falhado antes)
             if (mpStatus === 'approved') {
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

        // 2. Atualiza status no perfil do usuário
        if (order.user && order.user._id) {
            const usersCollection = this.db.collection("users");
            
            // Query flexível para ID do usuário (string ou ObjectId)
            const userQuery = ObjectId.isValid(order.user._id)
                ? { $or: [{ _id: new ObjectId(order.user._id) }, { _id: String(order.user._id) }] }
                : { _id: String(order.user._id) };

            await usersCollection.updateOne(
                { ...userQuery, "orderns._id": order._id },
                { $set: { "orderns.$.status": novoStatus } }
            );
        }

        // 3. Se aprovado, processa baixa de estoque
        if (mpStatus === 'approved') {
            await this.executarBaixaEstoque(order);
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
                            cores: item.cor || '',
                            tamanhos: item.tamanho || ''
                        }
                    }
                },
                update: {
                    $inc: { "variacoes.$.estoque": -Number(item.quantidade || 0) }
                }
            }
        }));

        if (bulkOps.length > 0) {
            await productsCollection.bulkWrite(bulkOps);
        }
    }

    async creatOrder(req, res) {
        try {
            const { user } = req.session;
            if (!user) {
                return res.status(401).send('Usuário não autenticado');
            }

            const validatedItems = await validateCartItems(req.body.items);
            const totalPrice = validatedItems.reduce((acc, item) => acc + item.preco * Number(item.quantidade), 0);

            const paymentResult = await this.gerarPix(totalPrice, user);

            if (paymentResult.error) {
                throw new Error(paymentResult.error);
            }

            const payloadOrder = {
                user: { _id: user._id, phone: user.phone },
                payment: paymentResult,
                items: validatedItems,
                statusInterno: this.mapStatus(paymentResult.status),
                createdAt: new Date()
            };

            const orderCreat = await this.getCollection().insertOne(payloadOrder);

            // Atualiza o perfil do usuário vinculando a nova ordem
            const usersCollection = this.db.collection("users");
            
            // Query flexível para ID do usuário (string ou ObjectId)
            const userQuery = ObjectId.isValid(user._id)
                ? { $or: [{ _id: new ObjectId(user._id) }, { _id: String(user._id) }] }
                : { _id: String(user._id) };

            await usersCollection.updateOne(
                userQuery,
                { 
                    $push: { 
                        orderns: {
                            _id: orderCreat.insertedId,
                            status: payloadOrder.statusInterno,
                            total: totalPrice,
                            createdAt: payloadOrder.createdAt
                        }
                    }
                }
            );

            return res.redirect(`/checkout/${orderCreat.insertedId.toString()}`);
        } catch (error) {
            console.error('Erro ao criar pedido:', error);
            return res.status(500).send('Erro ao criar pedido: ' + error.message);
        }
    }

    async handleWebhook(req) {
        const { type, data } = req.body;
        const xSignature = req.headers['x-signature'];
        const xRequestId = req.headers['x-request-id'];

        console.log('Webhook recebido:', { type, data, xSignature });

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
                // Em produção, você pode querer lançar erro ou apenas logar
            }
        }

        if (type === 'payment' && data && data.id) {
            try {
                const paymentInfo = await this.consultarPix(data.id);
                console.log(`Pagamento ${data.id} processado via webhook. Status: ${paymentInfo.status}`);
                return paymentInfo;
            } catch (error) {
                console.error('Erro ao processar webhook de pagamento:', error);
                throw error;
            }
        }

        return { message: 'Evento ignorado' };
    }

}