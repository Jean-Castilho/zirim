import { ObjectId } from "mongodb";
import { DataBase } from "../config/db.js";
import { MercadoPagoConfig, Payment } from 'mercadopago';

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

    async consultarPix(id) {
        if (!id) {
            return { error: 'O campo "id" é obrigatório.' };
        }

        try {
            const paymentInfo = await paymentClient.get({ id });

            if (paymentInfo && paymentInfo.status === 'approved') {
                await this.processarBaixaEstoque(id);
            }

            return paymentInfo;
        } catch (error) {
            console.error('Erro ao consultar PIX:', error);
            return { error: 'Erro ao consultar PIX' };
        }
    }

    async processarBaixaEstoque(paymentId) {
        const order = await this.getCollection().findOne({
            $or: [
                { "payment.id": paymentId },
                { "payment.id": Number(paymentId) }
            ],
            "payment.status": { $ne: "approved" }
        });

        if (!order) return; 

        // 1. Atualiza status do pedido
        await this.getCollection().updateOne(
            { _id: order._id },
            { $set: { "payment.status": "approved", "updatedAt": new Date() } }
        );

        // 2. Baixa de estoque otimizada via bulkWrite
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
                createdAt: new Date()
            };

            const orderCreat = await this.getCollection().insertOne(payloadOrder);
            return res.redirect(`/checkout/${orderCreat.insertedId.toString()}`);
        } catch (error) {
            console.error('Erro ao criar pedido:', error);
            return res.status(500).send('Erro ao criar pedido: ' + error.message);
        }
    }

    async getPaymentbyId(req, res) {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({ error: 'ID de pagamento obrigatório.' });
        }

        const pagamento = await this.consultarPix(id);

        if (pagamento.error) {
            return res.status(500).json({ error: pagamento.error || 'Erro ao consultar pagamento.' });
        }

        return res.json(pagamento);
    }

}