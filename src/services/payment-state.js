const shipmentStatuses = new Set(['preparado', 'em_rota', 'entregue']);

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
  if (current === 'pago' && ['pending', 'in_process', 'in_mediation'].includes(normalizedPaymentStatus)) {
    return current;
  }

  return mappedStatus;
};

export const isTerminalPaymentStatus = (status) =>
  ['approved', 'authorized', 'rejected', 'cancelled', 'expired', 'refunded', 'charged_back']
    .includes(normalizePaymentStatus(status));