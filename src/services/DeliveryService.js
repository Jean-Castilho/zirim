import { ObjectId } from "mongodb";
import crypto from "crypto";
import OrderRepository from "../repository/OrderRepository.js";
import {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from "../utils/errors.js";

const MAX_PIN_ATTEMPTS = 5;
const STAFF_ROLES = ["admin", "staff"];
const COURIER_ROLES = ["entregador", "admin"];

const generatePin = () => Math.floor(1000 + Math.random() * 9000).toString();

const assertOrderId = (orderId, message = "ID de pedido inválido.") => {
  if (!orderId || !ObjectId.isValid(orderId)) throw new ValidationError(message);
};

/**
 * Regras de negócio de logística e entregas.
 * Persistência fica em OrderRepository (primitivas atômicas).
 */
export default class DeliveryService {
  constructor(orderRepository = new OrderRepository()) {
    this.repository = orderRepository;
  }

  async getCourierDashboardData(userId) {
    if (!userId) throw new UnauthorizedError("Sessão expirada. Faça login novamente.");

    const [deliveries, availableOrders] = await Promise.all([
      this.repository.getCourierDeliveries(userId),
      this.repository.getAvailableDeliveries(),
    ]);
    return { deliveries, availableOrders };
  }

  async getActiveDeliveriesForMap() {
    return await this.repository.getPaidOrders();
  }

  async getLogisticsOverview() {
    return await this.repository.getLogisticsDashboardData();
  }

  /** Prepara um pedido pago para entrega e gera/preserva o PIN de 4 dígitos. */
  async prepareOrder(orderId, user) {
    if (!user) throw new UnauthorizedError("Usuário não autenticado.");
    if (!STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenError("Apenas administradores ou equipe de logística podem preparar pedidos.");
    }
    assertOrderId(orderId);

    const order = await this.repository.findById(orderId);
    if (!order) throw new NotFoundError("Pedido não encontrado.");

    if (order.statusInterno !== "pago" && order.payment?.status !== "approved") {
      throw new ValidationError("Apenas pedidos com pagamento confirmado podem ser preparados para entrega.");
    }

    const confirmationCode = order.delivery?.confirmationCodePlain || generatePin();
    await this.repository.markPrepared(orderId, confirmationCode);

    return { message: "Pedido preparado e liberado para entrega!", data: { orderId, confirmationCode } };
  }

  /** Entregador aceita um pedido preparado (transição atômica para 'em_rota'). */
  async selectOrderForDelivery(orderId, courierUser) {
    if (!courierUser) throw new UnauthorizedError("Sessão expirada. Faça login novamente.");
    if (!COURIER_ROLES.includes(courierUser.role)) {
      throw new ForbiddenError("Apenas usuários com perfil de entregador podem aceitar entregas.");
    }
    assertOrderId(orderId);

    const currentOrder = await this.repository.findById(orderId);
    if (!currentOrder) throw new NotFoundError("Pedido não encontrado.");
    if (currentOrder.statusInterno !== "preparado") {
      throw new ValidationError("O pedido precisa estar preparado antes de ser aceito para entrega.");
    }

    const confirmationCode = currentOrder.delivery?.confirmationCodePlain || generatePin();
    const phone = (typeof courierUser.phone === "object" ? courierUser.phone?.number : courierUser.phone) || "";

    const updated = await this.repository.claimForCourier(
      orderId,
      { id: courierUser._id, name: courierUser.name || "Entregador", phone },
      confirmationCode
    );
    if (!updated) {
      throw new ValidationError("Pedido indisponível: já foi aceito por outro entregador ou não está preparado.");
    }

    return {
      message: "Pedido selecionado para entrega com sucesso!",
      data: { orderId: updated._id, statusInterno: "em_rota" },
    };
  }

  /** Valida o PIN informado pelo cliente e finaliza a entrega. */
  async confirmDelivery(orderId, courierId, code) {
    assertOrderId(orderId, "ID do pedido é obrigatório e deve ser válido.");

    const cleanCode = String(code || "").trim();
    if (!cleanCode) throw new ValidationError("Código PIN é obrigatório.");

    const order = await this.repository.findCourierOrder(orderId, courierId);
    if (!order) throw new NotFoundError("Pedido não encontrado ou não atribuído a você.");
    if (order.statusInterno === "entregue") {
      throw new ValidationError("Este pedido já foi finalizado como entregue.");
    }

    const attempts = Number(order.delivery?.attempts || 0);
    if (attempts >= MAX_PIN_ATTEMPTS) {
      throw new ValidationError(`Limite de tentativas excedido (${MAX_PIN_ATTEMPTS}x). Contate a central de suporte.`);
    }

    if (!this.#isPinValid(order.delivery, cleanCode)) {
      await this.repository.incrementDeliveryAttempts(order._id);
      throw new ValidationError(`Código incorreto. Tentativa ${attempts + 1} de ${MAX_PIN_ATTEMPTS}.`);
    }

    await this.repository.markDelivered(order._id);
    return { message: "Entrega confirmada com sucesso!" };
  }

  #isPinValid(delivery = {}, inputCode) {
    const expectedCode = delivery.confirmationCodePlain || delivery.confirmationCode;
    if (expectedCode && String(expectedCode).trim() === inputCode) return true;

    if (delivery.confirmationCodeHash) {
      const inputHash = crypto.createHash("sha256").update(inputCode).digest("hex");
      return inputHash === delivery.confirmationCodeHash;
    }
    return false;
  }
}
