import { ObjectId } from "mongodb";
import crypto from "crypto";
import OrderRepository from "../repository/order.repository.js";
import UserRepository from "../repository/user.repository.js";
import {
  toAvailableView,
  toAssignedView,
  toHistoryView,
  toMapView,
  toPreparationView,
} from "../utils/delivery-views.js";
import {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from "../utils/errors.js";

const MAX_PIN_ATTEMPTS = 5;
const STAFF_ROLES = ["admin", "staff"];
// Papel de entregador é exclusivo: admin não aceita, libera nem confirma entregas.
const COURIER_ROLES = ["entregador"];

const generatePin = () => Math.floor(1000 + Math.random() * 9000).toString();

const assertOrderId = (orderId, message = "ID de pedido inválido.") => {
  if (!orderId || !ObjectId.isValid(orderId)) throw new ValidationError(message);
};

/** Separação de funções: quem preparou o pedido não pode aceitá-lo nem confirmar a entrega. */
const assertNotPreparer = (order, userId) => {
  if (order.delivery?.preparedBy && String(order.delivery.preparedBy) === String(userId)) {
    throw new ForbiddenError("Quem preparou o pedido não pode aceitar nem entregar este mesmo pedido.");
  }
};

/**
 * Regras de negócio de logística e entregas.
 * Persistência fica em OrderRepository (primitivas atômicas).
 */
export default class DeliveryService {
  constructor(orderRepository = new OrderRepository(), userRepository = new UserRepository()) {
    this.repository = orderRepository;
    this.users = userRepository;
  }

  /** Painel do entregador: cada lista recebe só a visão que pode ver. */
  async getCourierDashboardData(userId) {
    if (!userId) throw new UnauthorizedError("Sessão expirada. Faça login novamente.");

    const [deliveries, availableOrders, history] = await Promise.all([
      this.repository.getCourierDeliveries(userId),
      this.repository.getAvailableDeliveries(),
      this.repository.getCourierHistory(userId),
    ]);
    return {
      deliveries: deliveries.map(toAssignedView),
      availableOrders: availableOrders.map(toAvailableView),
      history: history.map(toHistoryView),
    };
  }

  /** Mapa: admin vê todos os pedidos ativos; entregador vê disponíveis (sem dados pessoais) e os próprios. */
  async getActiveDeliveriesForMap(user) {
    if (!user) throw new UnauthorizedError("Sessão expirada. Faça login novamente.");

    const orders = user.role === "admin"
      ? await this.repository.getMapOrdersForAdmin()
      : await this.repository.getMapOrdersForCourier(user._id);

    return orders.map((order) => toMapView(order, user)).filter(Boolean);
  }

  /** Painel de preparo: pedidos pagos com os itens a separar. Só admin. */
  async getPreparationPanel(user) {
    if (!user) throw new UnauthorizedError("Sessão expirada. Faça login novamente.");
    if (user.role !== "admin") throw new ForbiddenError("Apenas administradores acessam o painel de preparo.");
    const orders = await this.repository.getOrdersToPrepare();
    return orders.map(toPreparationView);
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

    // O PIN fica só no pedido (o cliente o vê no checkout). Quem prepara não o recebe de volta.
    const confirmationCode = order.delivery?.confirmationCodePlain || generatePin();
    await this.repository.markPrepared(orderId, confirmationCode, user._id);

    return { message: "Pedido preparado e liberado para entrega!", data: { orderId, statusInterno: "preparado" } };
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
    assertNotPreparer(currentOrder, courierUser._id);

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

  /** Entregador libera um pedido que aceitou: volta para 'preparado', sem entregador, com o mesmo PIN. */
  async releaseOrder(orderId, courierUser) {
    if (!courierUser) throw new UnauthorizedError("Sessão expirada. Faça login novamente.");
    if (!COURIER_ROLES.includes(courierUser.role)) {
      throw new ForbiddenError("Apenas entregadores podem liberar pedidos.");
    }
    assertOrderId(orderId);

    const order = await this.repository.findCourierOrder(orderId, courierUser._id);
    if (!order) throw new NotFoundError("Pedido não encontrado ou não atribuído a você.");
    if (order.statusInterno !== "em_rota") {
      throw new ValidationError("Só é possível liberar pedidos que estão em rota.");
    }

    const released = await this.repository.releaseOrder(orderId, courierUser._id);
    if (!released) {
      throw new ValidationError("O pedido foi alterado por outra ação. Atualize a página.");
    }

    return {
      message: "Pedido liberado. Ele voltou para a lista de disponíveis.",
      data: { orderId, statusInterno: "preparado" },
    };
  }

  /** Admin atribui um pedido preparado ou em rota a um entregador. */
  async reassignOrder(orderId, adminUser, courierId) {
    if (!adminUser) throw new UnauthorizedError("Sessão expirada. Faça login novamente.");
    if (adminUser.role !== "admin") {
      throw new ForbiddenError("Apenas administradores podem reatribuir pedidos.");
    }
    assertOrderId(orderId);
    assertOrderId(courierId, "ID do entregador inválido.");

    const courier = await this.users.findById(courierId, { password: 0 });
    if (!courier || courier.role !== "entregador") {
      throw new ValidationError("O usuário informado não é um entregador.");
    }

    const order = await this.repository.findById(orderId);
    if (!order) throw new NotFoundError("Pedido não encontrado.");
    if (!["preparado", "em_rota"].includes(order.statusInterno)) {
      throw new ValidationError("Só é possível reatribuir pedidos preparados ou em rota.");
    }

    const phone = (typeof courier.phone === "object" ? courier.phone?.number : courier.phone) || "";
    const updated = await this.repository.reassignOrder(orderId, {
      id: courier._id,
      name: courier.name || "Entregador",
      phone,
    });
    if (!updated) {
      throw new ValidationError("O pedido foi alterado por outra ação. Atualize a página.");
    }

    return {
      message: `Pedido reatribuído para ${courier.name || "o entregador"}.`,
      data: { orderId, courierId: String(courier._id), statusInterno: "em_rota" },
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
    assertNotPreparer(order, courierId);

    // A tentativa é reservada antes de conferir o PIN: requisições paralelas não burlam o limite.
    const attemptNumber = await this.repository.reserveDeliveryAttempt(order._id, MAX_PIN_ATTEMPTS);
    if (attemptNumber === null) {
      throw new ValidationError(`Limite de tentativas excedido (${MAX_PIN_ATTEMPTS}x). Contate a central de suporte.`);
    }

    if (!this.#isPinValid(order.delivery, cleanCode)) {
      throw new ValidationError(`Código incorreto. Tentativa ${attemptNumber} de ${MAX_PIN_ATTEMPTS}.`);
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
