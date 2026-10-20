import { GeneralError } from "../utils/errors.js";

/**
 * Limitador de requisições em memória (janela fixa).
 *
 * Limitação conhecida: o estado é por processo. Com várias instâncias da aplicação,
 * cada instância conta separadamente. Para um limite global, trocar o armazenamento
 * por Redis ou MongoDB mantendo a mesma interface.
 */
const buckets = new Map();

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60 * 1000);
sweep.unref();

/**
 * @param {object} options
 * @param {number} options.windowMs  duração da janela
 * @param {number} options.max       requisições permitidas por janela
 * @param {(req) => string|null} [options.keyFn]  chave do contador; null pula o limite
 * @param {string} [options.message]
 */
export const createRateLimiter = ({
  windowMs,
  max,
  keyFn = (req) => req.ip,
  message = "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
}) => (req, res, next) => {
  const key = keyFn(req);
  if (!key) return next();

  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  if (bucket.count > max) {
    res.set("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
    return next(new GeneralError(message, 429));
  }
  return next();
};

const MINUTE = 60 * 1000;

/** Chave por identificador (e-mail/telefone) normalizado, quando informado no corpo. */
const identifierKey = (fieldNames) => (req) => {
  const raw = fieldNames.map((name) => req.body?.[name]).find((value) => value);
  if (typeof raw !== "string" || !raw.trim()) return null;
  return `id:${raw.trim().toLowerCase()}`;
};

/** Limite por IP. */
const perIp = (windowMinutes, max, message) =>
  createRateLimiter({ windowMs: windowMinutes * MINUTE, max, message });

/** Limite por conta alvo (evita força bruta distribuída contra uma mesma conta). */
const perAccount = (windowMinutes, max, fieldNames, message) =>
  createRateLimiter({
    windowMs: windowMinutes * MINUTE,
    max,
    keyFn: identifierKey(fieldNames),
    message,
  });

export const rateLimits = {
  login: [
    perIp(15, 30),
    perAccount(15, 10, ["email"]),
  ],
  register: [perIp(60, 10)],
  forgotPassword: [
    perIp(15, 10),
    perAccount(60, 3, ["email"]),
  ],
  passwordReset: [perIp(15, 20)],
  otpVerify: [perIp(15, 20)],
  otpSend: [perIp(15, 5)],
};
