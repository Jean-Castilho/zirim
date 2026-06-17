import express from "express";
import { generateCsrfToken } from "../middleware/csrfMiddleware.js";
import { getGridFSBucket, getDataBase } from '../config/db.js';


import {
  getHome, 
  getProducts,
  getProductDetails, 
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

router.get('/image/:filename', async (req, res) => {
    try {
        const bucket = getGridFSBucket();
        const db = getDataBase();
        const filesCollection = db.collection('uploads.files'); // default naming for GridFS files

        const filename = req.params.filename;

        // Check if file exists
        const file = await filesCollection.findOne({ filename: filename });

        if (!file) {
            return res.status(404).send('Imagem não encontrada');
        }

        // Set the proper content type
        if (file.contentType) {
            res.set('Content-Type', file.contentType);
        } else {
             // Fallback if not set
             res.set('Content-Type', 'image/webp'); 
        }

        // Stream the file directly to the response
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


router.get("/", getHome);

router.get("/products", getProducts);

router.get("/product/:id", getProductDetails);

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