/** Padroniza o envio de respostas JSON na aplicação.
 * @param {object} res - O objeto de resposta do Express.
 * @param {number} statusCode - O código de status HTTP.
 * @param {object} data - O payload da resposta (dados ou objeto de erro).
 */

export const sendResponse = (res, statusCode, data) => {
  res.status(statusCode).json(data);
 };

 /** Lida com o fluxo de uma operação assíncrona e envia a resposta.
 * @param {object} res - O objeto de resposta do Express.
 * @param {Promise<any>} servicePromise - A promise retornada pela função do serviço/controller.
 * @param {number} [successStatusCode=200] - O código de status para respostas de sucesso.
  */

export const handleResponse = async (res, servicePromise, successStatusCode = 200) => {
  try {
    const result = await servicePromise;
    sendResponse(res, successStatusCode, result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const errorMessage = error.message || 'Ocorreu um erro interno no servidor.';
    sendResponse(res, statusCode, { error: errorMessage });
   }

};
