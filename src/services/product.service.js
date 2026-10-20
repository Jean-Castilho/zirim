import ProductRepository from "../repository/product.repository.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { ACTIVE_VARIATION_QUERY, toStorefrontProducts } from "../utils/product-visibility.js";
import { parseSearchTerms } from "../utils/search-text.js";
import { toPublicProjection, sanitizePublicProduct } from "../utils/public-product.js";

const isBlankId = (id) => !id || id === "null" || id === "undefined";

export default class ProductService {
    constructor() {
        this.repository = new ProductRepository();
    }

    /** Vitrine: só produtos com variação ativa, e só as variações ativas. */
    async listProductsForHome() {
        const products = await this.repository.findAll(ACTIVE_VARIATION_QUERY, {
            projection: { nome: 1, 'variacoes.imagens': { $slice: 1 }, 'variacoes.ativo': 1 },
            limit: 6
        });
        return toStorefrontProducts(products);
    }

    /**
     * Busca da loja: cada termo digitado deve aparecer (substring, sem acentos) no texto do produto.
     * Só produtos com variação ativa; categoria opcional.
     */
    async searchProducts({ q, category } = {}) {
        const terms = parseSearchTerms(q);
        const filter = { ...ACTIVE_VARIATION_QUERY };
        if (terms.length > 0) {
            filter.$and = terms.map((term) => ({ searchText: { $regex: term } }));
        }
        if (category && category !== 'Todos') {
            filter.categoria = category;
        }
        const options = {
            projection: {
                nome: 1,
                categoria: 1,
                'variacoes.imagens': { $slice: 1 },
                'variacoes.preco': 1,
                'variacoes.ativo': 1
            },
            sort: { nome: 1 }
        };
        return toStorefrontProducts(await this.repository.findAll(filter, options));
    }

    /** Lista pública (loja): produtos com variações ativas, sem as inativas. */
    async getStorefrontProducts() {
        return toStorefrontProducts(await this.repository.findAll(ACTIVE_VARIATION_QUERY, {}));
    }

    async countProducts() {
        return await this.repository.count();
    }

    /** Produtos com pelo menos uma variação ativa (visíveis na loja). */
    async countActiveProducts() {
        return await this.repository.count(ACTIVE_VARIATION_QUERY);
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

    /**
     * Consulta pública por IDs (detalhe, favoritos). Garante `variacoes.ativo` na projeção
     * quando o cliente pede variações, para que as inativas sejam descartadas no servidor.
     */
    async getProductsByIds(ids, projection = {}) {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new ValidationError("IDs são requeridos para obter dados.");
        }
        // A projeção vinda do cliente é filtrada por lista branca; campos internos nunca saem.
        const safeProjection = toPublicProjection(projection);
        const products = await this.repository.findByIds(ids, safeProjection);
        return toStorefrontProducts(products).map(sanitizePublicProduct);
    }

    /** Detalhe público: produto inexistente OU sem nenhuma variação ativa vira 404. */
    async getVisibleProductById(id) {
        const product = await this.getProductById(id, { _id: 1, 'variacoes.ativo': 1 });
        if (toStorefrontProducts([product]).length === 0) {
            throw new NotFoundError("O produto que você está procurando não existe ou foi removido.");
        }
        return product;
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
