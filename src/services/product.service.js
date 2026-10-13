import ProductRepository from "../repository/product.repository.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

const isBlankId = (id) => !id || id === "null" || id === "undefined";

export default class ProductService {
    constructor() {
        this.repository = new ProductRepository();
    }

    async listProductsForHome() {
        return await this.repository.findAll({}, {
            projection: { nome: 1, 'variacoes.imagens': { $slice: 1 } },
            limit: 6
        });
    }

    async searchProducts({ q, category } = {}) {
        const filter = {};
        const options = {
            projection: {
                nome: 1,
                categoria: 1,
                'variacoes.imagens': { $slice: 1 },
                'variacoes.preco': 1
            },
            sort: { _id: -1 }
        };
        if (q) {
            filter.$text = { $search: q };
            options.projection.score = { $meta: "textScore" };
            options.sort = { score: { $meta: "textScore" } };
        }
        if (category && category !== 'Todos') {
            filter.categoria = category;
        }
        return await this.repository.findAll(filter, options);
    }

    async countProducts() {
        return await this.repository.count();
    }

    async getLatestProducts(limit = 5) {
        return await this.repository.findLatest(limit, { nome: 1, categoria: 1, variacoes: 1 });
    }

    async getAllProducts(filter = {}, options = {}) {
        return await this.repository.findAll(filter, options);
    }

    /** Busca um produto ou lança NotFoundError (ids vazios/'null'/'undefined' incluídos). */
    async getProductById(id, projection = {}) {
        if (isBlankId(id)) throw new NotFoundError("ID do produto inválido ou não fornecido.");

        const product = await this.repository.findById(id, projection);
        if (!product) throw new NotFoundError("O produto que você está procurando não existe ou foi removido.");
        return product;
    }

    async getProductsByIds(ids, projection = {}) {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new ValidationError("IDs são requeridos para obter dados.");
        }
        return await this.repository.findByIds(ids, projection);
    }

    async createProduct(body, files = []) {
        return await this.repository.createProductWithImages(body, files);
    }

    async updateProduct(id, body, files = []) {
        if (!id) throw new ValidationError("ID do produto é obrigatório para atualização.");
        return await this.repository.updateProductWithImages(id, body, files);
    }

    async deleteProduct(id) {
        if (!id) throw new ValidationError("ID do produto é obrigatório para exclusão.");
        return await this.repository.deleteProductAndImages(id);
    }

    /** Metadados + stream da imagem no GridFS. */
    async getImage(filename) {
        const file = await this.repository.getImageMetadata(filename);
        if (!file) throw new NotFoundError("Imagem não encontrada.");

        return {
            contentType: file.contentType || "image/webp",
            openStream: () => this.repository.getImageStream(filename),
        };
    }
}
