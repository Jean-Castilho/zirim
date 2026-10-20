import BaseRepository from "./base.repository.js";

/**
 * Acesso à coleção de sessões do connect-mongo.
 * Cada documento guarda a sessão serializada em JSON (campo `session`),
 * onde o usuário aparece como "_id":"<hex>".
 */
export default class SessionRepository extends BaseRepository {
  constructor() {
    super("sessions");
  }

  /**
   * Encerra as sessões de um usuário. `keepSessionId` preserva a sessão atual
   * (usada na troca de senha feita por quem já está logado).
   */
  async revokeForUser(userId, keepSessionId = null) {
    const id = String(userId);
    if (!/^[a-f0-9]{24}$/i.test(id)) return 0;

    const filter = { session: { $regex: `"_id":"${id}"` } };
    if (keepSessionId) filter._id = { $ne: String(keepSessionId) };

    const result = await this.collection.deleteMany(filter);
    return result.deletedCount || 0;
  }
}
