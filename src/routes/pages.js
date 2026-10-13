import express from "express";
import { generateCsrfToken, requireAuth, requireAdmin, requireCourier } from "../middleware/auth.middleware.js";

import PublicPagesController from "../controllers/public-pages.controller.js";
import AuthPagesController from "../controllers/auth-pages.controller.js";
import AdminPagesController from "../controllers/admin-pages.controller.js";
import AuthController from "../controllers/auth.controller.js";
import ProductController from "../controllers/product.controller.js";

const publicPages = new PublicPagesController();
const authPages = new AuthPagesController();
const adminPages = new AdminPagesController();
const authController = new AuthController();
const productController = new ProductController();

const router = express.Router();

// Mídia
router.get("/image/:filename", productController.handle("image"));

// Loja
router.get("/", publicPages.handle("home"));
router.get("/products", publicPages.handle("productList"));
router.get("/product/:id", publicPages.handle("productDetails"));
router.get("/contact", publicPages.handle("contact"));
router.get("/favorites", publicPages.handle("favorites"));
router.get("/cart", generateCsrfToken, publicPages.handle("cart"));
router.get("/checkout/:id", publicPages.handle("checkout"));

// Conta
router.get("/register", generateCsrfToken, authPages.handle("register"));
router.get("/login", generateCsrfToken, authPages.handle("login"));
router.get("/reset-password", generateCsrfToken, authPages.handle("resetPassword"));
router.get("/verify-otp", generateCsrfToken, authPages.handle("verifyOtp"));
router.get("/verify-contact", requireAuth, generateCsrfToken, authPages.handle("verifyContact"));
router.get("/profile", requireAuth, generateCsrfToken, authPages.handle("profile"));
router.get("/logout", authController.handle("logout"));

// Administração e operação
router.get("/dashboard", requireAdmin, adminPages.handle("dashboardPage"));
router.get("/edit/home", requireAdmin, generateCsrfToken, adminPages.handle("editHome"));
router.get("/users", requireAdmin, generateCsrfToken, adminPages.handle("usersPage"));
router.get("/delivery", requireCourier, generateCsrfToken, adminPages.handle("deliveryMap"));
router.get("/logistica", requireAdmin, generateCsrfToken, adminPages.handle("logistics"));
router.get("/inventory", requireAdmin, generateCsrfToken, adminPages.handle("inventory"));
router.get("/inventory/add", requireAdmin, generateCsrfToken, adminPages.handle("addProduct"));
router.get("/inventory/edit/:id", requireAdmin, generateCsrfToken, adminPages.handle("editProduct"));

export default router;
