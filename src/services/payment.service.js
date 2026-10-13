import OrderRepository from "../repository/order.repository.js";
import * as gateway from "./gateways/mercado-pago.gateway.js";
import { ValidationError, NotFoundError } from "../utils/errors.js";

/**
 * Orquestra gateway de pagamento + persistência do pedido.
 * Todas as falhas são lançadas como erros de domínio (nenhum retorno { error }).
 */
export default class PaymentService {
  constructor(orderRepository = new OrderRepository(), paymentGateway = gateway) {
    this.repository = orderRepository;
    this.gateway = paymentGateway;
  }

  async createPix(amount, payer) {
    if (!amount) throw new ValidationError('O campo "valor" é obrigatório.');
    return await this.gateway.createPixPayment({ amount, payer });
  }

  /** Consulta o pagamento no gateway e sincroniza o pedido. */
  async syncPayment(paymentId) {
    if (!paymentId) throw new ValidationError('O campo "id" é obrigatório.');

    await this.repository.touchPaymentSync(paymentId);
    const paymentInfo = await this.gateway.getPayment(paymentId);
    if (paymentInfo) await this.repository.sincronizarStatusPedido(paymentInfo);
    return paymentInfo;
  }

  /** Versão tolerante: falha de gateway não derruba a página. */
  async trySyncPayment(paymentId) {
    try {
      return await this.syncPayment(paymentId);
    } catch (error) {
      console.error(`Falha ao sincronizar pagamento ${paymentId}:`, error.message);
      return null;
    }
  }

  async syncOrderPayment(orderId) {
    const order = await this.repository.findById(orderId);
    if (!order) throw new NotFoundError("Pedido não encontrado.");
    if (!order.payment?.id) throw new ValidationError("Pagamento não associado a este pedido.");

    const paymentInfo = await this.gateway.getPayment(order.payment.id);
    await this.repository.sincronizarStatusPedido(paymentInfo);
    return { status: this.repository.mapStatus(paymentInfo.status) };
  }

  async syncExpiredPendingOrders(userId = null) {
    const orders = await this.repository.findExpiredPendingOrders(userId);
    let synchronized = 0;
    for (const order of orders) {
      if (await this.trySyncPayment(order.payment.id)) synchronized++;
    }
    return synchronized;
  }

  async handleWebhook({ body, headers }) {
    this.gateway.assertValidWebhookSignature({ body, headers });

    const { type, data } = body || {};
    if (type === "payment" && data?.id) {
      return await this.syncPayment(data.id);
    }
    return { message: "Evento ignorado" };
  }
}
