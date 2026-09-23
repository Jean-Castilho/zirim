import OrderRepository from "../repository/OrderRepository.js";

export default class OrderController {
    constructor() {
        this.repository = new OrderRepository();
    }

    async gerarPix(valor) {
        return await this.repository.gerarPix(valor);
    }

    async consultarPix(id) {
        return await this.repository.consultarPix(id);
    }

    async creatOrder(req, res) {
        return await this.repository.creatOrder(req, res);
    }

    async cancelOrder(req, res, next) {
        try {
            const { id } = req.params;
            const result = await this.repository.updateOrderStatus(id, 'cancelled');
            return res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    }

    async handleWebhook(req, res) {
        try {
            await this.repository.handleWebhook(req);
            return res.status(200).send('OK');
        } catch (error) {
            console.error('Erro no controller de webhook:', error);
            return res.status(500).send('Internal Server Error');
        }
    }
}