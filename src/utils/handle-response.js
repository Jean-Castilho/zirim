/**
 * Módulo único de respostas HTTP.
 *
 * - Helpers de sucesso (JSON, vazio, HTMX, redirect adaptativo)
 * - Renderização de páginas (layout completo ou fragmento HTMX)
 * - asyncHandler: encaminha qualquer erro (sync ou async) ao errorMiddleware
 * - errorMiddleware: ÚNICO ponto de conversão de erro -> resposta HTTP
 *
 * Controllers não montam respostas de erro: lançam (ou deixam propagar) erros de domínio.
 */

import {
  GeneralError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ExternalServiceError,
} from "./errors.js";

// Re-export para manter compatibilidade com os imports existentes
export {
  GeneralError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ExternalServiceError,
};

const ERROR_VIEW = "../pages/partials/Error";

// ============================================================================
// DETECÇÃO DO TIPO DE REQUISIÇÃO
// ============================================================================

export const isHtmxRequest = (req) => req.headers?.["hx-request"] === "true";

/** Cliente espera JSON (fetch/XHR/Accept json/body JSON). Não inclui HTMX. */
export const wantsJson = (req) =>
  Boolean(req.xhr || req.headers?.accept?.includes("json") || req.is?.("json"));

// ============================================================================
// RESPOSTAS DE SUCESSO
// ============================================================================

/** JSON padrão de sucesso: { success: true, message?, ...data } */
export const sendSuccess = (res, { status = 200, message, data = {} } = {}) => {
  const body = { success: true, ...(message ? { message } : {}), ...data };
  return res.status(status).json(body);
};

/** JSON cru (arrays/objetos que o front consome diretamente). */
export const sendData = (res, data, status = 200) => res.status(status).json(data);

/** Resposta vazia (usada por HTMX para remover/limpar elementos). */
export const sendEmpty = (res, status = 200) => res.status(status).send("");

/** Texto simples (usado por fragmentos HTMX de feedback). */
export const sendText = (res, text, status = 200) => res.status(status).send(text);

/** Dispara toast no front via HX-Trigger. */
export const setHtmxNotification = (res, message, type = "success") => {
  res.setHeader("HX-Trigger", JSON.stringify({ showNotification: { message, type } }));
};

/**
 * Resposta que se adapta ao tipo de cliente:
 *  - HTMX            -> corpo vazio (+ toast opcional / refresh opcional)
 *  - JSON/XHR        -> sendSuccess
 *  - navegação comum -> redirect (se informado) ou JSON
 */
export const respond = (req, res, {
  status = 200,
  message,
  data = {},
  redirectTo = null,
  htmx = {},
} = {}) => {
  if (isHtmxRequest(req)) {
    if (htmx.notify && message) setHtmxNotification(res, message, "success");
    if (htmx.refresh) res.setHeader("HX-Refresh", "true");
    if (htmx.redirect) res.setHeader("HX-Redirect", htmx.redirect);
    return sendEmpty(res, 200);
  }

  if (!wantsJson(req) && redirectTo) {
    return res.redirect(redirectTo);
  }

  return sendSuccess(res, { status, message, data });
};

// ============================================================================
// PÁGINAS
// ============================================================================

export const renderPage = (req, res, page, options = {}) => {
  if (isHtmxRequest(req)) {
    const htmxPage = page.startsWith("../") ? page.substring(3) : page;
    return res.render(htmxPage, options);
  }
  return res.render(res.locals.layout || "./layout/main", { page, ...options });
};

export const renderError = (req, res, statusCode, message) => {
  res.status(statusCode);
  return renderPage(req, res, ERROR_VIEW, {
    titulo: "Erro",
    statusCode,
    errorMessage: message,
  });
};

// ============================================================================
// TRATAMENTO DE ERROS
// ============================================================================

/**
 * Normaliza qualquer erro capturado (domínio, driver do Mongo, parser JSON...)
 * para { statusCode, payload }.
 */
export const parseErrorData = (error) => {
  if (error instanceof GeneralError) {
    return { statusCode: error.getCode(), payload: error.toJSON() };
  }

  let statusCode = error?.statusCode || error?.status || 500;
  let message = error?.message || "Ocorreu um erro interno no servidor.";

  if (error?.name === "CastError" || /ObjectId/i.test(message)) {
    statusCode = 400;
    message = "Identificador inválido.";
  }

  // Não vaza detalhes internos em erros 5xx inesperados
  if (statusCode >= 500 && process.env.NODE_ENV === "production") {
    message = "Ocorreu um erro interno no servidor.";
  }

  const payload = {
    success: false,
    message,
    error: message,
    type: error?.name || "Error",
    code: statusCode,
  };
  if (error?.errors) payload.details = error.errors;

  return { statusCode, payload };
};

/** Envolve um handler (sync/async) e encaminha rejeições ao errorMiddleware. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve().then(() => fn(req, res, next)).catch(next);

/** Middleware global de tratamento de erros do Express. */
export const errorMiddleware = (err, req, res, next) => {
  const { statusCode, payload } = parseErrorData(err);

  if (statusCode >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  if (res.headersSent) return next(err);

  if (wantsJson(req) || isHtmxRequest(req)) {
    return res.status(statusCode).json(payload);
  }

  return renderError(req, res, statusCode, payload.message);
};
