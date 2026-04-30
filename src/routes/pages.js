import express from "express";

import { 
    getHome, getProducts, getRegister, getLogin, getContact, getAbout, getFavorites, getCart,
} from "../controllers/pagesControllers.js";

const router = express.Router();

router.get("/", getHome);

router.get("/products", getProducts)

router.get("/about", getAbout);

router.get("/contact", getContact);

router.get("/register", getRegister);

router.get("/login", getLogin);

router.get("/favorites", getFavorites);

router.get("/cart", getCart);


export default router;