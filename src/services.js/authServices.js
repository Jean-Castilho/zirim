import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

export async function criarHashPass(password) {
  const saltRounds = parseInt(process.env.SALT_ROUNDS || "12", 10);
  const salt = await bcrypt.genSalt(saltRounds);
  const hashedPassword = await bcrypt.hash(password, salt);
  return hashedPassword;
}

export function criarToken(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET não está definido no arquivo .env.");
  }
  const expiresIn = process.env.JWT_EXPIRATION || "1h";
  return jwt.sign(payload, secret, { expiresIn });
}

export async function compararSenha(password, hashedPassword) {
  const match = await bcrypt.compare(password, hashedPassword);
  return match;
}