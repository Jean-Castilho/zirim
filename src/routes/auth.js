import express from "express";
import multer from "multer";
import { validateCsrfToken, requireAuth, requireAdmin } from "../middleware/auth.middleware.js";

import AuthController from "../controllers/auth.controller.js";
import VerificationController from "../controllers/verification.controller.js";
import UserController from "../controllers/user.controller.js";
import BannerController from "../controllers/banner.controller.js";

const auth = new AuthController();
const verification = new VerificationController();
const users = new UserController();
const banners = new BannerController();

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// Autenticação e senha
router.post("/login", validateCsrfToken, auth.handle("login"));
router.post("/register", validateCsrfToken, auth.handle("register"));
router.post("/forgotPassword", validateCsrfToken, auth.handle("forgotPassword"));
router.post("/PasswordReset", validateCsrfToken, auth.handle("passwordReset"));
router.post("/updatePassword", requireAuth, validateCsrfToken, auth.handle("updatePassword"));

// Verificação de contato (OTP)
router.post("/verify-otp", validateCsrfToken, verification.handle("verifyEmailOtp"));
router.post("/email/send-otp", requireAuth, validateCsrfToken, verification.handle("sendEmailOtp"));
router.post("/phone/send-otp", requireAuth, validateCsrfToken, verification.handle("sendPhoneOtp"));
router.post("/phone/verify-otp", requireAuth, validateCsrfToken, verification.handle("verifyPhoneOtp"));

// Usuários
router.post("/updateProfile", requireAuth, validateCsrfToken, users.handle("updateProfile"));
router.post("/deleteUser/:id", requireAuth, requireAdmin, validateCsrfToken, users.handle("deleteUser"));
router.post("/users/edit/:id", requireAuth, requireAdmin, validateCsrfToken, users.handle("updateUser"));
router.delete("/users/edit/:id", requireAuth, requireAdmin, validateCsrfToken, users.handle("deleteUser"));

// Conteúdo da home (admin)
router.post(
    "/updateBannerHome",
    requireAuth, requireAdmin,
    upload.single("bannerImage"),
    validateCsrfToken,
    banners.handle("updateMain")
);
router.post(
    "/updateCategoryHome",
    requireAuth, requireAdmin,
    upload.single("categoryImage"),
    validateCsrfToken,
    banners.handle("addCategory")
);
router.post("/deleteCategoryHome/:id", requireAuth, requireAdmin, validateCsrfToken, banners.handle("removeCategory"));

export default router;
