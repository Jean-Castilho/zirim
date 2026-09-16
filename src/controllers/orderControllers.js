import OrderRepository from "../repository/OrderRepository.js";

export default class OrderController {
    constructor() {
        this.repository = new OrderRepository();
    }

    async gerarPix(valor) { /* Lógica Pix */ }
    async consultarPix(id) { /* Lógica Consulta */ }
    async creatOrder(req, res) { /* Lógica Criação */ }
}