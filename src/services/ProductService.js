import ProductRepository from "../repository/ProductRepository.js";

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

    async searchProducts({ q, category }) {
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
        return await this.repository.collection.countDocuments({});
    }

    async getLatestProducts(limit = 5) {
        return await this.repository.collection
            .find({}, { projection: { nome: 1, categoria: 1, variacoes: 1 } })
            .sort({ _id: -1 })
            .limit(limit)
            .toArray();
    }

    async getProductById(id, options = {}) {
        return await this.repository.findById(id, options);
    }

    async getAllProducts(filter = {}, options = {}) {
        return await this.repository.findAll(filter, options);
    }
}