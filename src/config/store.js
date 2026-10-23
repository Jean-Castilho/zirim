import dotenv from "dotenv";
dotenv.config();

/**
 * Nome da loja, usado em títulos, cabeçalho, textos, cobranças e e-mails.
 * Defina STORE_NAME no .env (padrão: "Zirim").
 */
export const STORE_NAME = (process.env.STORE_NAME || "Zirim").trim();
