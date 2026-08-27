import { DataBase } from "../config/db.js";

const OTP_LIFETIME_MINUTES = 5;

const getOtpCollection = () => {
  const db = DataBase();
  return db.collection("otps");
};

/**
 * Gera um código OTP numérico de 6 dígitos.
 * @returns {string} O código OTP gerado.
 */
export const generateOtpCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const generateOTP = generateOtpCode;

/**
 * Armazena um código OTP no banco de dados com um tempo de expiração.
 * Substitui qualquer OTP existente para o mesmo identificador (email/telefone).
 * @param {string} identifier - O identificador do usuário (e.g., 'user@example.com').
 * @param {string} otp - O código OTP a ser armazenado.
 */
export const storeOtpCode = async (identifier, otp) => {
  const collection = getOtpCollection();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_LIFETIME_MINUTES * 60 * 1000);

  await collection.updateOne(
    { identifier: identifier.toLowerCase() },
    {
      $set: {
        otp,
        createdAt: now,
        expiresAt,
      },
    },
    { upsert: true }
  );
};

export const armazenCodeOtp = storeOtpCode;

/**
 * Verifica se um código OTP é válido e, em caso afirmativo, o invalida para uso futuro.
 * @param {string} identifier - O identificador do usuário (e.g., 'user@example.com').
 * @param {string} otp - O código OTP fornecido pelo usuário.
 * @returns {Promise<object|null>} Retorna o documento OTP se for válido, caso contrário, null.
 */
export const verifyOtpCode = async (identifier, otp) => {
  const collection = getOtpCollection();
  const normalizedIdentifier = identifier.toLowerCase();

  const otpEntry = await collection.findOne({
    identifier: normalizedIdentifier,
    otp: otp,
    expiresAt: { $gt: new Date() },
  });

  if (!otpEntry) {
    return null;
  }

  await collection.deleteOne({ _id: otpEntry._id });

  return otpEntry;
};

export const verifyCode = verifyOtpCode;

// INSTRUÇÃO PARA OTIMIZAÇÃO DE BANCO DE DADOS (Índice TTL):
// execute o seguinte comando uma vez no seu shell do MongoDB:
//
// db.otps.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 })
//
// Isso instrui o banco de dados a excluir automaticamente qualquer documento
// da coleção 'otps' quando a data em 'expiresAt' for atingida.
// Isso mantém sua coleção pequena e as consultas rápidas.