import express from "express";
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import ProductController from "../controllers/productControllers.js";
import { handleResponse } from "../utils/handleResponse.js";

const productController = new ProductController();
const router = express.Router();

const uploadDir = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ storage: multer.memoryStorage()});

router.get("/", async (req, res, next) => {
  try {
    // handleResponse espera uma promise
    await handleResponse(res, productController.findAll());
  } catch (error) {
    next(error);
  }
});

router.post("/", upload.any(), async (req, res, next) => {
  try {
    // Controller atualizado espera apenas 'req'
    const productNew = await productController.uploadProductAndImage(req);
    console.log(productNew);
    res.redirect("/admin/inventory");
  } catch (error) {
    next(error);
  }
});

router.post("/projectionByIds", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body) ? req.body : req.body?.ids;
    const projection = Array.isArray(req.body) ? {} : req.body?.projection;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "IDs são requeridos para obter dados" });
    }

    const products = await productController.getProductsByIds(ids, projection || {});
    console.log(products);
    await handleResponse(res, Promise.resolve(products));
  } catch (error) {
    next(error);
  }
});

export default router;