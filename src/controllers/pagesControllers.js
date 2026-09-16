import { sendEmailOtp } from "../services/contactService.js";
import { renderPage } from "../utils/handleResponse.js";
import ProductService from "../services/ProductService.js";
import UserService from "../services/UserService.js";
import { NotFoundError } from "../utils/handleResponse.js";

const productService = new ProductService();
const userService = new UserService();

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

export const Profile = (req, res) => {
  renderPage(req, res, "../pages/auth/profile", {
    titulo: "Meu Perfil",
    message: "Gerencie suas informações de perfil!",
  });
};

export const Dashboard = async (req, res, next) => {
  try {
    // Coleta dados reais do e-commerce direto dos repositórios encapsulados nos serviços
    const totalProducts = await productService.repository.collection.countDocuments({});
    const totalUsers = await userService.repository.collection.countDocuments({});
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
      latestProducts
    });
  } catch (error) {
    next(error);
  }
};

export const Delivery = (req, res) => {
  renderPage(req, res, "../pages/admin/delivery/delivery", {
    titulo: "Entregas",
    message: "Gerencie as entregas",
  });
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

export const Checkout = async (req, res, next) => {
  try {
    const { id } = req.params;
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