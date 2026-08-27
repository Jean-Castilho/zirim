import { ObjectId } from "mongodb";
import sharp from 'sharp';
import BaseRepository from "./BaseRepository.js";
import { DataBase, getGridFSBucket } from "../config/db.js";

export default class ProductRepository extends BaseRepository {
  constructor() {
    super("products");
  }

  get db() {
    return DataBase();
  }

  get bucket() {
    return getGridFSBucket();
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
    const variationFilesMap = new Map();

    files.forEach(file => {
      const match = file.fieldname.match(/variations\[(\d+)\]\[imagens\]/);
      if (match && match[1]) {
        const variationIndex = parseInt(match[1], 10);
        if (!variationFilesMap.has(variationIndex)) {
          variationFilesMap.set(variationIndex, []);
        }
        variationFilesMap.get(variationIndex).push(file);
      }
    });

    let rawVariations = [];
    if (Array.isArray(body.variations)) {
      rawVariations = body.variations;
    } else if (body.cores || body.tamanhos || body.preco || body.estoque || variationFilesMap.has(0)) {
      rawVariations.push(body); 
    }

    const processedVariations = [];
    for (let i = 0; i < rawVariations.length; i++) {
      const variationBody = rawVariations[i];
      const filesForThisVariation = variationFilesMap.get(i) || [];
      
      const uploadedVariationImageNames = [];
      for (const file of filesForThisVariation) {
        const uploadedName = await this.#uploadFileWithRetry(file);
        uploadedVariationImageNames.push(uploadedName);
      }
      
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

    // Herança: Utiliza o método genérico do BaseRepository
    const insertedId = await super.create(productData);
    return { message: "Produto adicionado com sucesso!", productId: insertedId };
  }

  async findByIds(ids, projection = {}) {
    const validIds = ids.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
    if (validIds.length === 0) return [];

    return await this.collection.find({ _id: { $in: validIds } }, { projection }).toArray();
  }

  async updateProductWithImages(id, body, files = []) {
    if (!ObjectId.isValid(id)) throw new Error("ID de produto inválido.");

    // Herança
    const existingProduct = await super.findById(id);
    if (!existingProduct) throw new Error("Produto não encontrado.");

    const newImages = [];
    if (files.length) {
      for (const file of files) {
        try {
          const uploadedName = await this.#uploadFileWithRetry(file);
          newImages.push(uploadedName);
        } catch (error) {
          console.error(`Erro ao processar imagem no update: ${error.message}`);
        }
      }
    }

    const keptImages = Array.isArray(body.existingImages) 
      ? body.existingImages 
      : body.existingImages ? [body.existingImages] : [];

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

    // Herança
    await super.update(id, productData);
    return await super.findById(id);
  }

  async deleteProductAndImages(id) {
    if (!ObjectId.isValid(id)) throw new Error("ID de produto inválido.");

    // Herança
    const product = await super.findById(id);
    if (!product) throw new Error("Produto não encontrado.");

    if (product.imagens?.length > 0) {
      const filesCollection = this.db.collection('fs.files');
      const filesToDelete = await filesCollection.find({ filename: { $in: product.imagens } }).toArray();
      
      const deletePromises = filesToDelete.map(file => this.bucket.delete(file._id));
      await Promise.all(deletePromises);
    }

    // Herança
    const isDeleted = await super.delete(id);
    if (!isDeleted) throw new Error("Não foi possível deletar o produto.");
    
    return { success: true };
  }

  async getImageMetadata(filename) {
    const filesCollection = this.db.collection('uploads.files');
    return await filesCollection.findOne({ filename });
  }

  getImageStream(filename) {
    return this.bucket.openDownloadStreamByName(filename);
  }
}