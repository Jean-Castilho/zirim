import { renderPage, NotFoundError } from "../utils/handleResponse.js";

import ProductService from "../services/ProductService.js";
import UserService from "../services/UserService.js";
import DeliveryService from "../services/DeliveryService.js";
import OrderRepository from "../repository/OrderRepository.js";
import BannerControllers from "../controllers/bannerControllers.js";

const productService = new ProductService();
const userService = new UserService();
const deliveryService = new DeliveryService();

const bannerControllers = new BannerControllers();
const orderRepository = new OrderRepository();

export const Home = async (req, res, next) => {
  try {
    const [products, homePageData] = await Promise.all([
      productService.listProductsForHome(),
      bannerControllers.getBannerPageEditHome()
    ]);

    renderPage(req, res, "../pages/public/home", {
      titulo: "Moda e Calçados",
      message: "Bem-vindo à Zirim, a sua loja de roupas e calçados!",
      products,
      banner: homePageData?.banner,
    });
  } catch (error) {
    next(error);
  }
};

export const Products = async (req, res, next) => {
  try {
    const products = await productService.searchProducts(req.query);
    renderPage(req, res, "../pages/public/products", {
      titulo: "Produtos",
      message: "Confira nossos produtos!",
      products: products,
    });
  } catch (error) {
    next(error);
  }
};

export const ProductDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!id || id === 'null' || id === 'undefined') {
      return next(new NotFoundError("ID do produto inválido ou não fornecido."));
    }

    const product = await productService.getProductById(id, { projection: { _id: 1 } });
    console.log(product)

    if (!product) {
      return next(new NotFoundError("O produto que você está procurando não existe ou foi removido."));
    }

    renderPage(req, res, "../pages/public/product-details", {
      titulo: "Carregando Produto...",
      product: { _id: product._id }
    });
  } catch (error) {
    if (error.name === 'CastError' || error.message.includes('ObjectId')) {
      return next(new NotFoundError("Produto não encontrado (ID inválido)."));
    }
    next(error);
  }

};

export const Contact = (req, res) => {
  renderPage(req, res, "../pages/public/contact", {
    titulo: "Contato",
    message: "Entre em contato conosco!",
  });
};

export const Login = (req, res) => {
  renderPage(req, res, "../pages/auth/login", {
    titulo: "Login",
    message: "seja Bem vindo de volta...",
  });
};

export const Register = (req, res) => {
  renderPage(req, res, "../pages/auth/register", {
    titulo: "Registrar Conta",
    message: "Crie sua conta para começar a comprar!",
  });
};

export const ResetPassword = async (req, res, next) => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const resetMode = token && await userService.isPasswordResetTokenValid(token);

    if (token && !resetMode) {
      return renderPage(req, res, "../pages/auth/reset-password", {
        titulo: "Link expirado",
        message: "Este link não é válido ou já expirou. Solicite uma nova redefinição.",
        invalidToken: true,
      });
    }

    renderPage(req, res, "../pages/auth/reset-password", {
      titulo: resetMode ? "Definir nova senha" : "Recuperando senha",
      message: resetMode ? "Escolha uma senha segura para sua conta." : "Informe seu e-mail para receber um link de redefinição.",
      resetMode: Boolean(resetMode),
      token,
    });
  } catch (error) {
    next(error);
  }
};

export const VerifyOtp = async (req, res, next) => {
  try {
    if (!req.session?.user?.email?.endereco) {
      return res.redirect('/login');
    }

    return res.redirect('/verify-contact?type=email');
  } catch (error) {
    next(error);
  }
};

export const VerifyContact = async (req, res, next) => {
  try {
    const type = req.query.type === "phone" ? "phone" : req.query.type === "email" ? "email" : null;
    if (!type) return res.redirect("/profile");

    const user = await userService.getUserById(req.session.user._id);
    if (!user) return res.redirect("/login");

    const contact = type === "phone" ? user.phone?.number || "" : user.email?.endereco || "";
    if (type === "email" && !contact) {
      return res.redirect("/profile");
    }

    renderPage(req, res, "../pages/auth/verify-contact", {
      titulo: type === "phone" ? "Verificar telefone" : "Verificar e-mail",
      type,
      contact,
      verified: type === "phone" ? Boolean(user.phone?.verified) : Boolean(user.email?.verified),
    });
  } catch (error) {
    next(error);
  }
};

export const Favorites = async (req, res, next) => {
  try {
    renderPage(req, res, "../pages/public/favorites", {
      titulo: "Favoritos",
      message: "Seus itens favoritos!",
    });
  } catch (error) {
    next(error);
  }
};

export const Cart = (req, res) => {
  renderPage(req, res, "../pages/public/cart", {
    titulo: "Meu Carrinho",
    message: "Seu carrinho de compras!",
    mapApiKey: process.env.GOOGLE_API_KEY || '',
  });
};

export const Profile = async (req, res, next) => {
  try {
    const userId = req.session?.user?._id;
    if (!userId) {
      return res.redirect('/login');
    }

    await orderRepository.syncExpiredPendingOrders(userId);

    const [userProfile, orders] = await Promise.all([
      userService.getUserById(userId),
      orderRepository.findUserOrders(userId)
    ]);

    userProfile.orderns = orders.map(o => {
      return {
        _id: o._id,
        status: o.statusInterno || 'pendente',
        total: o.payment?.transaction_amount || 0,
        createdAt: o.createdAt,
        delivery: o.delivery || null
      };
    });

    res.locals.user = userProfile;

    renderPage(req, res, "../pages/auth/profile", {
      titulo: "Meu Perfil",
      message: "Gerencie suas informações de perfil!",
      user: userProfile
    });
  } catch (error) {
    next(error);
  }
};

export const Users = async (req, res, next) => {
  try {
    const users = await userService.getAllUsers();

    renderPage(req, res, "../pages/admin/users/tabela-users", {
      titulo: "Gestão de Usuários",
      message: "Visualize e gerencie todos os usuários cadastrados",
      users
    });
  } catch (error) {
    next(error);
  }
};

export const Dashboard = async (req, res, next) => {
  try {
    const [
      totalProducts,
      totalUsers,
      monthlySales,
      activeDeliveries,
      latestProducts
    ] = await Promise.all([
      productService.countProducts(),
      userService.countUsers(),
      orderRepository.getMonthlySalesVolume(30),
      orderRepository.countByStatus('pendente'),
      productService.getLatestProducts(5)
    ]);

    renderPage(req, res, "../pages/admin/dashboard", {
      titulo: "Administração",
      message: "Gerencie as informações da loja",
      totalProducts,
      totalUsers,
      monthlySales,
      activeDeliveries,
      latestProducts
    });
  } catch (error) {
    next(error);
  }
};

export const Delivery = async (req, res, next) => {
  try {
    const activeOrders = await deliveryService.getActiveDeliveriesForMap();

    renderPage(req, res, "../pages/admin/delivery/delivery", {
      titulo: "Monitoramento de Entregas",
      message: "Acompanhe os pedidos ativos no mapa",
      activeOrders,
      mapApiKey: process.env.GOOGLE_API_KEY || ''
    });
  } catch (error) {
    next(error);
  }
};

export const Inventory = async (req, res, next) => {
  try {
    const products = await productService.getAllProducts();

    renderPage(req, res, "../pages/admin/inventory/tabela-product", {
      titulo: "Gerenciamento de Inventário",
      message: "Controle de estoque e produtos",
      products: products
    });
  } catch (error) {
    next(error);
  }
};

export const Logistica = async (req, res, next) => {
  try {
    const { orders, stats } = await deliveryService.getLogisticsOverview();
    renderPage(req, res, "../pages/admin/logistica/dashboard-logistica", {
      titulo: "Logística & Pedidos",
      message: "Acompanhamento detalhado da operação de vendas",
      orders,
      stats,
    });
  } catch (error) {
    next(error);
  }
};

export const Checkout = async (req, res, next) => {
  try {
    const { id } = req.params;
    let order = await orderRepository.findById(id);
    if (!order) {
      return next(new NotFoundError("Pedido não encontrado.", id));
    }

    const sessionUser = req.session?.user;
    const ownsOrder = sessionUser && String(order.user?._id) === String(sessionUser._id);
    const isAdmin = sessionUser?.role === "admin";
    const ownsGuestOrder = req.session?.guestOrderIds?.includes(String(order._id));
    if (!ownsOrder && !isAdmin && !ownsGuestOrder) {
      return next(new NotFoundError("Pedido não encontrado.", id));
    }

    if (order.payment?.id && ['pendente', 'cancelado', 'expirado'].includes(order.statusInterno)) {
      await orderRepository.consultarPix(order.payment.id);
      order = await orderRepository.findById(id);
    }

    renderPage(req, res, "../pages/public/checkout", {
      titulo: "Finalizar Pagamento",
      order
    });
  } catch (error) {
    next(error);
  }
};

export const AddProduct = (req, res) => {
  renderPage(req, res, "../pages/admin/inventory/add-product", {
    titulo: "Adicionar Produto",
    message: "Cadastre um novo produto no inventário",
  });
};

export const EditProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || id === 'null' || id === 'undefined') {
      return next(new NotFoundError("ID do produto inválido."));
    }
    const product = await productService.getProductById(id);

    if (!product) return next(new NotFoundError("Produto não encontrado.", id));

    renderPage(req, res, "../pages/admin/inventory/edit-product", {
      titulo: "Editar Produto",
      message: `Editando: ${product.nome}`,
      product
    });
  } catch (error) {
    next(error);
  }
};

export const EditPageHome = async (req, res, next) => {  try {
    const homePageData = await bannerControllers.getBannerPageEditHome();

    renderPage(req, res, "../pages/admin/edit-home", {
      titulo: "Editar Página Inicial",
      message: "Personalize o banner principal e os destaques em tempo real.",
      homePageData
    });

  } catch (error) {
    next(error);
  }
};

export const CourierDashboard = async (req, res, next) => {
  try {
    const user = req.session?.user;
    if (!user) {
      return res.redirect("/login");
    }

    const { deliveries, availableOrders } = await deliveryService.getCourierDashboardData(user._id);

    renderPage(req, res, "../pages/admin/delivery/dashboard", {
      titulo: "Minhas Entregas",
      message: "Entregas atribuídas a você",
      deliveries,
      availableOrders
    });
  } catch (error) {
    next(error);
  }
};

export const SelectOrderForDelivery = async (req, res, next) => {
  try {
    const orderId = req.validated?.orderId || req.body.orderId || req.params.id;
    const result = await deliveryService.selectOrderForDelivery(orderId, req.session?.user);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const ConfirmDeliveryCode = async (req, res, next) => {
  try {
    const orderId = req.validated?.orderId || req.body.orderId || req.params.id;
    const code = req.validated?.code || req.body.code;
    const result = await deliveryService.confirmDelivery(orderId, req.session?.user?._id, code);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const PrepareOrderForDelivery = async (req, res, next) => {
  try {
    const orderId = req.validated?.orderId || req.body.orderId || req.params.id;
    const result = await deliveryService.prepareOrder(orderId, req.session?.user);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};