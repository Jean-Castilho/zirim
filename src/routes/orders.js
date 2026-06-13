import express from "express";

import PaymentController
from '../controllers/paymentController.js';

import OrdertController
from '../controllers/orderController.js';

const paymentController = new PaymentController();
const orderController = new OrdertController();

router.post('/creat-Order', orderController.creatOrder);

router.get('/status', orderController.Status);

export default router;