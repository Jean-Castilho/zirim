import OrderRepository from "../repository/OrderRepository.js";

export default class OrderController {
    constructor() {
        this.repository = new OrderRepository();
    }

}