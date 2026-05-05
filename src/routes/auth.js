import express from "express";
import {
  validateCsrfToken,
  generateCsrfToken,
} from "../middleware/csrfMiddleware.js";

import { 
   PostLogin,
   PostRegister
} from "../controllers/authControllers.js";

const router = express.Router();

const cookieSecure = process.env.NODE_ENV === 'production'; // Use secure cookies in production
const cookieSameSite = process.env.NODE_ENV === 'production' ? 'Lax' : 'Lax'; // Or 'None' with secure: true for cross-site

router.post("/login", validateCsrfToken, PostLogin);
router.post("/register", PostRegister);

export default router;