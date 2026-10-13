import express from "express";
import multer from "multer";
import ProductController from "../controllers/ProductController.js";
import { requireAuth, requireAdmin, validateCsrfToken } from "../middleware/authMiddleware.js";

const products = new ProductController();
const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.get("/", products.handle("list"));
router.post("/projectionByIds", products.handle("projectionByIds"));

router.post("/", requireAuth, requireAdmin, upload.any(), validateCsrfToken, products.handle("create"));
router.put("/:id", requireAuth, requireAdmin, upload.any(), validateCsrfToken, products.handle("update"));
router.delete("/:id", requireAuth, requireAdmin, validateCsrfToken, products.handle("remove"));

export default router;
