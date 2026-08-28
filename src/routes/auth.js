import express from "express";

import { validateCsrfToken, requireAuth, requireAdmin } from "../middleware/authMiddleware.js"; 

// Separação de domínios em controllers distintos
import UserController from "../controllers/userControllers.js";
const userController = new UserController(); 

const router = express.Router();

router.post("/login", validateCsrfToken, (req, res, next) => userController.login(req, res, next));
router.post("/register", validateCsrfToken, (req, res, next) => userController.register(req, res, next));
router.post("/verify-otp", validateCsrfToken, (req, res, next) => userController.verifyOtp(req, res, next));

export default router;