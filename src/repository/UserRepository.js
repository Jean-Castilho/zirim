import { ObjectId } from "mongodb";
import BaseRepository from "./BaseRepository.js";

export default class UserRepository extends BaseRepository {
  constructor() {
    super("users");
  }

  async findByEmailForAuth(email) {
    return await this.findByEmail(email, {
      projection: {
        email: 1,
        password: 1,
        numero: 1,
        role: 1
      }
    });
  }

  async findByEmail(email, options = {}) {
    if (!email) return null;
    const normalized = String(email).trim().toLowerCase();
    return await this.collection.findOne({
      $or: [
        { "email.endereco": normalized }
      ]
    }, options);
  }

  async findByPhone(phone) {
    if (!phone) return null;
    const normalizedPhone = String(phone).trim();
    return await this.collection.findOne({
      $or: [
        { "phone.number": normalizedPhone }
      ]
    });
  }

  async findOne(query, options = {}) {
    if (!query || Object.keys(query).length === 0) return null;
    return await this.collection.findOne(query, options);
  }

  async verifyExists({ email, phone } = {}) {
    const orConditions = [];
    if (email) {
      const normalizedEmail = String(email).trim().toLowerCase();
      orConditions.push({ "email.endereco": normalizedEmail });
      orConditions.push({ "email": normalizedEmail });
    }
    if (phone) {
      const normalizedPhone = String(phone).trim();
      orConditions.push({ "phone.number": normalizedPhone });
      orConditions.push({ "phone": normalizedPhone });
    }

    if (orConditions.length === 0) return null;

    return await this.collection.findOne({ $or: orConditions });
  }

  async create(data) {
    const userDoc = {
      name: data.name,
      password: data.password,
      phone: { verified: false, number: data.phone },
      email: { verified: false, endereco: data.email },
      role: data.role || "user",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      orderns: [],
      cart: [],
      favorites: [],
    };

    const result = await this.collection.insertOne(userDoc);
    return { ...userDoc, _id: result.insertedId };
  }

  async updateProfile(id, data) {
    const updateFields = {};
    
    // Mapeamento de campos para a estrutura do MongoDB
    if (data.name) updateFields.name = data.name;
    if (data.email) updateFields['email.endereco'] = data.email;
    if (typeof data.emailVerified === 'boolean') updateFields['email.verified'] = data.emailVerified;
    if (data.phone) updateFields['phone.number'] = data.phone;
    if (data.role) updateFields.role = data.role;
    if (data.password) updateFields.password = data.password;
    
    updateFields.updatedAt = new Date();

    if (Object.keys(updateFields).length === 0) {
      throw new Error("Nenhum dado para atualizar foi fornecido.");
    }

    return await this.update(id, updateFields);
  }
}
