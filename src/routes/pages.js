import express from "express";
import { generateCsrfToken } from "../middleware/authMiddleware.js";

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
  Profile,
  Users,
  Dashboard,
  Delivery,
  Logistica,
  Inventory,
  AddProduct,
  EditProduct,
  Checkout,
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
router.get("/login", generateCsrfToken, Login);
router.get("/reset-password", generateCsrfToken, ResetPassword);
router.get("/verify-otp", generateCsrfToken, VerifyOtp);

router.get("/cart", Cart);
router.get("/checkout/:id", Checkout);

router.get("/favorites", Favorites);

router.get("/profile", Profile);
router.get("/dashboard", Dashboard);

router.get("/users", generateCsrfToken, Users);

router.get("/delivery", Delivery);
router.get("/logistica", Logistica);

router.get("/inventory", Inventory);
router.get("/inventory/add", generateCsrfToken, AddProduct);
router.get("/inventory/edit/:id", generateCsrfToken, EditProduct);

router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Erro ao destruir a sessão:", err);
      return res.status(500).redirect('/');
    }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

export default router;