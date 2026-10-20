import express from "express";
import { validateCsrfToken, requireAuth, requireAdmin } from "../middleware/auth.middleware.js";
import { rateLimits } from "../middleware/rate-limit.middleware.js";
import { imageUpload, handleUploadErrors } from "../utils/upload.js";

import AuthController from "../controllers/auth.controller.js";
import VerificationController from "../controllers/verification.controller.js";
import UserController from "../controllers/user.controller.js";
import BannerController from "../controllers/banner.controller.js";

const auth = new AuthController();
const verification = new VerificationController();
const users = new UserController();
const banners = new BannerController();

const upload = imageUpload();
const router = express.Router();

// Autenticação e senha (limites de tentativa antes da validação do CSRF)
router.post("/login", ...rateLimits.login, validateCsrfToken, auth.handle("login"));
router.post("/register", ...rateLimits.register, validateCsrfToken, auth.handle("register"));
router.post("/forgotPassword", ...rateLimits.forgotPassword, validateCsrfToken, auth.handle("forgotPassword"));
router.post("/PasswordReset", ...rateLimits.passwordReset, validateCsrfToken, auth.handle("passwordReset"));
router.post("/updatePassword", requireAuth, validateCsrfToken, auth.handle("updatePassword"));

// Verificação de contato (OTP): limite por IP, contador por código fica no repositório
router.post("/verify-otp", ...rateLimits.otpVerify, validateCsrfToken, verification.handle("verifyEmailOtp"));
router.post("/email/send-otp", ...rateLimits.otpSend, requireAuth, validateCsrfToken, verification.handle("sendEmailOtp"));
router.post("/phone/send-otp", ...rateLimits.otpSend, requireAuth, validateCsrfToken, verification.handle("sendPhoneOtp"));
router.post("/phone/verify-otp", ...rateLimits.otpVerify, requireAuth, validateCsrfToken, verification.handle("verifyPhoneOtp"));

// Usuários
router.post("/updateProfile", requireAuth, validateCsrfToken, users.handle("updateProfile"));
router.post("/deleteUser/:id", requireAuth, requireAdmin, validateCsrfToken, users.handle("deleteUser"));
router.post("/users/edit/:id", requireAuth, requireAdmin, validateCsrfToken, users.handle("updateUser"));
router.delete("/users/edit/:id", requireAuth, requireAdmin, validateCsrfToken, users.handle("deleteUser"));

// Conteúdo da home (admin)
router.post(
    "/updateBannerHome",
    requireAuth, requireAdmin,
    handleUploadErrors(upload.single("bannerImage")),
    validateCsrfToken,
    banners.handle("updateMain")
);
router.post(
    "/updateCategoryHome",
    requireAuth, requireAdmin,
    handleUploadErrors(upload.single("categoryImage")),
    validateCsrfToken,
    banners.handle("addCategory")
);
router.post("/deleteCategoryHome/:id", requireAuth, requireAdmin, validateCsrfToken, banners.handle("removeCategory"));

export default router;
