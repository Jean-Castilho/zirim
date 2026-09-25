import { sendEmailOtp } from "../services/contactService.js";
import { renderPage } from "../utils/handleResponse.js";
import ProductService from "../services/ProductService.js";
import UserService from "../services/UserService.js";
import { NotFoundError } from "../utils/handleResponse.js";
import OrderRepository from "../repository/OrderRepository.js";
import { ObjectId } from "mongodb";

const productService = new ProductService();
const userService = new UserService();
const orderRepository = new OrderRepository();

export const Home = async (req, res, next) => {
  try {
    const products = await productService.listProductsForHome();

    renderPage(req, res, "../pages/public/home", {
      titulo: "Zirim - Moda e Calçados",
      message: "Bem-vindo à Zirim, a sua loja de roupas e calçados!",
      products,
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
      return res.status(404).render("pages/partials/Error", {
        titulo: "Produto não encontrado",
        statusCode: 404,
        errorMessage: "ID do produto inválido ou não fornecido.",
      });
    }

    // Verificamos apenas a existência do produto.
    const product = await productService.repository.findById(id, { projection: { _id: 1 } });

    if (!product) {
      return res.status(404).render("../pages/partials/Error", {
        titulo: "Produto não encontrado",
        statusCode: 404,
        errorMessage: "O produto que você está procurando não existe ou foi removido.",
      });
    }

    renderPage(req, res, "../pages/public/product-details", {
      titulo: "Carregando Produto...",
      product: { _id: product._id },
    });
  } catch (error) {
    if (error.name === 'CastError' || error.message.includes('ObjectId')) {
      return res.status(404).render("pages/partials/Error", {
        titulo: "Produto não encontrado",
        statusCode: 404,
        errorMessage: "Produto não encontrado (ID inválido).",
      });
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

export const ResetPassword = (req, res) => {
  renderPage(req, res, "../pages/auth/reset-password", {
    titulo: "Recuperando Senha",
    message: "Encontre sua conta e defina uma nova senha!",
  });
};

export const VerifyOtp = async (req, res, next) => {
  try {
    const userEmail = req.session?.user?.email?.endereco;

    if (!userEmail) {
      return res.redirect('/login');
    }

    const normalized = String(userEmail).trim().toLowerCase();

    renderPage(req, res, "../pages/auth/verify-otp", {
      titulo: "Verificar E-mail",
      message: `Enviamos um código de verificação para ${normalized}.`,
      email: normalized
    });

    sendEmailOtp(normalized).catch(err => {
      console.error("Falha ao enviar e-mail de OTP em segundo plano:", err);
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
  });
};

export const Profile = async (req, res, next) => {
  try {
    const userId = req.session?.user?._id;
    if (!userId) {
      return res.redirect('/login');
    }

    const userProfile = await userService.repository.findById(userId);

    // Busca pedidos diretamente da coleção orders como fonte da verdade definitiva
    const orders = await orderRepository.collection.find({
      $or: [
        { "user._id": userId },
        { "user._id": String(userId) },
        { "user._id": new ObjectId(userId) }
      ]
    }).sort({ createdAt: -1 }).toArray();

    // Sincroniza o array de pedidos do objeto user para compatibilidade com o template
    userProfile.orderns = orders.map(o => {
      let status = o.statusInterno || 'pendente';

      // Verifica se o pedido pendente expirou (mais de 60 minutos desde a criação)
      if (status === 'pendente' && o.createdAt) {
        const sessentaMinutos = 60 * 60 * 1000;
        if (new Date() - new Date(o.createdAt) > sessentaMinutos) {
          status = 'cancelado';
          // Atualiza o banco de dados em background para manter a performance da resposta
          orderRepository.collection.updateOne(
            { _id: o._id },
            { $set: { statusInterno: 'cancelado', updatedAt: new Date() } }
          ).catch(err => console.error(`Erro ao cancelar pedido expirado ${o._id}:`, err));
        }
      }

      return {
        _id: o._id,
        status: status,
        total: o.payment?.transaction_amount || 0,
        createdAt: o.createdAt
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
    const users = await userService.repository.findAll({}, {
      projection: { password: 0 }
    });

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
    // Coleta dados reais do e-commerce direto dos repositórios encapsulados nos serviços
    const totalProducts = await productService.repository.collection.countDocuments({});
    const totalUsers = await userService.repository.collection.countDocuments({});

    // Pipeline de Agregação para calcular o total de vendas aprovadas nos últimos 30 dias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const salesStats = await orderRepository.collection.aggregate([
      {
        $match: {
          statusInterno: 'pago',
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: null,
          totalVolume: { $sum: "$payment.transaction_amount" }
        }
      }
    ]).toArray();

    const monthlySales = salesStats[0]?.totalVolume || 0;

    // Busca a contagem real de pedidos com status pendente
    const activeDeliveries = await orderRepository.collection.countDocuments({
      statusInterno: 'pendente'
    });

    const latestProducts = await productService.repository.collection
      .find({}, { projection: { nome: 1, categoria: 1, variacoes: 1 } })
      .sort({ _id: -1 })
      .limit(5)
      .toArray();

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
    // Busca pedidos que não foram cancelados nem concluídos (ex: pendentes e pagos)
    const activeOrders = await orderRepository.collection.aggregate([
      {
        $match: {
          statusInterno: { $in: ['pendente', 'pago'] }
        }
      },
      { $sort: { createdAt: -1 } }
    ]).toArray();

    renderPage(req, res, "../pages/admin/delivery/delivery", {
      titulo: "Monitoramento de Entregas",
      message: "Acompanhe os pedidos ativos no mapa",
      activeOrders
    });
  } catch (error) {
    next(error);
  }
};

export const Inventory = async (req, res, next) => {
  try {
    const products = await productService.repository.findAll();

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
    const allOrders = await orderRepository.collection.find({}).sort({ createdAt: -1 }).toArray();

    const stats = {
      total: allOrders.length,
      pendente: allOrders.filter(o => o.statusInterno === 'pendente').length,
      pago: allOrders.filter(o => o.statusInterno === 'pago').length,
      cancelado: allOrders.filter(o => o.statusInterno === 'cancelado').length,
      faturamento: allOrders
        .filter(o => o.statusInterno === 'pago')
        .reduce((acc, o) => acc + (o.payment?.transaction_amount || 0), 0)
    };

    renderPage(req, res, "../pages/admin/logistica/dashboard-logistica", {
      titulo: "Logística & Pedidos",
      message: "Acompanhamento detalhado da operação de vendas",
      orders: allOrders,
      stats
    });
  } catch (error) {
    next(error);
  }
};

export const Checkout = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await orderRepository.findById(id);
    if (!order) {
      return next(new NotFoundError("Pedido não encontrado.", id));
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
      return res.status(404).render("../pages/partials/Error", {
        titulo: "Produto não encontrado",
        statusCode: 404,
        errorMessage: "ID do produto inválido.",
      });
    }

    const product = await productService.repository.findById(id);

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

export const EditPageHome = async (req, res) => {

  renderPage(req, res, "../pages/admin/inventory/edit-home", {
    titulo: "Adicionar Produto",
    message: "Cadastre um novo produto no inventário",
  });

};