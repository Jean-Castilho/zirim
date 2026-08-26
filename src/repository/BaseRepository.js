import { ObjectId } from "mongodb";
import { DataBase } from "../config/db.js";

export default class BaseRepository {
  constructor(collectionName) {
    if (!collectionName) {
      throw new Error("O nome da coleção é obrigatório.");
    }
    this.collectionName = collectionName;
  }

  // Getter encapsulado para garantir que a conexão db() seja resolvida no tempo certo
  get collection() {
    const db = DataBase();
    return db.collection(this.collectionName);
  }

  async findById(id, projection = {}) {
    if (!ObjectId.isValid(id)) return null;
    return await this.collection.findOne({ _id: new ObjectId(id) }, { projection });
  }

  async findAll(query = {}, options = {}) {
    return await this.collection.find(query, options).toArray();
  }

  async create(data) {
    const result = await this.collection.insertOne(data);
    return result.insertedId;
  }

  async update(id, data) {
    if (!ObjectId.isValid(id)) throw new Error("ID inválido.");
    const result = await this.collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: data }
    );
    return result.modifiedCount > 0;
  }

  async delete(id) {
    if (!ObjectId.isValid(id)) throw new Error("ID inválido.");
    const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount > 0;
  }
}
