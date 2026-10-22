export const SHIPPED_STATUSES = ['preparado', 'em_rota', 'entregue'];
const shipmentStatuses = new Set(SHIPPED_STATUSES);

/** Pagamentos que confirmam o dinheiro (o estoque é debitado nesse momento). */
export const APPROVED_PAYMENT_STATUSES = ['approved', 'authorized'];
/** Pagamentos que encerram o pedido sem venda (o estoque volta). */
export const RELEASING_PAYMENT_STATUSES = ['rejected', 'cancelled', 'expired', 'refunded', 'charged_back'];

const paymentStatusToOrderStatus = {
  pending: 'pendente',
  in_process: 'pendente',
  in_mediation: 'pendente',
  approved: 'pago',
  authorized: 'pago',
  rejected: 'cancelado',
  cancelled: 'cancelado',
  expired: 'expirado',
  refunded: 'cancelado',
  charged_back: 'cancelado',
};

export const normalizePaymentStatus = (status) => String(status || '').trim().toLowerCase();

export const mapPaymentStatus = (status) => paymentStatusToOrderStatus[normalizePaymentStatus(status)] || null;

export const resolveOrderStatus = (currentStatus, paymentStatus) => {
  const normalizedPaymentStatus = normalizePaymentStatus(paymentStatus);
  const mappedStatus = paymentStatusToOrderStatus[normalizedPaymentStatus];
  if (!mappedStatus) return currentStatus || 'pendente';

  const current = currentStatus || 'pendente';
  if (shipmentStatuses.has(current)) return current;
  // Sem reserva de estoque, a aprovação não pode devolver o pedido a "pago".
  // Só ensureStockHeld muda este status, quando a reserva for refeita com sucesso.
  if (current === 'erro_estoque' && APPROVED_PAYMENT_STATUSES.includes(normalizedPaymentStatus)) return current;
  if (current === 'pago' && ['pending', 'in_process', 'in_mediation'].includes(normalizedPaymentStatus)) {
    return current;
  }

  return mappedStatus;
};

export const isTerminalPaymentStatus = (status) =>
  ['approved', 'authorized', 'rejected', 'cancelled', 'expired', 'refunded', 'charged_back']
    .includes(normalizePaymentStatus(status));
/**
 * Pedido com as unidades debitadas do estoque. Pedidos antigos (antes da reserva)
 * usam `inventoryProcessed`.
 */
export const isStockHeld = (order) => (order?.stockHeld !== undefined
  ? order.stockHeld === true
  : order?.inventoryProcessed === true);

/** Pagamento aprovado sem unidade disponível: precisa ser estornado no Mercado Pago (uma vez). */
export const needsStockRefund = (order) => Boolean(order?.stockRefundPending) && !order?.stockRefundRequestedAt;
