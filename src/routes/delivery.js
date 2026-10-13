import { Router } from "express";
import { requireCourier, requireAdmin, generateCsrfToken, validateCsrfToken } from "../middleware/authMiddleware.js";
import { validateBody, rules } from "../utils/validators.js";
import AdminPagesController from "../controllers/AdminPagesController.js";
import DeliveryController from "../controllers/DeliveryController.js";

const adminPages = new AdminPagesController();
const delivery = new DeliveryController();
const router = Router();

const orderIdRule = { orderId: rules.objectId("ID do pedido") };

// Entregas atribuídas ao entregador autenticado
router.get("/delivery/courier", requireCourier, generateCsrfToken, adminPages.handle("courierDashboard"));

// Preparar pedido para envio (Admin / Logística)
router.post("/delivery/prepare", requireAdmin, validateCsrfToken, validateBody(orderIdRule), delivery.handle("prepare"));
router.post("/delivery/orders/:id/prepare", requireAdmin, validateCsrfToken, delivery.handle("prepare"));

// Selecionar pedido preparado para entrega
router.post("/delivery/select", requireCourier, validateCsrfToken, validateBody(orderIdRule), delivery.handle("select"));
router.post("/delivery/orders/:id/select", requireCourier, validateCsrfToken, delivery.handle("select"));

// Confirmação de entrega com código PIN
router.post(
  "/delivery/confirm",
  requireCourier,
  validateCsrfToken,
  validateBody({ ...orderIdRule, code: rules.pinCode }),
  delivery.handle("confirm")
);
router.post(
  "/delivery/orders/:id/confirm",
  requireCourier,
  validateCsrfToken,
  validateBody({ code: rules.pinCode }),
  delivery.handle("confirm")
);

export default router;
