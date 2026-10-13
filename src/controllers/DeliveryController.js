import BaseController from "./BaseController.js";
import DeliveryService from "../services/DeliveryService.js";

/**
 * Ações de entrega (preparar, aceitar e confirmar com PIN).
 * O pedido pode vir validado (req.validated), no body ou na rota.
 */
export default class DeliveryController extends BaseController {
    constructor(deliveryService = new DeliveryService()) {
        super();
        this.delivery = deliveryService;
    }

    #orderId(req) {
        return req.validated?.orderId || req.body?.orderId || req.params?.id;
    }

    async prepare(req, res) {
        const { message, data } = await this.delivery.prepareOrder(this.#orderId(req), req.session?.user);
        return this.ok(res, message, data);
    }

    async select(req, res) {
        const { message, data } = await this.delivery.selectOrderForDelivery(this.#orderId(req), req.session?.user);
        return this.ok(res, message, data);
    }

    async confirm(req, res) {
        const code = req.validated?.code || req.body?.code;
        const { message } = await this.delivery.confirmDelivery(this.#orderId(req), req.session?.user?._id, code);
        return this.ok(res, message);
    }
}
