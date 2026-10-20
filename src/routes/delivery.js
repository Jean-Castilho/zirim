import { Router } from "express";
import { requireCourier, requireAdmin, generateCsrfToken, validateCsrfToken } from "../middleware/auth.middleware.js";
import { validateBody, rules } from "../utils/validators.js";
import AdminPagesController from "../controllers/admin-pages.controller.js";
import DeliveryController from "../controllers/delivery.controller.js";

const adminPages = new AdminPagesController();
const delivery = new DeliveryController();
const router = Router();

const orderIdRule = { orderId: rules.objectId("ID do pedido") };

// Entregas atribuídas ao entregador autenticado
router.get("/delivery/courier", requireCourier, generateCsrfToken, adminPages.handle("courierDashboard"));

// Painel de preparo: itens dos pedidos pagos (Admin)
router.get("/delivery/preparo", requireAdmin, generateCsrfToken, adminPages.handle("preparationPanel"));

// Preparar pedido para envio (Admin / Logística)
router.post("/delivery/prepare", requireAdmin, validateCsrfToken, validateBody(orderIdRule), delivery.handle("prepare"));
router.post("/delivery/orders/:id/prepare", requireAdmin, validateCsrfToken, delivery.handle("prepare"));

// Selecionar pedido preparado para entrega
router.post("/delivery/select", requireCourier, validateCsrfToken, validateBody(orderIdRule), delivery.handle("select"));
router.post("/delivery/orders/:id/select", requireCourier, validateCsrfToken, delivery.handle("select"));

// Liberar pedido aceito (entregador dono) e reatribuir (admin)
router.post("/delivery/orders/:id/release", requireCourier, validateCsrfToken, delivery.handle("release"));
router.post(
  "/delivery/orders/:id/reassign",
  requireAdmin,
  validateCsrfToken,
  validateBody({ courierId: rules.objectId("ID do entregador") }),
  delivery.handle("reassign")
);

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
