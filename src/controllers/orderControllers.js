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
}