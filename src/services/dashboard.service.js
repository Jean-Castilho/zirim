import ProductService from "./product.service.js";
import UserService from "./user.service.js";
import OrderService from "./order.service.js";

/** Agrega os indicadores do painel administrativo. */
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

  async getOverview() {
    const [totalProducts, totalUsers, monthlySales, activeDeliveries, latestProducts] = await Promise.all([
      this.products.countProducts(),
      this.users.countUsers(),
      this.orders.getMonthlySalesVolume(30),
      this.orders.countByStatus("pendente"),
      this.products.getLatestProducts(5),
    ]);

    return { totalProducts, totalUsers, monthlySales, activeDeliveries, latestProducts };
  }
}
