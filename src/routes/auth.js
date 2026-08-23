import express from "express";
import {
  validateCsrfToken,
  generateCsrfToken,
} from "../middleware/csrfMiddleware.js";
import {  
  getProfile,
  PostLogin,
  PostRegister,
  PostVerifyOtp,
  getdasboardAdmin,
  getdelivery,
  getinventory,
  getAddProduct,
} from "../controllers/authControllers.js";

const router = express.Router();

const cookieSecure = process.env.NODE_ENV === 'production'; // Use secure cookies in production
const cookieSameSite = process.env.NODE_ENV === 'production' ? 'Lax' : 'Lax'; // Or 'None' with secure: true for cross-site

router.get("/profile", getProfile);

router.post("/login", validateCsrfToken, PostLogin);
router.post("/register", PostRegister);
router.post("/verify-otp", PostVerifyOtp);

router.get("/admin/dashboard", getdasboardAdmin);
router.get("/admin/delivery", getdelivery);
router.get("/admin/inventory", getinventory);
router.get("/admin/inventory/add", getAddProduct);


export default router;