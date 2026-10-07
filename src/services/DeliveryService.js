import { ObjectId } from "mongodb";
import crypto from "crypto";
import OrderRepository from "../repository/OrderRepository.js";
import {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  GeneralError
} from "../utils/handleResponse.js";

/**
 * Camada de serviço de logística e entregas.
 * Desacopla regras de negócio, limites de tentativas e validações do repositório.
 */
export default class DeliveryService {
  constructor(orderRepository = new OrderRepository()) {
    this.repository = orderRepository;
  }

  /**
   * Obtém dados do painel do entregador (entregas ativas do entregador + pedidos disponíveis para retirada)
   */
  async getCourierDashboardData(userId) {
    if (!userId) {
      throw new UnauthorizedError("Sessão expirada. Faça login novamente.");
    }

    const [deliveries, availableOrders] = await Promise.all([
      this.repository.getCourierDeliveries(userId),
      this.repository.getAvailableDeliveries()
    ]);

    return { deliveries, availableOrders };
  }

  /**
   * Obtém pedidos ativos para plotagem no mapa de monitoramento
   */
  async getActiveDeliveriesForMap() {
    return await this.repository.getPaidOrders();
  }

  /**
   * Obtém visão geral para o painel de logística do administrador
   */
  async getLogisticsOverview() {
    return await this.repository.getLogisticsDashboardData();
  }

  /**
   * Prepara um pedido pago para entrega, gerando o PIN de 4 dígitos seguro
   */
  async prepareOrder(orderId, user) {
    if (!user) {
      throw new UnauthorizedError("Usuário não autenticado.");
    }

    if (user.role !== "admin" && user.role !== "staff") {
      throw new GeneralError("Apenas administradores ou equipe de logística podem preparar pedidos.", 403);
    }

    if (!orderId || !ObjectId.isValid(orderId)) {
      throw new ValidationError("ID de pedido inválido.");
    }

    const order = await this.repository.findById(orderId);
    if (!order) {
      throw new NotFoundError("Pedido não encontrado.");
    }

    if (order.statusInterno !== "pago" && order.payment?.status !== "approved") {
      throw new ValidationError("Apenas pedidos com pagamento confirmado podem ser preparados para entrega.");
    }

    // Preserva o código PIN se já existir, ou gera novo de 4 dígitos
    const confirmationCode = order.delivery?.confirmationCodePlain || Math.floor(1000 + Math.random() * 9000).toString();

    await this.repository.getCollection().updateOne(
      { _id: new ObjectId(orderId) },
      {
        $set: {
          statusInterno: "preparado",
          "delivery.confirmationCodePlain": confirmationCode,
          "delivery.preparedAt": new Date(),
          updatedAt: new Date()
        }
      }
    );

    return {
      success: true,
      message: "Pedido preparado e liberado para entrega!",
      orderId,
      confirmationCode
    };
  }

  /**
   * Permite que um entregador aceite um pedido preparado, transicionando para 'em_rota' de forma atômica
   */
  async selectOrderForDelivery(orderId, courierUser) {
    if (!courierUser) {
      throw new UnauthorizedError("Sessão expirada. Faça login novamente.");
    }

    const role = courierUser.role;
    if (role !== "entregador" && role !== "admin") {
      throw new GeneralError("Apenas usuários com perfil de entregador podem aceitar entregas.", 403);
    }

    if (!orderId || !ObjectId.isValid(orderId)) {
      throw new ValidationError("ID de pedido inválido.");
    }

    const currentOrder = await this.repository.findById(orderId);
    if (!currentOrder) {
      throw new NotFoundError("Pedido não encontrado.");
    }

    if (currentOrder.statusInterno !== "preparado") {
      throw new ValidationError("O pedido precisa estar preparado antes de ser aceito para entrega.");
    }

    const confirmationCode = currentOrder.delivery?.confirmationCodePlain || Math.floor(1000 + Math.random() * 9000).toString();
    const courierPhone = (typeof courierUser.phone === "object" ? courierUser.phone?.number : courierUser.phone) || "";

    // Operação atômica que previne race-condition caso 2 entregadores cliquem ao mesmo tempo
    const updateResult = await this.repository.getCollection().findOneAndUpdate(
      {
        _id: new ObjectId(orderId),
        statusInterno: "preparado",
        $or: [
          { "delivery.courierId": { $exists: false } },
          { "delivery.courierId": null }
        ]
      },
      {
        $set: {
          statusInterno: "em_rota",
          "delivery.courierId": courierUser._id,
          "delivery.courierName": courierUser.name || "Entregador",
          "delivery.courierPhone": courierPhone,
          "delivery.confirmationCodePlain": confirmationCode,
          "delivery.startedAt": new Date(),
          updatedAt: new Date()
        }
      },
      { returnDocument: "after" }
    );

    const updatedOrder = updateResult?.value ?? updateResult;
    if (!updatedOrder) {
      throw new ValidationError("Pedido indisponível: já foi aceito por outro entregador ou não está preparado.");
    }

    return {
      success: true,
      message: "Pedido selecionado para entrega com sucesso!",
      orderId: updatedOrder._id,
      statusInterno: "em_rota"
    };
  }

  /**
   * Valida o código PIN fornecido pelo cliente e finaliza a entrega com status 'entregue'
   */
  async confirmDelivery(orderId, courierId, code) {
    if (!orderId || !ObjectId.isValid(orderId)) {
      throw new ValidationError("ID do pedido é obrigatório e deve ser válido.");
    }

    const cleanCode = String(code || "").trim();
    if (!cleanCode) {
      throw new ValidationError("Código PIN é obrigatório.");
    }

    const idVariants = ObjectId.isValid(courierId)
      ? [courierId, String(courierId), new ObjectId(courierId)]
      : [courierId, String(courierId)];

    const order = await this.repository.getCollection().findOne({
      _id: new ObjectId(orderId),
      "delivery.courierId": { $in: idVariants }
    });

    if (!order) {
      throw new NotFoundError("Pedido não encontrado ou não atribuído a você.");
    }

    if (order.statusInterno === "entregue") {
      throw new ValidationError("Este pedido já foi finalizado como entregue.");
    }

    const attempts = Number(order.delivery?.attempts || 0);
    if (attempts >= 5) {
      throw new ValidationError("Limite de tentativas excedido (5x). Contate a central de suporte.");
    }

    const expectedCode = order.delivery?.confirmationCodePlain || order.delivery?.confirmationCode;
    const expectedHash = order.delivery?.confirmationCodeHash;

    let isValid = false;
    if (expectedCode && String(expectedCode).trim() === cleanCode) {
      isValid = true;
    } else if (expectedHash) {
      const inputHash = crypto.createHash("sha256").update(cleanCode).digest("hex");
      if (inputHash === expectedHash) {
        isValid = true;
      }
    }

    if (!isValid) {
      const nextAttempts = attempts + 1;
      await this.repository.getCollection().updateOne(
        { _id: order._id },
        { $inc: { "delivery.attempts": 1 } }
      );
      throw new ValidationError(`Código incorreto. Tentativa ${nextAttempts} de 5.`);
    }

    await this.repository.getCollection().updateOne(
      { _id: order._id },
      {
        $set: {
          statusInterno: "entregue",
          "delivery.deliveredAt": new Date(),
          updatedAt: new Date()
        },
        $unset: {
          "delivery.confirmationCodeHash": "",
          "delivery.confirmationCodePlain": ""
        }
      }
    );

    return {
      success: true,
      message: "Entrega confirmada com sucesso!"
    };
  }
}
