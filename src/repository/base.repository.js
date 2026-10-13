import { ObjectId } from "mongodb";
import { DataBase, getGridFSBucket } from "../config/db.js";
import { ValidationError } from "../utils/errors.js";

/**
 * Repository base: acesso genérico a uma coleção.
 * Contém SOMENTE persistência — sem regra de negócio e sem conhecimento de HTTP.
 * Falhas de entrada lançam ValidationError (tratado pelo errorMiddleware).
 */
export default class BaseRepository {
  constructor(collectionName) {
    if (!collectionName) {
      throw new Error("O nome da coleção é obrigatório.");
    }
    this.collectionName = collectionName;
  }

  // Getters garantem que a conexão seja resolvida no momento do uso
  get db() {
    return DataBase();
  }

  get collection() {
    return this.db.collection(this.collectionName);
  }

  get bucket() {
    return getGridFSBucket();
  }

  /** Filtro por _id aceitando ObjectId e string. */
  idQuery(id) {
    return ObjectId.isValid(id)
      ? { $or: [{ _id: new ObjectId(id) }, { _id: String(id) }] }
      : { _id: String(id) };
  }

  requireId(id) {
    if (!id) throw new ValidationError("ID obrigatório.");
    return id;
  }

  async findById(id, projection = {}) {
    if (!id) return null;
    return await this.collection.findOne(this.idQuery(id), { projection });
  }

  async findAll(query = {}, options = {}) {
    return await this.collection.find(query, options).toArray();
  }

  async count(query = {}) {
    return await this.collection.countDocuments(query);
  }

  async create(data) {
    const result = await this.collection.insertOne(data);
    return result.insertedId;
  }

  async update(id, data) {
    this.requireId(id);
    const result = await this.collection.updateOne(this.idQuery(id), { $set: data });
    return result.modifiedCount > 0;
  }

  async delete(id) {
    this.requireId(id);
    const result = await this.collection.deleteOne(this.idQuery(id));
    return result.deletedCount > 0;
  }
}
