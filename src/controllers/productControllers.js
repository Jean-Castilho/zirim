import { ObjectId } from "mongodb";
import sharp from 'sharp';
import { getDataBase } from "../config/db.js";
import { GeneralError } from "../errors/customErrors.js";
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

  /**
   * Tries to upload a file to GridFS with a retry mechanism.
   * @param {object} file - The file object from multer (with buffer).
   * @param {GridFSBucket} bucket - The GridFS bucket instance.
   * @param {number} retries - The number of times to retry on failure.
   * @returns {Promise<string>} A promise that resolves with the unique filename.
   */
  async #uploadFileWithRetry(file, bucket, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await new Promise((resolve, reject) => {
          const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;

          const uploadStream = bucket.openUploadStream(uniqueName, {
            contentType: 'image/webp',
            metadata: { originalname: file.originalname },
          });

          // Faz o pipe do processo de otimização do sharp diretamente para o upload stream do GridFS
          // Isso é mais eficiente em termos de memória do que criar um buffer intermediário
          sharp(file.buffer)
            .resize({ width: 1200, fit: 'inside', withoutEnlargement: true })
            .toFormat('webp', { quality: 80 })
            .pipe(uploadStream)
            .on('finish', () => resolve(uniqueName))
            .on('error', (err) => {
              // Garante que o stream de upload seja abortado em caso de erro
              uploadStream.abort();
              reject(err);
            });
        });
      } catch (error) {
        if (i === retries - 1) throw error;
      }
    }
  }

  async uploadProductAndImage(req,res) {
    // Note: 'res' é passado para uso potencial futuro, mas esta função deve principalmente retornar dados para handleResponse.
    const allFiles = req.files;
    const bucket = getGridFSBucket();

    const mainProductImages = [];
    const variationFilesMap = new Map(); // Map<variationIndex, Array<file>>

    if (!allFiles || allFiles.length === 0) {
      // Se nenhum arquivo for enviado, o produto pode ser criado sem imagens.
      // Dependendo da lógica de negócio, isso pode ser um erro ou permitido.
      // Por enquanto, permite-se continuar sem arquivos.
    } else {
      allFiles.forEach(file => {
        if (file.fieldname === 'imagens') { // Imagens do produto principal (do input geral de imagens)
          mainProductImages.push(file);
        } else if (file.fieldname.startsWith('variations[') && file.fieldname.includes('][imagens]')) {
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

    // Upload das imagens do produto principal
    const uploadedMainImageNames = await Promise.all(
      mainProductImages.map(file => this.#uploadFileWithRetry(file, bucket))
    );

    let rawVariations = [];
    // Normaliza a entrada de variações: se o array 'variations' existe, usa-o.
    // Caso contrário, se campos de nível superior sugerem uma única variação, cria um array de um elemento.
    if (req.body.variations && Array.isArray(req.body.variations)) {
      rawVariations = req.body.variations;
    } else if (req.body.cores || req.body.tamanhos || req.body.preco || req.body.estoque || variationFilesMap.has(0)) {
      // Verifica se algum campo relacionado à variação está presente no nível superior
      rawVariations.push(req.body);
    }

    const processedVariations = [];
    for (let i = 0; i < rawVariations.length; i++) {
      const variationBody = rawVariations[i];
      const filesForThisVariation = variationFilesMap.get(i) || [];

      // Upload das imagens para esta variação específica
      const uploadedVariationImageNames = await Promise.all(
        filesForThisVariation.map(file => this.#uploadFileWithRetry(file, bucket))
      );

      // Cria um objeto temporário para passar para #processVariationObject, incluindo os nomes das imagens uploaded
      const variationSourceWithImages = {
        ...variationBody,
        imagens: uploadedVariationImageNames,
      };
      processedVariations.push(this.#processVariationObject(variationSourceWithImages));
    }

    const productData = {
      nome: req.body.name,
      imagens: uploadedMainImageNames,
      variacoes: processedVariations,
      categoria: req.body.categoria,
      descricao: req.body.descricao
    };

    console.log(productData); // Para depuração

    const result = await this.getCollection().insertOne(productData);

    // Retorna os dados para handleResponse processar.
    // handleResponse então enviará a resposta HTTP apropriada e redirecionará se necessário.
    return { message: "Produto adicionado com sucesso!", productId: result.insertedId };
  }

  async getProductsByIds(ids, projection = {}) {

    const validIds = ids
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id));

    if (validIds.length === 0) return [];

    if (projection.length > 0) {
      return await this.getCollection()
        .find({ _id: { $in: validIds } })
        .project(projection)
        .toArray();
    }

    return await this.getCollection().find({ _id: { $in: validIds } }).toArray();

  }

  async getProductById(id) {
    if (!ObjectId.isValid(id)) return null;
    return await this.getCollection().findOne({ _id: new ObjectId(id) });
  }

  async updateProduct(req) {
    const { id } = req.params;
    const { body, files } = req;

    if (!ObjectId.isValid(id)) {
      const err = new Error("ID de produto inválido.");
      err.statusCode = 400;
      throw err;
    }

    // TODO: A lógica de atualização de imagens de variações precisa ser implementada aqui, similar ao uploadProductAndImage.
    const bucket = getGridFSBucket();
    const existingProduct = await this.getProductById(id);

    if (!existingProduct) {
      const err = new Error("Produto não encontrado.");
      err.statusCode = 404;
      throw err;
    }

    // Gerenciar imagens novas
    let newImages = [];
    if (files && files.length > 0) {
      const uploadPromises = files.map(file => this.#uploadFileWithRetry(file, bucket));
      const results = await Promise.allSettled(uploadPromises);
      newImages = results
        .filter(res => res.status === 'fulfilled')
        .map(res => res.value);
    }

    // Gerenciar imagens existentes
    const keptImages = body.existingImages ? (Array.isArray(body.existingImages) ? body.existingImages : [body.existingImages]) : [];

    // Combinar imagens
    const finalImages = [...keptImages, ...newImages];

    const productData = {
      nome: body.name || body.nome, // Support both 'name' (from add form) and 'nome'
      preco: parseFloat(body.preco),
      imagens: finalImages,
      variacoes: [], // Initialize as an empty array to store multiple variations
      // --- Logística e Classificação ---
      categoria: body.categoria,
      descricao: body.descricao,
    };

    // Process variations if provided as an array in the request body
    if (body.variations && Array.isArray(body.variations)) {
      productData.variacoes = body.variations.map(variation => this.#processVariationObject(variation));
    } else {
      // Fallback: if 'variations' array is not provided, create a single variation from top-level fields
      const singleVariation = this.#processVariationObject(body);
      if (singleVariation.cores.length > 0 || singleVariation.tamanhos.length > 0 || singleVariation.preco > 0 || singleVariation.estoque > 0) {
        productData.variacoes.push(singleVariation);
      }
    }

    await this.getCollection().updateOne(
      { _id: new ObjectId(id) },
      { $set: productData }
    );

    res.redirect("/admin/inventory")
  }

  async deleteProduct(id) {
    if (!ObjectId.isValid(id)) {
      throw new Error("ID de produto inválido.");
    }

    const objectId = new ObjectId(id);
    const bucket = getGridFSBucket();

    // 1. Encontrar o produto para obter a lista de imagens
    const product = await this.getCollection().findOne({ _id: objectId });

    if (!product) {
      throw new Error("Produto não encontrado.");
    }

    // 2. Se o produto tiver imagens, deletá-las do GridFS
    if (product.imagens && product.imagens.length > 0) {
      const db = getDataBase();
      const filesCollection = db.collection('fs.files');

      // Mapeia nomes de arquivos para promises de busca e exclusão
      const deletePromises = product.imagens.map(async (filename) => {
        try {
          // Encontra o arquivo no GridFS pelo nome
          const imageFile = await filesCollection.findOne({ filename: filename });
          if (imageFile) {
            // Deleta o arquivo usando o _id do GridFS
            await bucket.delete(imageFile._id);
            console.log(`Imagem ${filename} deletada com sucesso.`);
          } else {
            console.warn(`Aviso: Imagem ${filename} não encontrada no GridFS.`);
          }
        } catch (error) {
          // Loga o erro mas não para o processo para que outras imagens possam ser deletadas
          console.error(`Erro ao deletar a imagem ${filename}:`, error);
        }
      });

      // Espera todas as operações de exclusão de imagem terminarem
      await Promise.all(deletePromises);
    }

    // 3. Após deletar as imagens, deletar o documento do produto
    const result = await this.getCollection().deleteOne({ _id: objectId });
    if (result.deletedCount === 0) {
      throw new Error("Não foi possível deletar o produto.");
    }

    return result;
  }

}