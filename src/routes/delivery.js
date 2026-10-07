import { Router } from "express";
import { requireCourier, requireAdmin, generateCsrfToken } from "../middleware/authMiddleware.js";
import { validateBody, rules } from "../utils/validators.js";
import {
  CourierDashboard,
  ConfirmDeliveryCode,
  SelectOrderForDelivery,
  PrepareOrderForDelivery,
} from "../controllers/pagesControllers.js";

const router = Router();

// Visualização das entregas atribuídas ao entregador autenticado
router.get("/delivery/courier", requireCourier, generateCsrfToken, CourierDashboard);

// Preparar pedido para envio (Admin / Logística)
router.post(
  "/delivery/prepare",
  requireAdmin,
  validateBody({ orderId: rules.objectId("ID do pedido") }),
  PrepareOrderForDelivery
);
router.post(
  "/delivery/orders/:id/prepare",
  requireAdmin,
  PrepareOrderForDelivery
);

// Selecionar pedido preparado para entrega
router.post(
  "/delivery/select",
  requireCourier,
  validateBody({ orderId: rules.objectId("ID do pedido") }),
  SelectOrderForDelivery
);
router.post(
  "/delivery/orders/:id/select",
  requireCourier,
  SelectOrderForDelivery
);

// Confirmação de entrega com código PIN
router.post(
  "/delivery/confirm",
  requireCourier,
  validateBody({ orderId: rules.objectId("ID do pedido"), code: rules.pinCode }),
  ConfirmDeliveryCode
);
router.post(
  "/delivery/orders/:id/confirm",
  requireCourier,
  validateBody({ code: rules.pinCode }),
  ConfirmDeliveryCode
);

export default router;