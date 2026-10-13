import { ObjectId } from "mongodb";
import ProductRepository from "../repository/ProductRepository.js";
import OrderRepository from "../repository/OrderRepository.js";
import PaymentService from "./PaymentService.js";
import { ValidationError, NotFoundError } from "../utils/errors.js";

const SHIPPING_PRICES = { padrao: 0, expresso: 14.9 };
const REFRESHABLE_STATUSES = ["pendente", "cancelado", "expirado"];

const variationLabel = (item) => `Cor: ${item.cor || "N/A"}, Tamanho: ${item.tamanho || "N/A"}`;

export default class OrderService {
  constructor(
    orderRepository = new OrderRepository(),
    productRepository = new ProductRepository(),
    paymentService = new PaymentService(orderRepository)
  ) {
    this.repository = orderRepository;
    this.productRepository = productRepository;
    this.payments = paymentService;
  }

  // ------------------------------------------------------------------
  // Carrinho
  // ------------------------------------------------------------------

  #normalizeCartItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError("O carrinho está vazio ou os itens não foram enviados corretamente.");
    }

    const normalized = items.map((item) => {
      if (!item?.id) {
        throw new ValidationError("Cada item do carrinho precisa ter um identificador válido.");
      }

      const quantity = Number(item.quantity ?? 0);
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        throw new ValidationError(`A quantidade do produto ${item.id} é inválida.`);
      }

      return {
        ...item,
        id: String(item.id),
        quantity,
        cor: item.cor ? String(item.cor).trim() : "",
        tamanho: item.tamanho ? String(item.tamanho).trim() : "",
      };
    });

    // Consolida itens repetidos (mesmo produto/cor/tamanho)
    const grouped = new Map();
    for (const item of normalized) {
      const key = JSON.stringify([item.id, item.cor, item.tamanho]);
      const existing = grouped.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        if (!Number.isSafeInteger(existing.quantity)) {
          throw new ValidationError(`A quantidade do produto ${item.id} excede o limite permitido.`);
        }
      } else {
        grouped.set(key, { ...item });
      }
    }
    return [...grouped.values()];
  }

  async validateCartItems(items) {
    const cartItems = this.#normalizeCartItems(items);

    const validObjectIds = cartItems
      .map((item) => item.id)
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    const products = await this.productRepository.findAll({ _id: { $in: validObjectIds } });
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const notFound = cartItems.filter((item) => !productMap.has(item.id)).map((item) => item.id);
    if (notFound.length > 0) {
      throw new NotFoundError(`Os seguintes produtos não foram encontrados: ${notFound.join(", ")}`);
    }

    return cartItems.map((cartItem) => {
      const product = productMap.get(cartItem.id);

      const variation = product.variacoes?.find((v) => {
        const matchColor = !cartItem.cor || v.cores?.some((c) => c.trim() === cartItem.cor);
        const matchSize = !cartItem.tamanho || v.tamanhos?.some((s) => String(s).trim() === cartItem.tamanho);
        return matchColor && matchSize;
      });

      if (!variation) {
        throw new ValidationError(`Variação do produto ${product.nome} (${variationLabel(cartItem)}) não encontrada.`);
      }
      if (variation.estoque < cartItem.quantity) {
        throw new ValidationError(
          `Estoque insuficiente para o produto ${product.nome} (${variationLabel(cartItem)}). ` +
          `Disponível: ${variation.estoque}, Solicitado: ${cartItem.quantity}.`
        );
      }

      const imagem = variation.imagens?.[0]
        || product.variacoes?.find((v) => v.imagens?.length > 0)?.imagens?.[0]
        || "default-product.png";

      return {
        id: product._id,
        nome: product.nome,
        preco: variation.preco,
        imagem,
        quantidade: cartItem.quantity,
        garantia: product.garantia || null,
        cor: cartItem.cor,
        tamanho: cartItem.tamanho,
        sku: variation.sku || null,
      };
    });
  }

  // ------------------------------------------------------------------
  // Criação de pedido
  // ------------------------------------------------------------------

  /** Resolve o comprador: usuário logado ou convidado (checkout temporário). */
  #resolveBuyer(sessionUser, guestCustomer = {}) {
    if (sessionUser) return { buyer: sessionUser, isGuest: false };

    const name = typeof guestCustomer.name === "string" ? guestCustomer.name.trim() : "";
    const email = typeof guestCustomer.email === "string" ? guestCustomer.email.trim() : "";
    if (!name || !email) {
      throw new ValidationError("Informe nome e e-mail para concluir a compra temporária.");
    }

    return {
      isGuest: true,
      buyer: {
        _id: new ObjectId(),
        name,
        email,
        phone: guestCustomer.phone?.trim?.() || "Não informado",
        isGuest: true,
      },
    };
  }

  /**
   * Cria o pedido e gera o PIX. Retorna { orderId, isGuest }.
   */
  async createOrder(sessionUser, orderData = {}) {
    const { buyer, isGuest } = this.#resolveBuyer(sessionUser, orderData.customer);

    const items = await this.validateCartItems(orderData.items);
    const subtotal = items.reduce((acc, item) => acc + item.preco * Number(item.quantidade), 0);

    const address = orderData.address || {};
    const shippingMethod = String(orderData.shipping?.method || "padrao");
    if (!Object.hasOwn(SHIPPING_PRICES, shippingMethod)) {
      throw new ValidationError("Método de entrega inválido.");
    }
    const shippingCost = SHIPPING_PRICES[shippingMethod];
    const total = subtotal + shippingCost;

    const orderId = await this.repository.create({
      user: {
        _id: buyer._id,
        name: buyer.name || "Cliente Zirim",
        phone: buyer.phone?.number || buyer.phone || "Não informado",
        email: buyer.email?.endereco || buyer.email || "",
      },
      items,
      address: {
        cep: address.cep || "",
        street: address.street || "",
        neighborhood: address.neighborhood || "",
        city: address.city || "",
        state: address.state || "",
        complement: address.complement || "",
      },
      location: {
        lat: Number(address.lat || -23.5505),
        lng: Number(address.lng || -46.6333),
      },
      shipping: { method: shippingMethod, cost: shippingCost },
      subtotal,
      total,
      statusInterno: "pendente",
      createdAt: new Date(),
      stateVersion: 0,
      inventoryProcessed: false,
      payment: {},
    });

    try {
      const payment = await this.payments.createPix(total, buyer);
      await this.repository.updateOrderPayment(orderId, payment, this.repository.mapStatus(payment.status));
    } catch (error) {
      await this.repository.updateOrderPayment(orderId, { error: error.message }, "pagamento_falhou");
      throw error;
    }

    return { orderId: orderId.toString(), isGuest };
  }

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------

  /** Status de pagamento (sincroniza com o gateway). */
  async getPaymentStatus(paymentId) {
    if (!paymentId || paymentId === "undefined" || paymentId === "null") {
      throw new ValidationError("ID de pagamento obrigatório.");
    }

    const payment = await this.payments.syncPayment(paymentId);
    return {
      status: payment.status,
      id: payment.id,
      transaction_amount: payment.transaction_amount,
      status_detail: payment.status_detail || null,
    };
  }

  /**
   * Pedido para a página de checkout, respeitando a posse (dono, admin ou convidado).
   * Falhas de autorização retornam 404 para não revelar a existência do pedido.
   */
  async getCheckoutOrder(orderId, session) {
    let order = await this.repository.findById(orderId);
    if (!order) throw new NotFoundError("Pedido não encontrado.");

    const sessionUser = session?.user;
    const ownsOrder = sessionUser && String(order.user?._id) === String(sessionUser._id);
    const isAdmin = sessionUser?.role === "admin";
    const ownsGuestOrder = session?.guestOrderIds?.includes(String(order._id));
    if (!ownsOrder && !isAdmin && !ownsGuestOrder) {
      throw new NotFoundError("Pedido não encontrado.");
    }

    if (order.payment?.id && REFRESHABLE_STATUSES.includes(order.statusInterno)) {
      await this.payments.trySyncPayment(order.payment.id);
      order = await this.repository.findById(orderId);
    }

    return order;
  }

  /** Pedidos do usuário no formato resumido usado no perfil. */
  async getUserOrderSummaries(userId) {
    await this.payments.syncExpiredPendingOrders(userId);
    const orders = await this.repository.findUserOrders(userId);

    return orders.map((o) => ({
      _id: o._id,
      status: o.statusInterno || "pendente",
      total: o.payment?.transaction_amount || 0,
      createdAt: o.createdAt,
      delivery: o.delivery || null,
    }));
  }

  // ------------------------------------------------------------------
  // Pagamento / Webhook / Métricas
  // ------------------------------------------------------------------

  async syncOrderPayment(orderId) {
    return await this.payments.syncOrderPayment(orderId);
  }

  async handleWebhook(req) {
    return await this.payments.handleWebhook({ body: req.body, headers: req.headers });
  }

  async getMonthlySalesVolume(days = 30) {
    return await this.repository.getMonthlySalesVolume(days);
  }

  async countByStatus(status) {
    return await this.repository.countByStatus(status);
  }
}
