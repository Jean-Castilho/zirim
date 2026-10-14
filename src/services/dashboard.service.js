import ProductService from "./product.service.js";
import UserService from "./user.service.js";
import OrderService from "./order.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = 30;
const LATEST_PRODUCTS_LIMIT = 5;

/** Variação de percentual entre o período atual e o anterior (null quando não há base de comparação). */
const percentChange = (current, previous) => {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

/** Forma enxuta de cada produto para a tabela (mesma usada na renderização e na atualização). */
const toDashboardProduct = (product) => {
  const variacoes = Array.isArray(product.variacoes) ? product.variacoes : [];
  const first = variacoes[0] || {};
  return {
    _id: String(product._id),
    nome: product.nome,
    categoria: product.categoria || null,
    imagem: first.imagens?.[0] || null,
    preco: Number(first.preco) || 0,
    ativo: variacoes.some((v) => v.ativo !== false),
  };
};

/**
 * Agrega os indicadores do painel administrativo.
 * `getOverview` alimenta a página; `getStats` alimenta a atualização periódica (JSON).
 */
export default class DashboardService {
  constructor(
    productService = new ProductService(),
    userService = new UserService(),
    orderService = new OrderService()
  ) {
    this.products = productService;
    this.users = userService;
    this.orders = orderService;
  }

  async getStats() {
    const since = new Date(Date.now() - PERIOD_DAYS * DAY_MS);

    const [
      totalProducts,
      activeProducts,
      totalUsers,
      newUsers,
      sales,
      inTransit,
      pendingPreparation,
      latestProducts,
    ] = await Promise.all([
      this.products.countProducts(),
      this.products.countActiveProducts(),
      this.users.countUsers(),
      this.users.countUsersSince(since),
      this.orders.getSalesComparison(PERIOD_DAYS),
      Promise.all([
        this.orders.countByStatus("em_rota"),
        this.orders.countByStatus("em_transporte"),
      ]).then(([rota, transporte]) => rota + transporte),
      this.orders.countByStatus("preparado"),
      this.products.getLatestProducts(LATEST_PRODUCTS_LIMIT),
    ]);

    return {
      totalProducts,
      activeProducts,
      inactiveProducts: Math.max(totalProducts - activeProducts, 0),
      totalUsers,
      newUsers,
      monthlySales: sales.current,
      salesDelta: percentChange(sales.current, sales.previous),
      ordersLastPeriod: sales.ordersCurrent,
      periodDays: PERIOD_DAYS,
      activeDeliveries: inTransit,
      pendingPreparation,
      latestProducts: latestProducts.map(toDashboardProduct),
      updatedAt: new Date().toISOString(),
    };
  }

  async getOverview() {
    return await this.getStats();
  }
}
