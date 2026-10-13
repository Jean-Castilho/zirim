/**
 * Hierarquia única de erros de domínio.
 * Services e repositories lançam estes erros; o errorMiddleware (handleResponse.js)
 * é o único ponto que os converte em resposta HTTP.
 */

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
      success: false,
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

export class UnauthorizedError extends GeneralError {
  constructor(message = "Não autorizado") {
    super(message, 401);
  }
}

export class ForbiddenError extends GeneralError {
  constructor(message = "Acesso negado") {
    super(message, 403);
  }
}

export class NotFoundError extends GeneralError {
  constructor(message = "Recurso não encontrado") {
    super(message, 404);
  }
}

export class ConflictError extends GeneralError {
  constructor(message = "Conflito de dados") {
    super(message, 409);
  }
}

/** Falha em integração externa (Mercado Pago, WhatsApp, e-mail...). */
export class ExternalServiceError extends GeneralError {
  constructor(message = "Falha ao comunicar com serviço externo", code = 502) {
    super(message, code);
  }
}
