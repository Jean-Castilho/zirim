import { ObjectId } from "mongodb";
import sharp from 'sharp';
import BaseRepository from "./base.repository.js";

import { ValidationError, NotFoundError, GeneralError } from "../utils/errors.js";

export default class ProductRepository extends BaseRepository {
  constructor() {
    super("products");
  }

  #processVariationObject(variationSource) {
    const activeValue = Array.isArray(variationSource.ativo)
      ? variationSource.ativo
      : [variationSource.ativo];
    return {
      sku: variationSource.sku || '',
      cores: variationSource.cores ? String(variationSource.cores).split(',').map(c => c.trim()).filter(Boolean) : [],
      tamanhos: variationSource.tamanhos ? String(variationSource.tamanhos).split(',').map(t => t.trim()).filter(Boolean) : [],
      preco: parseFloat(variationSource.preco) || 0,
      estoque: parseInt(variationSource.estoque, 10) || 0,
      ativo: activeValue.some(value => value === 'true' || value === true),
      imagens: variationSource.imagens || [],
    };
  }

  #extractVariations(body = {}) {
    const nestedVariations = body.variacoes ?? body.variations;
    if (Array.isArray(nestedVariations)) return nestedVariations;
    if (nestedVariations && typeof nestedVariations === "object") {
      return Object.keys(nestedVariations)
        .sort((a, b) => Number(a) - Number(b))
        .map(index => nestedVariations[index]);
    }

    const variations = [];
    for (const [key, value] of Object.entries(body)) {
      const match = key.match(/^(?:variacoes|variations)\[(\d+)\]\[(\w+)\]$/);
      if (!match) continue;
      const index = Number(match[1]);
      variations[index] ||= {};
      variations[index][match[2]] = value;
    }
    return variations;
  }

  #mapVariationFiles(files = []) {
    const filesByVariation = new Map();
    for (const file of files) {
      const match = file.fieldname.match(/^(?:variacoes|variations)\[(\d+)\]\[imagens\]$/);
      if (!match) continue;
      const index = Number(match[1]);
      const variationFiles = filesByVariation.get(index) || [];
      variationFiles.push(file);
      filesByVariation.set(index, variationFiles);
    }
    return filesByVariation;
  }

  async #uploadFileWithRetry(file, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await new Promise((resolve, reject) => {
          const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
          const uploadStream = this.bucket.openUploadStream(uniqueName, {
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

  async createProductWithImages(body, files = []) {
    const variationFilesMap = this.#mapVariationFiles(files);
    const rawVariations = this.#extractVariations(body);
    if (rawVariations.length === 0 && (body.cores || body.tamanhos || body.preco || body.estoque || variationFilesMap.has(0))) {
      rawVariations.push(body);
    }

    const processedVariations = [];
    for (let i = 0; i < rawVariations.length; i++) {
      const variationBody = rawVariations[i];
      const filesForThisVariation = variationFilesMap.get(i) || [];

      const uploadPromises = filesForThisVariation.map(file => this.#uploadFileWithRetry(file));
      const uploadedVariationImageNames = await Promise.all(uploadPromises);

      processedVariations.push(this.#processVariationObject({
        ...variationBody,
        imagens: uploadedVariationImageNames,
      }));
    }

    const productData = {
      nome: body.name || body.nome,
      variacoes: processedVariations,
      categoria: body.categoria,
      descricao: body.descricao,
      comentarios: [],
    };

    const insertedId = await super.create(productData);
    return { message: "Produto adicionado com sucesso!", productId: insertedId };
  }

  async findLatest(limit = 5, projection = {}) {
    return await this.collection.find({}, { projection }).sort({ _id: -1 }).limit(limit).toArray();
  }

  async findByIds(ids, projection = {}) {
    const validIds = ids.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
    if (validIds.length === 0) return [];
    return await this.collection.find({ _id: { $in: validIds } }, { projection }).toArray();
  }

  async updateProductWithImages(id, body, files = []) {
    if (!ObjectId.isValid(id)) throw new ValidationError("ID de produto inválido.");

    const existingProduct = await super.findById(id);
    if (!existingProduct) throw new NotFoundError("Produto não encontrado.");

    const filesByVariation = this.#mapVariationFiles(files);
    const submittedVariations = this.#extractVariations(body);
    const rawVariations = submittedVariations.length ? submittedVariations : existingProduct.variacoes || [];
    const processedVariations = [];

    for (let index = 0; index < rawVariations.length; index++) {
      const variation = rawVariations[index];
      const variationFiles = filesByVariation.get(index) || [];
      const images = variationFiles.length
        ? await Promise.all(variationFiles.map(file => this.#uploadFileWithRetry(file)))
        : existingProduct.variacoes?.[index]?.imagens || [];
      processedVariations.push(this.#processVariationObject({ ...variation, imagens: images }));
    }

    const productData = {
      nome: body.name || body.nome,
      variacoes: processedVariations,
      categoria: body.categoria,
      descricao: body.descricao,
    };

    await super.update(id, productData);
    return await super.findById(id);
  }

  async deleteProductAndImages(id) {
    if (!ObjectId.isValid(id)) throw new ValidationError("ID de produto inválido.");

    const product = await super.findById(id);
    if (!product) throw new NotFoundError("Produto não encontrado.");

    const imageNames = [...new Set((product.variacoes || []).flatMap(variation => variation.imagens || []))];
    if (imageNames.length > 0) {
      const filesCollection = this.db.collection('uploads.files');
      const filesToDelete = await filesCollection.find({ filename: { $in: imageNames } }).toArray();

      const deletePromises = filesToDelete.map(file => this.bucket.delete(file._id));
      await Promise.all(deletePromises);
    }

    const isDeleted = await super.delete(id);
    if (!isDeleted) throw new GeneralError("Não foi possível deletar o produto.", 500);

    return { success: true };
  }

  async getImageMetadata(filename) {
    return await this.db.collection('uploads.files').findOne({ filename });
  }
  
  getImageStream(filename) {
    return this.bucket.openDownloadStreamByName(filename);
  }
}
