import express from "express";

import { validateCsrfToken, requireAuth, requireAdmin } from "../middleware/authMiddleware.js"; 

// Separação de domínios em controllers distintos
import * as authController from "../controllers/authControllers.js";

const router = express.Router();

router.post("/login", validateCsrfToken, authController.Login);
router.post("/register", validateCsrfToken, authController.Register);
router.post("/verify-otp", validateCsrfToken, authController.VerifyOtp);

export default router;
