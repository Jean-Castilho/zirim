import { UnauthorizedError } from "./errors.js";

const promisify = (fn) =>
  new Promise((resolve, reject) => fn((error) => (error ? reject(error) : resolve())));

export const regenerateSession = (req) => promisify((cb) => req.session.regenerate(cb));
export const saveSession = (req) => promisify((cb) => req.session.save(cb));

/** Retorna o usuário da sessão ou lança 401. */
export const requireSessionUser = (req, message = "Usuário não autenticado.") => {
  const user = req.session?.user;
  if (!user?._id) throw new UnauthorizedError(message);
  return user;
};

export const sanitizeUser = (user) => {
  const { password, ...safeUser } = user;
  return safeUser;
};

/** Normaliza o usuário para guardar na sessão (ObjectId -> string). */
export const toSessionUser = (user) => ({ ...sanitizeUser(user), _id: user._id.toString() });
