import BaseController from "./BaseController.js";
import UserService from "../services/UserService.js";
import ProductService from "../services/ProductService.js";
import BannerService from "../services/BannerService.js";
import DeliveryService from "../services/DeliveryService.js";
import DashboardService from "../services/DashboardService.js";

/**
 * Painéis administrativos e operacionais (admin / logística / entregador).
 */
export default class AdminPagesController extends BaseController {
  constructor(
    userService = new UserService(),
    productService = new ProductService(),
    bannerService = new BannerService(),
    deliveryService = new DeliveryService(),
    dashboardService = new DashboardService()
  ) {
    super();
    this.users = userService;
    this.products = productService;
    this.banners = bannerService;
    this.delivery = deliveryService;
    this.dashboard = dashboardService;
  }

  async dashboardPage(req, res) {
    const overview = await this.dashboard.getOverview();
    return this.render(req, res, "../pages/admin/dashboard", {
      titulo: "Administração",
      message: "Gerencie as informações da loja",
      ...overview,
    });
  }

  async usersPage(req, res) {
    const users = await this.users.getAllUsers();
    return this.render(req, res, "../pages/admin/users/tabela-users", {
      titulo: "Gestão de Usuários",
      message: "Visualize e gerencie todos os usuários cadastrados",
      users,
    });
  }

  async inventory(req, res) {
    const products = await this.products.getAllProducts();
    return this.render(req, res, "../pages/admin/inventory/tabela-product", {
      titulo: "Gerenciamento de Inventário",
      message: "Controle de estoque e produtos",
      products,
    });
  }

  async addProduct(req, res) {
    return this.render(req, res, "../pages/admin/inventory/add-product", {
      titulo: "Adicionar Produto",
      message: "Cadastre um novo produto no inventário",
    });
  }

  async editProduct(req, res) {
    const product = await this.products.getProductById(req.params.id);
    return this.render(req, res, "../pages/admin/inventory/edit-product", {
      titulo: "Editar Produto",
      message: `Editando: ${product.nome}`,
      product,
    });
  }

  async editHome(req, res) {
    const homePageData = await this.banners.getHomeBanner();
    return this.render(req, res, "../pages/admin/edit-home", {
      titulo: "Editar Página Inicial",
      message: "Personalize o banner principal e os destaques em tempo real.",
      homePageData,
    });
  }

  async deliveryMap(req, res) {
    const activeOrders = await this.delivery.getActiveDeliveriesForMap();
    return this.render(req, res, "../pages/admin/delivery/delivery", {
      titulo: "Monitoramento de Entregas",
      message: "Acompanhe os pedidos ativos no mapa",
      activeOrders,
      mapApiKey: process.env.GOOGLE_API_KEY || "",
    });
  }

  async logistics(req, res) {
    const { orders, stats } = await this.delivery.getLogisticsOverview();
    return this.render(req, res, "../pages/admin/logistica/dashboard-logistica", {
      titulo: "Logística & Pedidos",
      message: "Acompanhamento detalhado da operação de vendas",
      orders,
      stats,
    });
  }

  async courierDashboard(req, res) {
    const user = req.session?.user;
    if (!user) return res.redirect("/login");

    const { deliveries, availableOrders } = await this.delivery.getCourierDashboardData(user._id);
    return this.render(req, res, "../pages/admin/delivery/dashboard", {
      titulo: "Minhas Entregas",
      message: "Entregas atribuídas a você",
      deliveries,
      availableOrders,
    });
  }
}
