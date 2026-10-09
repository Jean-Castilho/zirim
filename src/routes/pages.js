import express from "express";
import { 
  generateCsrfToken, 
  requireAuth, 
  requireAdmin, 
  requireCourier 
} from "../middleware/authMiddleware.js";

import {
  Home,
  Products,
  ProductDetails, 
  Register, 
  Login, 
  ResetPassword,
  Contact,
  Favorites, 
  Cart,
  VerifyOtp,
  VerifyContact,
  Profile,
  Users,
  Dashboard,
  Delivery,
  Logistica,
  Inventory,
  AddProduct,
  EditProduct,
  Checkout,
  EditPageHome
} from "../controllers/pagesControllers.js";

import ProductController from "../controllers/productControllers.js";

const productController = new ProductController();

const router = express.Router();

router.get('/image/:filename', (req, res) => productController.getImage(req, res));
router.get("/", Home);


router.get("/products", Products);
router.get("/product/:id", ProductDetails);

router.get("/contact", Contact);

router.get("/register", generateCsrfToken, Register); 
router.get("/login", generateCsrfToken, Login); // verificar otp e-mail
router.get("/reset-password", generateCsrfToken, ResetPassword);

router.get("/verify-otp", generateCsrfToken, VerifyOtp);
router.get("/verify-contact", requireAuth, generateCsrfToken, VerifyContact);

router.get("/favorites", Favorites);
router.get("/cart", generateCsrfToken, Cart);
router.get("/checkout/:id", Checkout);

router.get("/profile", requireAuth, generateCsrfToken, Profile);
router.get("/dashboard", requireAdmin, Dashboard);
router.get("/edit/home", requireAdmin, generateCsrfToken, EditPageHome);

router.get("/users", requireAdmin, generateCsrfToken, Users);

router.get("/delivery", requireCourier, generateCsrfToken, Delivery);
router.get("/logistica", requireAdmin, generateCsrfToken, Logistica);

router.get("/inventory", requireAdmin, generateCsrfToken, Inventory);
router.get("/inventory/add", requireAdmin, generateCsrfToken, AddProduct);
router.get("/inventory/edit/:id", requireAdmin, generateCsrfToken, EditProduct);

router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Erro ao destruir a sessão:", err);
      return res.status(500).redirect('/');
    }
    res.clearCookie('connect.sid');
    res.clearCookie('token');
    if (req.headers['hx-request'] === 'true') {
      return res.set('HX-Redirect', '/').status(200).send();
    }
    res.redirect('/');
  });
});

export default router;