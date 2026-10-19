import BaseController from "./base.controller.js";
import ProductService from "../services/product.service.js";
import BannerService from "../services/banner.service.js";
import OrderService from "../services/order.service.js";

/**
 * Páginas públicas da loja (somente renderização: dados vêm dos services).
 */
export default class PublicPagesController extends BaseController {
  constructor(
    productService = new ProductService(),
    bannerService = new BannerService(),
    orderService = new OrderService()
  ) {
    super();
    this.products = productService;
    this.banners = bannerService;
    this.orders = orderService;
  }

  async home(req, res) {
    const [products, homePageData] = await Promise.all([
      this.products.listProductsForHome(),
      this.banners.getHomeBanner(),
    ]);

    return this.render(req, res, "../pages/public/home", {
      titulo: "Moda e Calçados",
      message: "Bem-vindo à Zirim, a sua loja de roupas e calçados!",
      products,
      banner: homePageData?.banner,
    });
  }

  async productList(req, res) {
    const products = await this.products.searchProducts(req.query);
    return this.render(req, res, "../pages/public/products", {
      titulo: "Produtos",
      message: "Confira nossos produtos!",
      products,
      // Estado da busca vai para a view: o campo e o filtro sobrevivem a recarregar a página
      query: String(req.query.q || "").slice(0, 100),
      category: String(req.query.category || ""),
    });
  }

  async productDetails(req, res) {
    const product = await this.products.getVisibleProductById(req.params.id);
    return this.render(req, res, "../pages/public/product-details", {
      titulo: "Carregando Produto...",
      product: { _id: product._id },
    });
  }

  async contact(req, res) {
    return this.render(req, res, "../pages/public/contact", {
      titulo: "Contato",
      message: "Entre em contato conosco!",
    });
  }

  async favorites(req, res) {
    return this.render(req, res, "../pages/public/favorites", {
      titulo: "Favoritos",
      message: "Seus itens favoritos!",
    });
  }

  async cart(req, res) {
    return this.render(req, res, "../pages/public/cart", {
      titulo: "Meu Carrinho",
      message: "Seu carrinho de compras!",
      mapApiKey: process.env.GOOGLE_API_KEY || "",
    });
  }

  /** Lista de pedidos de convidado (os dados vêm do navegador, via orders.js). */
  async guestOrders(req, res) {
    return this.render(req, res, "../pages/public/orders", {
      titulo: "Meus Pedidos",
      message: "Pedidos feitos neste navegador.",
    });
  }

  /** Detalhe de um pedido de convidado (o registro vem do navegador, via orders.js). */
  async guestOrderDetails(req, res) {
    return this.render(req, res, "../pages/public/order-details", {
      titulo: "Detalhes do Pedido",
      message: "Detalhes do seu pedido.",
      orderId: String(req.params.id || ""),
    });
  }

  async checkout(req, res) {
    const order = await this.orders.getCheckoutOrder(req.params.id, req.session);
    return this.render(req, res, "../pages/public/checkout", {
      titulo: "Finalizar Pagamento",
      order,
    });
  }
}
