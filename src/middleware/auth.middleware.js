import { randomBytes, timingSafeEqual } from "crypto";
import { GeneralError } from "../utils/handle-response.js"; 

const expectsJson = (req) =>
  Boolean(req.xhr || req.headers.accept?.includes("json") || req.headers["hx-request"]);

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
  const sessionToken = req.session?.csrfToken || "";

  const isValid = Boolean(
    receivedToken &&
    sessionToken &&
    sessionToken.length === receivedToken.length &&
    timingSafeEqual(
      Buffer.from(sessionToken),
      Buffer.from(receivedToken)
    )
  );

  if (!isValid) {
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
    if (expectsJson(req)) {
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
    if (expectsJson(req)) {
      return next(new GeneralError("Acesso negado. Privilégios insuficientes.", 403));
    }
    return res.redirect("/login");
  }
  next();
};

/**
 * Protege rotas que exigem perfil de entregador (ou administrador).
 */
export const requireCourier = (req, res, next) => {
  const role = req.session?.user?.role;
  if (!req.session?.user || (role !== "entregador" && role !== "admin")) {
    if (expectsJson(req)) {
      return next(new GeneralError("Acesso negado. Apenas entregadores autorizados podem realizar esta operação.", 403));
    }
    return res.redirect("/login");
  }
  next();
};
