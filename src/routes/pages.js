import express from "express";
import { generateCsrfToken } from "../middleware/csrfMiddleware.js";

import { 
    getHome, getProducts, getRegister, getLogin, getContact, getAbout, getFavorites, getCart, getProfile 
} from "../controllers/pagesControllers.js";

const router = express.Router();

router.get("/", getHome);

router.get("/products", getProducts);

router.get("/about", getAbout);

router.get("/contact", getContact);

router.get("/register", getRegister);

router.get("/login", generateCsrfToken, getLogin);

router.get("/cart", getCart);

router.get("/profile", getProfile);

router.get("/favorites", getFavorites);

export default router;