import BaseRepository from "./base.repository.js";

/** Tentativas erradas permitidas por código antes de ele ser invalidado. */
export const MAX_OTP_ATTEMPTS = 5;

export default class OtpRepository extends BaseRepository {
  constructor() {
    super("otps");
  }

  async upsertCode(identifier, otp, expiresAt) {
    const now = new Date();
    return await this.collection.updateOne(
      { identifier: identifier.toLowerCase() },
      { $set: { otp, createdAt: now, expiresAt, attempts: 0 } },
      { upsert: true }
    );
  }

  /**
   * Confere o código e o consome (uso único). Cada tentativa incrementa o contador
   * de forma atômica; ao atingir MAX_OTP_ATTEMPTS, o código deixa de aceitar tentativas.
   * Retorna o documento ou null.
   */
  async consumeValidCode(identifier, otp) {
    const id = identifier.toLowerCase();
    const now = new Date();

    const entry = await this.collection.findOneAndUpdate(
      {
        identifier: id,
        expiresAt: { $gt: now },
        $or: [
          { attempts: { $lt: MAX_OTP_ATTEMPTS } },
          { attempts: { $exists: false } },
        ],
      },
      { $inc: { attempts: 1 } },
      { returnDocument: "after" }
    );
    if (!entry) return null;

    if (entry.otp !== otp) return null;

    await this.collection.deleteOne({ _id: entry._id });
    return entry;
  }
}

// Índice TTL recomendado (executar uma vez no shell do MongoDB):
// db.otps.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 })
