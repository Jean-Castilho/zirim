/**
 * Painel do entregador (admin/delivery/dashboard.ejs).
 * Aceitar, liberar e confirmar entrega usam o cliente HTTP compartilhado (core/http.js).
 */
window.onPageReady(() => {
  const { postJson, withBusy, reportError, SESSION_EXPIRED } = window.zirimHttp;
  const refreshIcons = () => window.lucide?.createIcons();

  const modal = document.getElementById('pin-modal');
  const pinInput = document.getElementById('pin-code-input');
  const errorBox = document.getElementById('pin-error-msg');
  const orderLabel = document.getElementById('modal-order-id');
  const submitBtn = document.getElementById('btn-submit-pin');
  let currentOrderId = null;

  async function selectOrder(orderId, button) {
    await withBusy(button, 'Aceitando...', async () => {
      try {
        const data = await postJson('/delivery/select', { orderId });
        await window.zirimDialog.notify(data.message || 'Pedido aceito! Rota iniciada.', { tone: 'success', title: 'Pedido aceito' });
        window.location.reload();
      } catch (err) {
        await reportError(err);
      }
    });
  }

  async function releaseOrder(orderId, button) {
    const ok = await window.zirimDialog.confirm(
      'Liberar este pedido? Ele volta para a lista de disponíveis e outro entregador poderá aceitá-lo.',
      { tone: 'warning', confirmLabel: 'Liberar pedido', cancelLabel: 'Voltar' }
    );
    if (!ok) return;

    await withBusy(button, 'Liberando...', async () => {
      try {
        const data = await postJson(`/delivery/orders/${encodeURIComponent(orderId)}/release`, {});
        await window.zirimDialog.notify(data.message || 'Pedido liberado.', { tone: 'success', title: 'Pedido liberado' });
        window.location.reload();
      } catch (err) {
        await reportError(err);
      }
    });
  }

  function openPinModal(orderId, orderText) {
    currentOrderId = orderId;
    orderLabel.textContent = `Pedido ${orderText}`;
    pinInput.value = '';
    errorBox.style.display = 'none';
    errorBox.textContent = '';
    modal.style.display = 'flex';
    setTimeout(() => pinInput.focus(), 150);
  }

  function closePinModal() {
    currentOrderId = null;
    modal.style.display = 'none';
  }

  async function submitDeliveryCode(event) {
    event.preventDefault();
    if (!currentOrderId) return;

    const code = pinInput.value.trim();
    if (!code) return;

    const orderId = currentOrderId;
    errorBox.style.display = 'none';

    await withBusy(submitBtn, 'Verificando...', async () => {
      try {
        await postJson('/delivery/confirm', { orderId, code });
        closePinModal();
        await window.zirimDialog.notify('Entrega confirmada! Bom trabalho.', { tone: 'success', title: 'Entrega finalizada' });
        window.location.reload();
      } catch (err) {
        if (err.code === SESSION_EXPIRED) {
          closePinModal();
          await reportError(err);
          return;
        }
        errorBox.textContent = err.message;
        errorBox.style.display = 'block';
        pinInput.select();
      }
    });
  }

  const init = () => {
    refreshIcons();

    document.querySelectorAll('[data-action="select-order"]').forEach((button) => {
      button.addEventListener('click', () => selectOrder(button.dataset.orderId, button));
    });
    document.querySelectorAll('[data-action="release-order"]').forEach((button) => {
      button.addEventListener('click', () => releaseOrder(button.dataset.orderId, button));
    });
    document.querySelectorAll('[data-action="open-pin"]').forEach((button) => {
      button.addEventListener('click', () => openPinModal(button.dataset.orderId, button.dataset.shortId));
    });
    document.querySelectorAll('[data-action="close-pin"]').forEach((button) => {
      button.addEventListener('click', closePinModal);
    });
    document.getElementById('pin-form')?.addEventListener('submit', submitDeliveryCode);
  };

  window.onPageReady(init);
});
