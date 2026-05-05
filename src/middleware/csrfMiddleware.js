import { randomBytes } from "crypto";
import { GeneralError } from "../errors/customErrors.js";

/**
 * Middleware para gerar e expor um token CSRF para os templates.
 * Este middleware deve ser usado em TODAS as rotas GET que renderizam formulários.
 */
export const generateCsrfToken = (req, res, next) => {
  // Gera um novo token se não houver um na sessão
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString("hex");
  }

  // Expõe o token para os templates EJS;
  res.locals.csrfToken = req.session.csrfToken;

  next();
};

/**
 * Middleware para validar o token CSRF em requisições que alteram estado.
 * Este middleware deve ser usado em rotas POST, PUT, DELETE, PATCH.
 */
export const validateCsrfToken = (req, res, next) => {
  // O token pode vir do corpo da requisição (formulários) ou de um cabeçalho (AJAX);
  const receivedToken = req.headers["x-csrf-token"] || (req.body && req.body._csrf);
  const sessionToken = req.session.csrfToken;

  console.log("receivedToken", receivedToken);

  console.log("sessionToken", sessionToken);

  // Verifica se os tokens existem e são iguais;
  if (!sessionToken || !receivedToken || sessionToken !== receivedToken) {
    console.warn("Falha na validação do token CSRF.", {
      sessionToken: sessionToken?.slice(0, 5), // Log apenas o início para segurança;
      receivedToken: receivedToken?.slice(0, 5),
      path: req.path,
      method: req.method,
    });

    // Para requisições de API, envie um erro JSON. Para outras, pode redirecionar.
    // Lança um erro que será capturado pelo errorHandler.
    return next(new GeneralError(
      "Ação não permitida. Token de segurança inválido ou ausente.",
      403, // 403 Forbidden
    ));
  } // Se a validação for bem-sucedida, continua para o próximo middleware ou controller

  next();
};

// --- Middleware de Autenticação Aprimorado ---

export const authMiddleware = (req, res, next) => {
  // Suporta token via cookie ou header Authorization: Bearer <token>
  const authHeader = req.headers.authorization || req.headers.Authorization;
  let token = null;
  if (authHeader && String(authHeader).startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {

    return res.status(statusCode).json({
      success: false,
      message: "Acesso negado. Nenhum token fornecido."
    });
  }

  const decoded = verificarToken(token);
  if (!decoded) {

    return res.status(statusCode).json({
      success: false,
      message: "Token inválido ou expirado."
    });
  }// Adiciona os dados do usuário decodificados ao objeto de requisição para uso posterior

  next();
};