import { DataBase } from "../config/db.js";

import BaseRepository from "./BaseRepository.js";

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

    async gerarPix(valor) {
        if (!valor) {
            return { mensagem: 'O campo "valor" é obrigatório.' };
        }

        const data = { email: "jeancastilho646@gmail.com", nome: "jean", sobrenome: "castilho", cpf: 17984881758 };
        const valorInteiro = parseFloat(valor).toFixed(2);
        const payment_data = {
            transaction_amount: parseFloat(valorInteiro),
            description: 'Pagamento PIX',
            payment_method_id: 'pix',
            payer: {
                email: data.email,
                first_name: data.nome,
                last_name: data.sobrenome,
                identification: {
                    type: 'CPF',
                    number: data.cpf,
                },
            },
        };

        try {
            const payment = new Payment(client);
            const result = await payment.create({ body: payment_data });

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
            return { error: 'Erro ao gerar PIX' };
        }
    }

    async consultarPix(id) {
        if (!id) {
            return { mensagem: 'O campo "id" é obrigatório.' };
        }

        try {
            const payment = new Payment(client);
            const paymentInfo = await payment.get({ id });
            return paymentInfo;
        } catch (error) {
            console.error('Erro ao consultar PIX:', error);
            return { error: 'Erro ao consultar PIX' };
        }
    }

    async creatOrder(req, res) {
        try {
            const validatedItems = await validateCartItems(req.body.items);
            const { _id, phone } = req.session.user;
            const totalPrice = validatedItems.reduce((acc, item) => acc + item.preco * Number(item.quantidade), 0);

            const data = await this.gerarPix(totalPrice);

            const payloadOrder = {
                user: { _id, phone },
                payment: data,
                items: validatedItems,
                createdAt: new Date()
            };

            const orderCreat = await this.getCollection().insertOne(payloadOrder);
            return res.redirect(`/checkout/${orderCreat.insertedId.toString()}`);
        } catch (error) {
            console.error('Erro ao criar pedido:', error);
            return res.status(500).send('Erro ao criar pedido');
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