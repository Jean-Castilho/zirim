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
        const products = []; /*await productControllers.getCollection().find().limit(10).toArray();*/

        renderPage(req, res, "../pages/public/home", {
            titulo: "Encanto Rústico",
            message: "Bem-vindo à nossa loja de móveis e decorações!",
            products: products,
        });
    } catch (error) {
        next(error);
    }
};

export const getProducts = async (req, res, next) => {
  try {
    const allProducts = []; /*await productControllers.getCollection().find().toArray();*/
    renderPage(req, res, "../pages/public/products", {
      titulo: "Produtos",
      message: "Confira nossos produtos!",
      products: allProducts,
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
  renderPage(req, res, "../pages/public/profile", {
    titulo: "Meu Perfil",
    message: "Gerencie suas informações de perfil!",
  });
};