import BaseRepository from "./BaseRepository.js";

export default class OtpRepository extends BaseRepository {
  constructor() {
    super("otps");
  }

  async upsertCode(identifier, otp, expiresAt) {
    const now = new Date();
    return await this.collection.updateOne(
      { identifier: identifier.toLowerCase() },
      { $set: { otp, createdAt: now, expiresAt } },
      { upsert: true }
    );
  }

  /** Busca um código válido e o consome (uso único). Retorna o documento ou null. */
  async consumeValidCode(identifier, otp) {
    const entry = await this.collection.findOne({
      identifier: identifier.toLowerCase(),
      otp,
      expiresAt: { $gt: new Date() },
    });
    if (!entry) return null;

    await this.collection.deleteOne({ _id: entry._id });
    return entry;
  }
}

// Índice TTL recomendado (executar uma vez no shell do MongoDB):
// db.otps.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 })
