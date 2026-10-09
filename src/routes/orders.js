import express from "express";
import OrderController from '../controllers/orderControllers.js';
import { validateCsrfToken } from "../middleware/authMiddleware.js";

const orderController = new OrderController();
const router = express.Router();

router.get('/status/:id', async (req, res) => {
  const { id } = req.params;

  if (!id || id === 'undefined' || id === 'null') {
    return res.status(400).json({ error: 'ID de pagamento obrigatório.' });
  }

  const pagamento = await orderController.consultarPix(id);

  if (pagamento.error) {
    return res.status(500).json({ error: pagamento.error || 'Erro ao consultar pagamento.' });
  }

  return res.json({
    status: pagamento.status,
    id: pagamento.id,
    transaction_amount: pagamento.transaction_amount,
    status_detail: pagamento.status_detail || null,
  });
});

router.post('/create-order', validateCsrfToken, (req, res, next) => orderController.creatOrder(req, res, next));

router.post('/webhook', (req, res) => orderController.handleWebhook(req, res));

export default router;