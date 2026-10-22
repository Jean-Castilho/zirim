import { ValidationError } from "./errors.js";

/**
 * Estoque final de uma variação existente depois da edição pelo admin.
 *
 * O formulário envia o estoque que o admin VIU (`base`) e o valor desejado (`requested`).
 * A diferença é aplicada sobre o estoque ATUAL, então vendas e reservas feitas depois que
 * a página abriu não são apagadas. Sem `base` (clientes da API), o valor vira absoluto.
 * Campo vazio mantém o estoque atual.
 */
export const resolveAdjustedStock = ({ requested, base, current }) => {
  const currentStock = Number(current) || 0;
  const wanted = parseInt(requested, 10);
  if (!Number.isFinite(wanted)) return currentStock;

  const seen = parseInt(base, 10);
  const delta = Number.isFinite(seen) ? wanted - seen : wanted - currentStock;
  const next = currentStock + delta;

  if (next < 0) {
    throw new ValidationError(`O estoque não pode ficar negativo. Estoque atual: ${currentStock}.`);
  }
  return next;
};
