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
    if (!id) return null;
    
    // Tenta buscar por ObjectId se for válido, senão busca pela string pura
    const query = ObjectId.isValid(id) 
      ? { $or: [{ _id: new ObjectId(id) }, { _id: String(id) }] }
      : { _id: String(id) };

    return await this.collection.findOne(query, { projection });
  }

  async findAll(query = {}, options = {}) {
    return await this.collection.find(query, options).toArray();
  }

  async create(data) {
    const result = await this.collection.insertOne(data);
    return result.insertedId;
  }

  async update(id, data) {
    if (!id) throw new Error("ID obrigatório.");
    
    const query = ObjectId.isValid(id) 
      ? { $or: [{ _id: new ObjectId(id) }, { _id: String(id) }] }
      : { _id: String(id) };

    const result = await this.collection.updateOne(query, { $set: data });
    return result.modifiedCount > 0;
  }

  async delete(id) {
    if (!id) throw new Error("ID obrigatório.");
    
    const query = ObjectId.isValid(id) 
      ? { $or: [{ _id: new ObjectId(id) }, { _id: String(id) }] }
      : { _id: String(id) };

    const result = await this.collection.deleteOne(query);
    return result.deletedCount > 0;
  }
}
