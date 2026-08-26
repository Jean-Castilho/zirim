import { ObjectId } from "mongodb";
import sharp from 'sharp';
import { getDataBase } from "../config/db.js";
import { getGridFSBucket } from "../config/db.js";

export default class ProductController {

  getCollection() {
    const db = getDataBase();
    return db.collection("products");
  }

  #processVariationObject(variationSource) {
    const activeValue = Array.isArray(variationSource.ativo)
      ? variationSource.ativo
      : [variationSource.ativo];

    return {
      sku: variationSource.sku || '',
      cores: variationSource.cores ? String(variationSource.cores).split(',').map(c => c.trim()).filter(c => c) : [],
      tamanhos: variationSource.tamanhos ? String(variationSource.tamanhos).split(',').map(t => t.trim()).filter(t => t) : [],
      preco: parseFloat(variationSource.preco) || 0,
      estoque: parseInt(variationSource.estoque) || 0,
      ativo: activeValue.some(value => value === 'true' || value === true),
      imagens: variationSource.imagens || [],
    };
  }

  async #uploadFileWithRetry(file, bucket, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await new Promise((resolve, reject) => {
          const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
          const uploadStream = bucket.openUploadStream(uniqueName, {
            contentType: 'image/webp',
            metadata: { originalname: file.originalname },
          });

          sharp(file.buffer)
            .resize({ width: 1200, fit: 'inside', withoutEnlargement: true })
            .toFormat('webp', { quality: 80 })
            .pipe(uploadStream)
            .on('finish', () => resolve(uniqueName))
            .on('error', (err) => {
              uploadStream.abort();
              reject(err);
            });
        });
      } catch (error) {
        if (i === retries - 1) throw error;
      }
    }
  }

  async uploadProductAndImage(req, res) {
    const allFiles = req.files;
    const bucket = getGridFSBucket();
    const variationFilesMap = new Map();

    if (allFiles && allFiles.length > 0) {
      allFiles.forEach(file => {
        if (file.fieldname.startsWith('variations[') && file.fieldname.includes('][imagens]')) {
          const match = file.fieldname.match(/variations\[(\d+)\]\[imagens\]/);
          if (match && match[1]) {
            const variationIndex = parseInt(match[1], 10);
            if (!variationFilesMap.has(variationIndex)) {
              variationFilesMap.set(variationIndex, []);
            }
            variationFilesMap.get(variationIndex).push(file);
          }
        }
      });
    }

    let rawVariations = [];
    if (req.body.variations && Array.isArray(req.body.variations)) {
      rawVariations = req.body.variations;
    } else if (req.body.cores || req.body.tamanhos || req.body.preco || req.body.estoque || variationFilesMap.has(0)) {
      rawVariations.push(req.body); 
    }

    const processedVariations = [];
    for (let i = 0; i < rawVariations.length; i++) {
      const variationBody = rawVariations[i];
      const filesForThisVariation = variationFilesMap.get(i) || [];
      
      const uploadedVariationImageNames = await Promise.all(
        filesForThisVariation.map(file => this.#uploadFileWithRetry(file, bucket))
      );
      
      processedVariations.push(this.#processVariationObject({
        ...variationBody,
        imagens: uploadedVariationImageNames,
      }));
    }

    const productData = {
      nome: req.body.name,
      variacoes: processedVariations,
      categoria: req.body.categoria,
      descricao: req.body.descricao,
      comentarios: [],
    };

    const result = await this.getCollection().insertOne(productData);
    return { message: "Produto adicionado com sucesso!", productId: result.insertedId };
  }

  async AllProducts() {
    return this.getCollection().find().toArray();
  }

  async getProductsByIds(ids, projection = {}) {
    const validIds = ids.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
    if (validIds.length === 0) return [];

    const cursor = this.getCollection().find({ _id: { $in: validIds } });
    if (projection && typeof projection === "object" && Object.keys(projection).length > 0) {
      cursor.project(projection);
    }
    return cursor.toArray();
  }

  async getProductById(id) {
    if (!ObjectId.isValid(id)) return null;
    return this.getCollection().findOne({ _id: new ObjectId(id) });
  }

  async updateProduct(req) {
    const { id } = req.params;
    const { body, files } = req;
    if (!ObjectId.isValid(id)) throw new Error("ID de produto inválido.");

    const existingProduct = await this.getProductById(id);
    if (!existingProduct) throw new Error("Produto não encontrado.");

    const bucket = getGridFSBucket();
    const newImages = files?.length
      ? (await Promise.allSettled(files.map(file => this.#uploadFileWithRetry(file, bucket))))
        .filter(result => result.status === 'fulfilled').map(result => result.value)
      : [];
    const keptImages = body.existingImages
      ? (Array.isArray(body.existingImages) ? body.existingImages : [body.existingImages])
      : [];

    const productData = {
      nome: body.name || body.nome,
      preco: parseFloat(body.preco),
      imagens: [...keptImages, ...newImages],
      variacoes: Array.isArray(body.variations)
        ? body.variations.map(variation => this.#processVariationObject(variation))
        : [],
      categoria: body.categoria,
      descricao: body.descricao,
    };

    await this.getCollection().updateOne(
      { _id: new ObjectId(id) },
      { $set: productData }
    );
    return this.getProductById(id);
  }

  async deleteProduct(id) {
    if (!ObjectId.isValid(id)) throw new Error("ID de produto inválido.");

    const objectId = new ObjectId(id);
    const bucket = getGridFSBucket();
    const product = await this.getCollection().findOne({ _id: objectId });
    if (!product) throw new Error("Produto não encontrado.");

    if (product.imagens && product.imagens.length > 0) {
      const filesCollection = getDataBase().collection('fs.files');
      await Promise.all(product.imagens.map(async filename => {
        const imageFile = await filesCollection.findOne({ filename });
        if (imageFile) await bucket.delete(imageFile._id);
      }));
    }

    const result = await this.getCollection().deleteOne({ _id: objectId });
    if (result.deletedCount === 0) throw new Error("Não foi possível deletar o produto.");
    return result;
  }
}