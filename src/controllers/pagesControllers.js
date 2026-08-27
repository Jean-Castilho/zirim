import { sendEmailOtp } from "../services/contactService.js";
import { renderPage } from "../utils/handleResponse.js";
import ProductRepository from "../repository/ProductRepository.js";

// Instanciação direta da camada de dados
const productRepository = new ProductRepository();

export const Home = async (req, res, next) => {
  try {
    const products = await productRepository.findAll({}, {
      projection: { nome: 1, 'variacoes.imagens': { $slice: 1 } },
      limit: 4
    });
    
    renderPage(req, res, "../pages/public/home", {
      titulo: "Zirim - Moda e Calçados",
      message: "Bem-vindo à Zirim, a sua loja de roupas e calçados!",
      products: products,
    });
  } catch (error) {
    next(error);
  }
};

export const Products = async (req, res, next) => {
  try {
    const products = await productRepository.findAll({}, {
      projection: { nome: 1, 'variacoes.imagens': { $slice: 1 } }
    });
    
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
    if (!id) {
      return res.status(400).render("../pages/public/product-details", {
        titulo: "Detalhes do Produto",
        product: null,
        errorMessage: "ID de produto obrigatório.",
      });
    }

    const product = await productRepository.findById(id);
    if (!product) {
      return res.status(404).render("../pages/public/product-details", {
        titulo: "Produto não encontrado",
        product: null,
        errorMessage: "Produto não encontrado.",
      });
    }
         
    renderPage(req, res, "../pages/public/product-details", {
      titulo: product.nome || "Detalhes do Produto",
      product,
    });
  } catch (error) {
    next(error);
  }
};

export const About = (req, res) => {
  renderPage(req, res, "../pages/public/about", {
    titulo: "Sobre Nós",
    message: "Saiba mais sobre nossa loja!",
  });
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

export const Dashboard = (req, res) => {
  renderPage(req, res, "../pages/admin/dashboard", {
    titulo: "Administração",
    message: "Gerencie as informações da loja",
  });
};

export const Delivery = (req, res) => {
  renderPage(req, res, "../pages/admin/delivery/delivery", {
    titulo: "Entregas",
    message: "Gerencie as entregas",
  });
};

export const Inventory = async (req, res, next) => {
  try {
    const products = await productRepository.findAll();
         
    renderPage(req, res, "../pages/admin/inventory/tabela-product", {
      titulo: "Gerenciamento de Inventário",
      message: "Controle de estoque e produtos",
      products: products
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
