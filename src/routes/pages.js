import express from "express";
import { generateCsrfToken } from "../middleware/csrfMiddleware.js";
import { getGridFSBucket } from "../config/db.js";

import {
  getHome, 
  getProducts, 
  getRegister, 
  getLogin, 
  getContact, 
  getAbout, 
  getFavorites, 
  getCart,
  getProfile,
  getdasboardAdmin,
  getdelivery,
  getinventory,
  getAddProduct,
  getVerifyOtp,
} from "../controllers/pagesControllers.js";

const router = express.Router();

router.get("/", getHome);

router.get("/products", getProducts);

router.get("/image/:filename", (req, res) => {
  try {
    const bucket = getGridFSBucket();
    const downloadStream = bucket.openDownloadStreamByName(req.params.filename);

    downloadStream.on("error", () => {
      res.status(404).send("Imagem não encontrada");
    });

    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache de 1 ano
    downloadStream.pipe(res);
  } catch (error) {
    res.status(500).send("Erro interno ao buscar a imagem.");
  }
});

router.get("/about", getAbout);

router.get("/contact", getContact);

router.get("/register", getRegister);

router.get("/login", generateCsrfToken, getLogin);

router.get("/verify-otp", getVerifyOtp);

router.get("/cart", getCart);

router.get("/favorites", getFavorites);


router.get("/profile", getProfile);


router.get("/admin/dashboard", getdasboardAdmin);

router.get("/admin/delivery", getdelivery);

router.get("/admin/inventory", getinventory);

router.get("/admin/inventory/add", getAddProduct);


router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Erro ao destruir a sessão:", err);
      return res.status(500).redirect('/');
    }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

export default router;