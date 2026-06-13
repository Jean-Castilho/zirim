import ProductController from "../controllers/productControllers.js";
import { sendOtpEmail } from "../services/contactService.js";

const productController = new ProductController();

const renderPage = (req, res, page, options = {}) => {
  if (req.headers["hx-request"]) {
    res.render(page.replace("../", ""), options);
  } else {
    res.render(res.locals.layout || './layout/main', {
      page,
      ...options,
    });
  }
};

export const getHome = async (req, res, next) => {
  try {
    const products = await productController.getCollection().find().limit(4).toArray();

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
    const products = await productController.getCollection().find().toArray();
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
        product: null,
        errorMessage: "Produto não encontrado.",
      });
    }

    renderPage(req, res, "../pages/public/product-details", {
      titulo: product.nome || product.name || "Detalhes do Produto",
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
    titulo: "Realizar Login",
    message: "seja Bem vindo de volta...",
  });
};

export const getRegister = (req, res) => {
  renderPage(req, res, "../pages/auth/register", {
    titulo: "Registrar Conta",
    message: "Crie sua conta para começar a comprar!",
  });
};

export const getVerifyOtp = async (req, res) => {
  const normalized = String(req.session.user.email.endereco).trim().toLowerCase();
  console.log(normalized);
  
  const result = await sendOtpEmail(normalized);

  renderPage(req, res, "../pages/auth/verify-otp", {
    titulo: "Verificar",
    message: "verifique aqui seu codigo",
    email: normalized
  });
};


export const getFavorites = (req, res) => {

  renderPage(req, res, "../pages/public/favorites", {
    titulo: "Meus Favoritos",
    message: "Seus itens favoritos!",
  });
};

export const getCart = (req, res) => {

  renderPage(req, res, "../pages/public/cart", {
    titulo: "Meu Carrinho",
    message: "Seu carrinho de compras!",
  });
};

export const getProfile = (req, res) => {

  if (!req.session.user) {
    return res.redirect("/login");
  }

  

  renderPage(req, res, "../pages/auth/profile", {
    titulo: "Meu Perfil",
    message: "Gerencie suas informações de perfil!",
  });
};

export const getdasboardAdmin = (req, res) => {

  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }

  renderPage(req, res, "../pages/admin/dashboard", {
    titulo: "Administaçao",
    message: "Gerencie as informações da loja",
  });
};

export const getdelivery = (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }

  renderPage(req, res, "../pages/admin/delivery/dashboard", {
    titulo: "Entregas",
    message: "Gerencie as entregas",
  });
};

export const getinventory = async (req, res, next) => {
  try {
    if (!req.session.user || req.session.user.role !== "admin") {
      return res.redirect("/login");
    }

    const products = await productController.getCollection().find().toArray();

    renderPage(req, res, "../pages/admin/inventory/dashboard", {
      titulo: "Gerenciamento de Inventário",
      message: "Controle de estoque e produtos",
      products: products
    });
  } catch (error) {
    next(error);
  }
};

export const getAddProduct = (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }

  renderPage(req, res, "../pages/admin/inventory/add-product", {
    titulo: "Adicionar Produto",
    message: "Cadastre um novo produto no inventário",
  });
};