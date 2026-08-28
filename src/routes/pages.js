import express from "express";
import { generateCsrfToken } from "../middleware/authMiddleware.js";
import { getGridFSBucket, DataBase } from '../config/db.js';

import {
  Home, 
  Products,
  ProductDetails, 
  Register, 
  Login, 
  ResetPassword,
  Contact, 
  About, 
  Favorites, 
  Cart,
  VerifyOtp,
  Profile,
  Dashboard,
  Delivery,
  Inventory,
  AddProduct,
  Checkout,
} from "../controllers/pagesControllers.js";

import ProductController from "../controllers/productControllers.js";

const productController = new ProductController();

const router = express.Router();

router.get('/image/:filename', (req, res) => productController.getImage(req, res));
router.get("/", Home);

router.get("/products", Products);
router.get("/product/:id", ProductDetails);

router.get("/about", About);
router.get("/contact", Contact);

router.get("/register", Register);
router.get("/login", generateCsrfToken, Login);

router.get("/forgot-password", ResetPassword);

router.get("/verify-otp", VerifyOtp);

router.get("/cart", Cart);
router.get("/favorites", Favorites);

router.get("/profile", Profile);
router.get("/dashboard", Dashboard);
router.get("/delivery", Delivery);
router.get("/inventory", Inventory);
router.get("/inventory/add", AddProduct);
router.get("/checkout/:id", Checkout);

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