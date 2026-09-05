import { sendEmailOtp } from "../services/contactService.js";
import { renderPage } from "../utils/handleResponse.js";
import ProductRepository from "../repository/ProductRepository.js";

// Instanciação direta da camada de dados
const productRepository = new ProductRepository();

export const Home = async (req, res, next) => {
  try {
    const products = await productRepository.findAll({}, {
      projection: { nome: 1, 'variacoes.imagens': { $slice: 1 } },
      limit: 6
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
    const { q, category } = req.query;
    const filter = {};

    // Filtro dinâmico: busca no nome ou em campos das variações (cor, tamanho, sku)
    if (q) {
      filter.$or = [
        { nome: { $regex: q, $options: 'i' } },
        { "variacoes.cor": { $regex: q, $options: 'i' } },
        { "variacoes.tamanho": { $regex: q, $options: 'i' } },
        { "variacoes.sku": { $regex: q, $options: 'i' } }
      ];
    }
    
    // Filtro por categoria (se não for "Todos")
    if (category && category !== 'Todos') filter.categoria = category;

    const products = await productRepository.findAll(filter, {
      projection: { 
        nome: 1, 
        categoria: 1, 
        'variacoes.imagens': { $slice: 1 }, 
        'variacoes.preco': 1 
      }
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

    if (!id || id === 'null' || id === 'undefined') {
      return res.status(404).render("pages/partials/Error", {
        titulo: "Produto não encontrado",
        statusCode: 404,
        errorMessage: "ID do produto inválido ou não fornecido.",
      });
    }

    // Verificamos apenas a existência do produto.
    // O carregamento completo dos dados é feito via fetch no frontend para otimizar o TTFB.
    const product = await productRepository.findById(id, { projection: { _id: 1 } });
    
    if (!product) {
      return res.status(404).render("pages/partials/Error", {
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

export const ResetPassword = (req, res) => {
  renderPage(req, res, "../pages/auth/reset-password", {
    titulo: "Recuperando Senha",
    message: "utuilize seu email ou numero",
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

export const Checkout = async (req, res, next) => {
  try {
    const { id } = req.params;
    const db = DataBase();
    const order = await db.collection("orders").findOne({ _id: new ObjectId(id) });

    if (!order) {
      return next(new NotFoundError("Pedido não encontrado."));
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