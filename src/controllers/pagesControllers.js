import ProductController from "../controllers/productControllers.js";
import { sendEmailOtp } from "../services/contactService.js";
import { renderPage } from "../utils/handleResponse.js";
const productController = new ProductController();


export const getHome = async (req, res, next) => {
  try {
    const products = await productController.getCollection().find({},
      { projection: { nome: 1, 'variacoes.imagens': { $slice: 1 } } }).limit(4).toArray();

    renderPage(req, res, "../pages/public/home", {
      titulo: "Zirim - Moda e Calçados",
      message: "Bem-vindo à Zirim, a sua loja de roupas e calçados!",
      products: products,
    });
  } catch (error) {
    next(error);
  }
};

export const getProducts = async (req, res, next) => {
  try {
    const products = await productController.getCollection().find({},
      { projection: { nome: 1, 'variacoes.imagens': { $slice: 1 } } }).toArray();

    renderPage(req, res, "../pages/public/products", {
      titulo: "Produtos",
      message: "Confira nossos produtos!",
      products: products,
    });
    
  } catch (error) {
    next(error);
  }
};

export const getProductDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).render("../pages/public/product-details", {
        titulo: "Detalhes do Produto",
        product: null,
        errorMessage: "ID de produto obrigatório.",
      });
    }
    const product = await productController.getProductById(id);

    if (!product) {
      return res.status(404).render("../pages/public/product-details", {
        titulo: "Produto não encontrado",
        product,
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



export const getAbout = (req, res) => {
  renderPage(req, res, "../pages/public/about", {
    titulo: "Sobre Nós",
    message: "Saiba mais sobre nossa loja!",
  });
};

export const getContact = (req, res) => {
  renderPage(req, res, "../pages/public/contact", {
    titulo: "Contato",
    message: "Entre em contato conosco!",
  });
};

export const getLogin = (req, res) => {
  renderPage(req, res, "../pages/auth/login", {
    titulo: "Login",
    message: "seja Bem vindo de volta...",
  });
};

export const getRegister = (req, res) => {
  renderPage(req, res, "../pages/auth/register", {
    titulo: "Registrar Conta",
    message: "Crie sua conta para começar a comprar!",
  });
};

export const getVerifyOtp = async (req, res, next) => {
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


export const getFavorites = async (req, res, next) => {
  try {
    renderPage(req, res, "../pages/public/favorites", {
      titulo: "Favoritos",
      message: "Seus itens favoritos!",
    });
  } catch (error) {
    next(error);
  }
};

export const getCart = (req, res) => {
  renderPage(req, res, "../pages/public/cart", {
    titulo: "Meu Carrinho",
    message: "Seu carrinho de compras!",
  });
};