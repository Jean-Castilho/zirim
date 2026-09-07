/**
 * Módulo centralizado de gerenciamento de respostas HTTP
 * Combina funcionalidades de respostas JSON, páginas EJS e tratamento de erros.
 */

// ============================================================================
// UTILITÁRIOS INTERNOS
// ============================================================================

/**
 * Normaliza qualquer erro capturado para um formato de resposta padrão.
 * @param {Error} error - O erro capturado.
 * @returns {{ statusCode: number, payload: object }}
 */
const parseErrorData = (error) => {
  if (error instanceof GeneralError) {
    return { statusCode: error.getCode(), payload: error.toJSON() };
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Ocorreu um erro interno no servidor.';
  const payload = {
    message,
    error: message,
    type: error.name || 'Error',
    code: statusCode,
  };

  if (error.errors) payload.details = error.errors;

  return { statusCode, payload };
};

// ============================================================================
// FUNÇÕES DE RESPOSTA HTTP
// ============================================================================

export const sendResponse = (res, statusCode, data) => {
  res.status(statusCode).json(data);
};

export const renderPage = (req, res, page, options = {}) => {
  const isHtmxRequest = req.headers["hx-request"] === "true";
  
  if (isHtmxRequest) {
    // Evita manipulação frágil de strings. Substitui o prefixo explícito caso exista.
    const htmxPage = page.startsWith("../") ? page.substring(3) : page;
    res.render(htmxPage, options);
  } else {
    res.render(res.locals.layout || './layout/main', { page, ...options });
  }
};

export const handleResponse = async (res, servicePromise, successStatusCode = 200) => {
  try {
    const result = await servicePromise;
    sendResponse(res, successStatusCode, result);
  } catch (error) {
    const { statusCode, payload } = parseErrorData(error);
    sendResponse(res, statusCode, payload);
  }
};

export const renderPageWithData = async (req, res, page, dataPromise, defaultOptions = {}) => {
  try {
    const data = await dataPromise;
    renderPage(req, res, page, { ...defaultOptions, ...data });
  } catch (error) {
    const { statusCode, payload } = parseErrorData(error);
    
    renderPage(req, res, "../pages/partials/Error", {
      titulo: "Erro",
      statusCode,
      errorMessage: payload.error,
    });
  }
};

/**
 * Middleware global de tratamento de erros para Express.
 */
export const errorMiddleware = (err, req, res, next) => {
  const { statusCode, payload } = parseErrorData(err);
  
  // Se for uma requisição que espera JSON ou HTMX
  if (req.xhr || req.headers.accept?.includes('json') || req.headers['hx-request']) {
    return res.status(statusCode).json(payload);
  }
  
  // Caso contrário, tenta renderizar uma página de erro amigável
  renderPage(req, res, "../pages/partials/Error", {
    titulo: "Erro",
    statusCode,
    errorMessage: payload.message || payload.error,
  });
};

// ============================================================================
// SISTEMA DE ERROS CUSTOMIZADOS
// ============================================================================

export class GeneralError extends Error {
  constructor(message, code = 500, errors = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.errors = errors;
  }

  getCode() {
    return this.code;
  }

  toJSON() {
    const result = {
      message: this.message,
      error: this.message,
      type: this.name,
      code: this.getCode(),
    };
    if (this.errors) result.details = this.errors;
    
    return result;
  }
}

export class ValidationError extends GeneralError {
  constructor(message = "Falha na validação de dados", errors = []) {
    super(message, 400, Array.isArray(errors) ? errors : [errors]);
  }
}

export class NotFoundError extends GeneralError {
  constructor(message = "Recurso não encontrado") {
    super(message, 404);
  }
}

export class UnauthorizedError extends GeneralError {
  constructor(message = "Não autorizado") {
    super(message, 401);
  }
}
