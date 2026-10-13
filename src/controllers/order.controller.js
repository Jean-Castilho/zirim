import BaseController from "./base.controller.js";
import OrderService from "../services/order.service.js";
import { wantsJson } from "../utils/handle-response.js";

/**
 * Pedidos e pagamentos (checkout, status do PIX e webhook).
 */
export default class OrderController extends BaseController {
    constructor(orderService = new OrderService()) {
        super();
        this.orders = orderService;
    }

    async create(req, res) {
        const { orderId, isGuest } = await this.orders.createOrder(req.session?.user, req.body);

        if (isGuest) {
            const guestOrderIds = req.session.guestOrderIds || [];
            guestOrderIds.push(orderId);
            req.session.guestOrderIds = guestOrderIds.slice(-50);
        }

        const redirectUrl = `/checkout/${orderId}`;
        if (wantsJson(req)) {
            return this.created(res, undefined, { orderId, redirectUrl });
        }
        return res.redirect(redirectUrl);
    }

    async paymentStatus(req, res) {
        const status = await this.orders.getPaymentStatus(req.params.id);
        return this.json(res, status);
    }

    async webhook(req, res) {
        await this.orders.handleWebhook(req);
        return this.text(res, "OK");
    }
}
