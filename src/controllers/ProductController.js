import BaseController from "./BaseController.js";
import ProductService from "../services/ProductService.js";

/**
 * Produtos: CRUD e entrega de imagens.
 */
export default class ProductController extends BaseController {
  constructor(productService = new ProductService()) {
    super();
    this.products = productService;
  }

  async list(req, res) {
    return this.json(res, await this.products.getAllProducts());
  }

  async projectionByIds(req, res) {
    const ids = Array.isArray(req.body) ? req.body : req.body?.ids;
    const projection = (Array.isArray(req.body) ? {} : req.body?.projection) || {};

    return this.json(res, await this.products.getProductsByIds(ids, projection));
  }

  async create(req, res) {
    await this.products.createProduct(req.body, req.files || []);
    return res.redirect("/inventory");
  }

  async update(req, res) {
    await this.products.updateProduct(req.params.id, req.body, req.files || []);
    return this.text(res, "Produto atualizado com sucesso.");
  }

  async remove(req, res) {
    await this.products.deleteProduct(req.params.id);
    return this.empty(res);
  }

  /** Faz stream da imagem do GridFS. Erros de leitura encerram a resposta sem derrubar o processo. */
  async image(req, res, next) {
    const { contentType, openStream } = await this.products.getImage(req.params.filename);

    res.set("Content-Type", contentType);
    const stream = openStream();

    stream.on("error", (error) => {
      if (!res.headersSent) return next(error);
      console.error("Erro ao fazer stream da imagem:", error);
      res.end();
    });
    req.on("close", () => {
      if (!stream.destroyed) stream.destroy();
    });

    stream.pipe(res);
  }
}
