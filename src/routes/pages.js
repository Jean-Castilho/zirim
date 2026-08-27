import express from "express";
import { generateCsrfToken } from "../middleware/authMiddleware.js";
import { getGridFSBucket, DataBase } from '../config/db.js';

import {
  Home, 
  Products,
  ProductDetails, 
  Register, 
  Login, 
  Contact, 
  About, 
  Favorites, 
  Cart,
  VerifyOtp,
  Profile,
  Dashboard,
  Delivery,
  Inventory,
  AddProduct,
  Checkout,
} from "../controllers/pagesControllers.js";

const router = express.Router();

router.get('/image/:filename', async (req, res) => {
    try {
        const bucket = getGridFSBucket();
        const db = DataBase();
        const filesCollection = db.collection('uploads.files');

        const filename = req.params.filename;

        const file = await filesCollection.findOne({ filename: filename });

        if (!file) {
            return res.status(404).send('Imagem não encontrada');
        }

        if (file.contentType) {
            res.set('Content-Type', file.contentType);
        } else {
          res.set('Content-Type', 'image/webp'); 
        }

        const downloadStream = bucket.openDownloadStreamByName(filename);

        downloadStream.on('error', (err) => {
            console.error('Erro ao fazer stream da imagem:', err);
            res.status(500).send('Erro interno ao carregar a imagem');
        });

        downloadStream.pipe(res);

    } catch (error) {
        console.error('Erro na rota de imagem:', error);
        res.status(500).send('Erro interno do servidor');
    }
});

router.get("/", Home);

router.get("/products", Products);
router.get("/product/:id", ProductDetails);

router.get("/about", About);
router.get("/contact", Contact);

router.get("/register", Register);
router.get("/login", generateCsrfToken, Login);

router.get("/verify-otp", VerifyOtp);

router.get("/cart", Cart);
router.get("/favorites", Favorites);

router.get("/profile", Profile);
router.get("/dashboard", Dashboard);
router.get("/delivery", Delivery);
router.get("/inventory", Inventory);
router.get("/inventory/add", AddProduct);
router.get("/checkout/:id", Checkout);

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