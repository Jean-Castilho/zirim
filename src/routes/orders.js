import express from "express";
import OrderController from "../controllers/OrderController.js";
import { validateCsrfToken } from "../middleware/authMiddleware.js";

const orders = new OrderController();
const router = express.Router();

router.get("/status/:id", orders.handle("paymentStatus"));
router.post("/create-order", validateCsrfToken, orders.handle("create"));
router.post("/webhook", orders.handle("webhook"));

export default router;
