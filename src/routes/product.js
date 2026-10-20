import express from "express";
import ProductController from "../controllers/product.controller.js";
import { requireAuth, requireAdmin, validateCsrfToken } from "../middleware/auth.middleware.js";
import { imageUpload, handleUploadErrors } from "../utils/upload.js";

const products = new ProductController();
const upload = imageUpload();
const router = express.Router();

router.get("/", products.handle("list"));
router.post("/projectionByIds", products.handle("projectionByIds"));

router.post("/", requireAuth, requireAdmin, handleUploadErrors(upload.any()), validateCsrfToken, products.handle("create"));
router.put("/:id", requireAuth, requireAdmin, handleUploadErrors(upload.any()), validateCsrfToken, products.handle("update"));
router.delete("/:id", requireAuth, requireAdmin, validateCsrfToken, products.handle("remove"));

export default router;
