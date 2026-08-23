/**
 * Módulo centralizado de gerenciamento de respostas HTTP
 * Combina funcionalidades de:
 * - Respostas JSON
 * - Renderização de páginas EJS/HTML
 * - Tratamento de erros
 */

/**
 * Padroniza o envio de respostas JSON na aplicação.
 * @param {object} res - O objeto de resposta do Express.
 * @param {number} statusCode - O código de status HTTP.
 * @param {object} data - O payload da resposta (dados ou objeto de erro).
 */
export const sendResponse = (res, statusCode, data) => {
  res.status(statusCode).json(data);
};

/**
 * Renderiza uma página EJS com suporte automático a HTMX
 * - Se for requisição HTMX: renderiza apenas o fragmento (sem layout)
 * - Se for requisição normal: renderiza com layout principal
 * @param {object} req - Objeto de requisição do Express.
 * @param {object} res - Objeto de resposta do Express.
 * @param {string} page - Caminho da página EJS a renderizar (ex: "../pages/home").
 * @param {object} options - Dados/variáveis a passar para o template.
 * @example
 * renderPage(req, res, "../pages/public/home", { titulo: "Home", products: [...] });
 */
export const renderPage = (req, res, page, options = {}) => {
  const isHtmxRequest = req.headers["hx-request"] === "true";
  
  if (isHtmxRequest) {
    // Requisição HTMX: renderiza apenas o fragmento (sem layout)
    res.render(page.replace("../", ""), options);
  } else {
    // Requisição normal: renderiza com layout principal
    res.render(res.locals.layout || './layout/main', {
      page,
      ...options,
    });
  }
};

/**
 * Lida com o fluxo de uma operação assíncrona e envia a resposta JSON.
 * Captura erros automaticamente e responde com status apropriado.
 * @param {object} res - O objeto de resposta do Express.
 * @param {Promise<any>} servicePromise - A promise retornada pela função do serviço/controller.
 * @param {number} [successStatusCode=200] - O código de status para respostas de sucesso.
 * @example
 * await handleResponse(res, userService.login(req), 200);
 */
export const handleResponse = async (res, servicePromise, successStatusCode = 200) => {
  try {
    const result = await servicePromise;
    sendResponse(res, successStatusCode, result);
  } catch (error) {
    const statusCode = error.getCode?.() || error.statusCode || 500;
    const errorMessage = error.message || 'Ocorreu um erro interno no servidor.';
    const errorData = { error: errorMessage };
    
    // Incluir detalhes do erro se existirem (ex: ValidationError)
    if (error.errors) {
      errorData.details = error.errors;
    }
    
    sendResponse(res, statusCode, errorData);
  }
};

/**
 * Lida com renderização de página com dados assíncrono e tratamento de erro.
 * Se houver erro durante carregamento de dados, renderiza página de erro.
 * @param {object} req - Objeto de requisição do Express.
 * @param {object} res - Objeto de resposta do Express.
 * @param {string} page - Caminho da página EJS a renderizar.
 * @param {Promise<object>} dataPromise - Promise que retorna dados para a página.
 * @param {object} defaultOptions - Opções padrão/contexto para a página.
 * @example
 * await renderPageWithData(req, res, "../pages/products", 
 *   productService.getAll(), 
 *   { titulo: "Produtos" }
 * );
 */
export const renderPageWithData = async (req, res, page, dataPromise, defaultOptions = {}) => {
  try {
    const data = await dataPromise;
    renderPage(req, res, page, { ...defaultOptions, ...data });
  } catch (error) {
    const statusCode = error.getCode?.() || error.statusCode || 500;
    const errorMessage = error.message || "Ocorreu um erro ao carregar a página.";
    
    renderPage(req, res, "../pages/partials/Error", {
      titulo: "Erro",
      statusCode,
      errorMessage,
    });
  }
};

// ============================================================================
// SISTEMA DE ERROS CUSTOMIZADOS
// ============================================================================

/**
 * Classe base para todos os erros da aplicação
 * Mapeia automaticamente para código HTTP apropriado
 * @example
 * const error = new GeneralError("Algo deu errado", 500)
 * error.getCode() // 500
 */
export class GeneralError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.errors = null;
  }

  /**
   * Retorna o código HTTP apropriado para este erro
   * @returns {number} Código HTTP (200-599)
   */
  getCode() {
    if (this.code) return this.code;
    if (this instanceof ValidationError) return 400;
    if (this instanceof NotFoundError) return 404;
    if (this instanceof UnauthorizedError) return 401;
    return 500; // Internal Server Error
  }

  /**
   * Serializa o erro para JSON
   * @returns {object} Objeto com mensagem e detalhes de erro
   */
  toJSON() {
    const result = {
      error: this.message,
      type: this.name,
      code: this.getCode(),
    };
    if (this.errors) {
      result.details = this.errors;
    }
    return result;
  }
}

/**
 * Erro de validação de dados (400 Bad Request)
 * Usado quando dados de entrada não passam na validação
 * @example
 * throw new ValidationError(
 *   "Falha na validação de dados",
 *   [{ field: "email", message: "Email inválido" }]
 * )
 */
export class ValidationError extends GeneralError {
  constructor(message = "Falha na validação de dados", errors = []) {
    super(message, 400);
    this.errors = Array.isArray(errors) ? errors : [errors];
  }
}

/**
 * Erro de recurso não encontrado (404 Not Found)
 * Usado quando uma resource solicitada não existe
 * @example
 * throw new NotFoundError("Produto não encontrado")
 */
export class NotFoundError extends GeneralError {
  constructor(message = "Recurso não encontrado") {
    super(message, 404);
  }
}

/**
 * Erro de autenticação (401 Unauthorized)
 * Usado quando usuário não está autenticado ou token é inválido
 * @example
 * throw new UnauthorizedError("Credenciais inválidas")
 */
export class UnauthorizedError extends GeneralError {
  constructor(message = "Não autorizado") {
    super(message, 401);
  }
}
