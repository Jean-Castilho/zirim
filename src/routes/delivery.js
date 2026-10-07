import { Router } from "express";
import { requireCourier } from "../middleware/authMiddleware.js";
import {
  CourierDashboard,
  ConfirmDeliveryCode,
  SelectOrderForDelivery,
} from "../controllers/pagesControllers.js";

const router = Router();

// Visualização das entregas atribuídas ao entregador autenticado
router.get("/delivery/courier", requireCourier, CourierDashboard);

// Selecionar pedido preparado para entrega
router.post("/delivery/select", requireCourier, SelectOrderForDelivery);
router.post("/delivery/orders/:id/select", requireCourier, SelectOrderForDelivery);

// Confirmação de entrega com código PIN
router.post("/delivery/confirm", requireCourier, ConfirmDeliveryCode);
router.post("/delivery/orders/:id/confirm", requireCourier, ConfirmDeliveryCode);

export default router;