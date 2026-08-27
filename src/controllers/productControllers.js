import ProductRepository from "../repository/ProductRepository.js";
import { NotFoundError, ValidationError } from "../utils/handleResponse.js";

export default class ProductController {
  constructor() {
    this.repository = new ProductRepository();
  }

  async streamImage(req, res) {
    try {
      const { filename } = req.params;
      const file = await this.repository.getImageMetadata(filename);

      if (!file) {
        return res.status(404).send('Imagem não encontrada');
      }

      res.set('Content-Type', file.contentType || 'image/webp');
      const downloadStream = this.repository.getImageStream(filename);

      downloadStream.on('error', (err) => {
        console.error('Erro ao fazer stream da imagem:', err);
        if (!res.headersSent) {
          res.status(500).send('Erro interno ao carregar a imagem');
        }
      });

      downloadStream.pipe(res);
    } catch (error) {
      console.error('Erro na rota de imagem:', error);
      if (!res.headersSent) {
        res.status(500).send('Erro interno do servidor');
      }
    }
  }

  async getProductById(req) {
    const { id } = req.params;
    if (!id) throw new ValidationError("ID do produto é obrigatório.");

    const product = await this.repository.findById(id);
    if (!product) throw new NotFoundError("Produto não encontrado.");
    
    return product;
  }

  async getProductsByIds(ids, projection = {}) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new ValidationError("Array de IDs é requerido para a projeção.");
    }
    return await this.repository.findByIds(ids, projection);
  }

  async uploadProductAndImage(req) {
    return await this.repository.createProductWithImages(req.body, req.files || []);
  }

  async updateProduct(req) {
    const { id } = req.params;
    if (!id) throw new ValidationError("ID do produto é obrigatório para atualização.");

    return await this.repository.updateProductWithImages(id, req.body, req.files || []);
  }

  async deleteProduct(req) {
    const { id } = req.params;
    if (!id) throw new ValidationError("ID do produto é obrigatório para exclusão.");

    return await this.repository.deleteProductAndImages(id);
  }
}
