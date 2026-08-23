import express from "express";

import PaymentController
from '../controllers/paymentController.js';

import OrdertController
from '../controllers/orderControllers.js';

const paymentController = new PaymentController();
const orderController = new OrdertController();
const router = express.Router();


router.post('/', async (req, res) => {
  const { valor } = req.body;

  const pagamento = await gerarPix(valor);

  console.log(pagamento);

  if (pagamento.error || pagamento.mensagem) {
    return res.render('pagamento-result', {
      title: 'Erro no Pagamento',
      erro: pagamento.error || pagamento.mensagem,
      valor: valor || '0,00',
      nome: 'Cliente',
    });
  }

  const valorFormatado = pagamento.transaction_amount
    ? Number(pagamento.transaction_amount).toFixed(2)
    : parseFloat(valor || '0').toFixed(2);

  res.render('pagamento-result', {
    title: 'Pagamento PIX Gerado',
    nome: 'Cliente',
    valor: valorFormatado,
    erro: null,
    qr_code: pagamento.qr_code,
    qr_code_base64: pagamento.qr_code_base64,
    pagamentoId: pagamento.id,
    status: pagamento.status,
  });
});

router.get('/status/:id', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'ID de pagamento obrigatório.' });
  }

  const pagamento = await consultarPix(id);

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

router.post('/creat-Order', orderController.creatOrder);


export default router;