import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

export async function createHashPassword(password) {
  const saltRounds = parseInt(process.env.SALT_ROUNDS || "12", 10);
  const salt = await bcrypt.genSalt(saltRounds);
  const hashedPassword = await bcrypt.hash(password, salt);
  return hashedPassword;
}

export const criarHashPass = createHashPassword;

export function createToken(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET não está definido no arquivo .env.");
  }
  const expiresIn = process.env.JWT_EXPIRATION || "1h";
  return jwt.sign(payload, secret, { expiresIn });
}

export const criarToken = createToken;

export async function comparePassword(password, hashedPassword) {
  const match = await bcrypt.compare(password, hashedPassword);
  return match;
}

export const compararSenha = comparePassword;