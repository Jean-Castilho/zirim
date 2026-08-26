import express from "express";

import { validateCsrfToken, requireAuth, requireAdmin } from "../middleware/authMiddleware.js"; 

// Separação de domínios em controllers distintos
import * as authController from "../controllers/authController.js";

const router = express.Router();

router.post("/login", validateCsrfToken, authController.login);
router.post("/register", validateCsrfToken, authController.register);
router.post("/verify-otp", validateCsrfToken, authController.verifyOtp);

export default router;
