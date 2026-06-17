import express from "express";

import multer from 'multer';
import path from 'path';
import fs from 'fs';

import ProductController from "../controllers/productControllers.js";
import { handleResponse } from "../utils/handleResponse.js";

const uploadDir = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();
const productController = new ProductController();

router.get("/", async (req, res) => {
  handleResponse(res, productController.allProducts());
});

router.post("/", upload.array("imagens", 5), async (req, res, next) => {
  try {
    handleResponse(res ,productController.uploadProductAndImage(req,res) ,201);
  } catch (error) {
    next(error);
  }
});

export default router;