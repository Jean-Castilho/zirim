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

  async uploadProductAndImage(req) {
    const files = req.files;

    if (!files || files.length === 0) {
      throw new GeneralError("Nenhum arquivo enviado.", 400);
    }

    const bucket = getGridFSBucket();

    // Com o Promise.all, se qualquer upload falhar, ele irá rejeitar e cair no bloco catch da rota.
    // Isso simplifica o código pois não precisamos verificar os resultados um a um.
    const successfulUploads = await Promise.all(
      files.map(file => this.#uploadFileWithRetry(file, bucket))
    );

    const productData = {
      // --- Informações Principais ---
      name: req.body.name,
      preco: parseFloat(req.body.preco),
      imagens: successfulUploads,
      // --- Organização e Estilo ---
      estilo: req.body.estilo,
      colecao: req.body.colecao,
      // --- Logística e Garantia ---
      estoque: req.body.estoque,
      garantia: req.body.garantia,
      ativo: req.body.ativo,
      categoria: req.body.categoria,
      descricao: req.body.descricao
    };

    const result = await this.getCollection().insertOne(productData);

    return {
      _id: result.insertedId,
      ...productData,
    };
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

  async updateProduct(req) {
    const { id } = req.params;
    const { body, files } = req;

    if (!ObjectId.isValid(id)) {
      const err = new Error("ID de produto inválido.");
      err.statusCode = 400;
      throw err;
    }

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
      nome: body.nome,
      slug: body.slug,
      preco: parseFloat(body.preco),
      imagens: finalImages,
      estilo: body.estilo,
      colecao: body.colecao,
      estoque: body.estoque,
      garantia: body.garantia,
      ativo: body.ativo,
      categoria: body.categoria,
      descricao: body.descricao,
      dimensoes: {
        altura: body.altura,
        largura: body.largura,
        profundidade: body.profundidade,
      },
      peso: body.peso,
    };

    await this.getCollection().updateOne(
      { _id: new ObjectId(id) },
      { $set: productData }
    );

    return await this.getProductById(id);
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