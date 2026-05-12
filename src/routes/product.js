import express from "express";

import ProductController from "../controllers/productControllers.js";
import { handleResponse } from "../utils/handleResponse.js";

const router = express.Router();
const productController = new ProductController();

router.get("/", async (req, res) => {
  handleResponse(res, productController.allProducts());
});


export default router;