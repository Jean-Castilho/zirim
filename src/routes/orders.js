import express from "express";
import OrderController from "../controllers/order.controller.js";
import { validateCsrfToken } from "../middleware/auth.middleware.js";

const orders = new OrderController();
const router = express.Router();

router.get("/status/:id", orders.handle("paymentStatus"));
router.post("/create-order", validateCsrfToken, orders.handle("create"));
router.post("/webhook", orders.handle("webhook"));

export default router;
