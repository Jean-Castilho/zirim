import {
  asyncHandler,
  respond,
  sendSuccess,
  sendData,
  sendEmpty,
  sendText,
  renderPage,
} from "../utils/handle-response.js";

/**
 * Base de todos os controllers.
 *
 * Contrato:
 *  - Controller só traduz HTTP <-> serviço: lê req, chama UM serviço, responde.
 *  - Sem try/catch: erros propagam e o errorMiddleware responde.
 *  - Sem acesso direto a repository nem regras de negócio.
 */
export default class BaseController {
  /**
   * Retorna um handler Express para o método informado, com tratamento
   * de erro centralizado. Falha cedo se o método não existir.
   */
  handle(methodName) {
    if (typeof this[methodName] !== "function") {
      throw new Error(`${this.constructor.name}.${methodName} não existe.`);
    }
    return asyncHandler((req, res, next) => this[methodName](req, res, next));
  }

  render(req, res, view, options = {}) {
    return renderPage(req, res, view, options);
  }

  respond(req, res, options) {
    return respond(req, res, options);
  }

  ok(res, message, data = {}) {
    return sendSuccess(res, { status: 200, message, data });
  }

  created(res, message, data = {}) {
    return sendSuccess(res, { status: 201, message, data });
  }

  json(res, data, status = 200) {
    return sendData(res, data, status);
  }

  text(res, message, status = 200) {
    return sendText(res, message, status);
  }

  empty(res, status = 200) {
    return sendEmpty(res, status);
  }
}
