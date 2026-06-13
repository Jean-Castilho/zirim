import { consultarPix, gerarPix } from "../services/paymentService.js";
import { validateOrderItems } from "../services/orderService.js"
import { getDataBase } from "../config/db.js";

export default class OrdertController {
    getSelection() {
        const db = getDataBase();
        return db.collection("orders")
    }

    async creatOrder(req, res) {

        const validatedItems = await validateOrderItems(req.body.items);
        const { _id, phone } = req.session.user;
        const totalPrice = validatedItems.reduce((acc, item) => acc + item.preco * Number(item.quantidade), 0);
        const number = phone.number;
        const data = await gerarPix(totalPrice);

        const payloadOrder = {
            user: { _id, number },
            payment: data,
            items: validatedItems,
            createdAt: new Date()
        };

        const orderCreat = await this.getCollection().insertOne(payloadOrder);

        return res.redirect(`/checkout/${orderCreat.insertedId.toString()}`);
    };

    async getPaymentbyId(req, res) {
        const { id } = req.query

        if (!id) {
            return res.status(400).json({ error: 'ID de pagamento obrigatório.' })
        }

        const pagamento = await consultarPix(id)

        if (pagamento.error) {
            return res.status(500).json({ error: pagamento.error || 'Erro ao consultar pagamento.' })
        }

        return res.json({
            status: pagamento.status,
            id: pagamento.id,
            transaction_amount: pagamento.transaction_amount,
            status_detail: pagamento.status_detail || null,
        })
    }

    async Status(req, res) {
        const { id } = req.query

        if (!id) {
            return res.status(400).json({ error: 'ID de pagamento obrigatório.' })
        }

        const pagamento = await consultarPix(id);

        if (pagamento.error) {
            return res.status(500).json({ error: pagamento.error || 'Erro ao consultar pagamento.' })
        }

        return res.json({
            status: pagamento.status,
            id: pagamento.id,
            transaction_amount: pagamento.transaction_amount,
            status_detail: pagamento.status_detail || null,
        })
    }

}
