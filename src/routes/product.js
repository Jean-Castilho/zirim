import express from "express";
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import ProductController from "../controllers/productControllers.js";
import { handleResponse } from "../utils/handleResponse.js";
import { requireAuth, requireAdmin, validateCsrfToken } from "../middleware/authMiddleware.js";

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

router.post("/", requireAuth, requireAdmin, upload.any(), validateCsrfToken, async (req, res, next) => {
  try {
    // Controller atualizado espera apenas 'req'
    const productNew = await productController.uploadProductAndImage(req);
    res.redirect("/inventory");
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requireAuth, requireAdmin, upload.any(), validateCsrfToken, async (req, res, next) => {
  try {
    await productController.updateProduct(req);
    return res.status(200).send("Produto atualizado com sucesso.");
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireAuth, requireAdmin, validateCsrfToken, async (req, res, next) => {
  try {
    await productController.deleteProduct(req);
    return res.status(200).send("");
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
    
    console.log(products)

    await handleResponse(res, Promise.resolve(products));
  } catch (error) {
    next(error);
  }
});

export default router;