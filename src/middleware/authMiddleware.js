import { randomBytes } from "crypto";
import { GeneralError } from "../utils/handleResponse.js"; 

/**
 * Gera e expõe um token CSRF para os templates.
 * Deve ser usado em rotas GET que renderizam formulários.
 */
export const generateCsrfToken = (req, res, next) => {
  if (!req.session) {
    return next(new GeneralError("Sessão não inicializada.", 500));
  }

  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString("hex"); 
  }
  res.locals.csrfToken = req.session.csrfToken; 

  next(); 
};

/**
 * Valida o token CSRF em requisições que alteram estado.
 * Deve ser usado em rotas POST, PUT, DELETE, PATCH.
 */
export const validateCsrfToken = (req, res, next) => {
  // O token pode vir do corpo da requisição (formulários) ou de um cabeçalho (AJAX)
  const receivedToken = req.headers["x-csrf-token"] || (req.body && req.body._csrf);
  const sessionToken = req.session?.csrfToken;

  // Verifica se os tokens existem e são iguais
  if (!sessionToken || !receivedToken || sessionToken !== receivedToken) {
    console.warn("Falha na validação do token CSRF.", {
      path: req.path, 
      method: req.method, 
    });

    // Lança um erro que será capturado pelo errorHandler centralizado
    return next(new GeneralError(
      "Ação não permitida. Token de segurança inválido ou ausente.",
      403 // 403 Forbidden
    ));
  }
  
  next();
};

/**
 * Protege rotas que exigem usuário logado (baseado na sessão).
 */
export const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    // Retorna erro JSON para requisições de API/AJAX, senão redireciona
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
      return next(new GeneralError("Acesso não autorizado.", 401));
    }
    return res.redirect("/login");
  }
  next();
};

/**
 * Protege rotas que exigem privilégios de administrador.
 */
export const requireAdmin = (req, res, next) => {
  if (!req.session || !req.session.user || req.session.user.role !== "admin") {
    // Retorna erro JSON para requisições de API/AJAX, senão redireciona
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
      return next(new GeneralError("Acesso negado. Privilégios insuficientes.", 403));
    }
    return res.redirect("/login");
  }
  next();
};
