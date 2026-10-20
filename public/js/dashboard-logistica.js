/**
 * Painel de logística (admin/logistica/dashboard-logistica.ejs).
 * Marcar pedido como pronto usa o cliente HTTP compartilhado (core/http.js).
 */
window.onPageReady(() => {
  const { postJson, withBusy, reportError } = window.zirimHttp;
  const refreshIcons = () => window.lucide?.createIcons();

  async function prepareOrder(orderId, button) {
    const ok = await window.zirimDialog.confirm(
      'Deseja marcar este pedido como pronto para envio? Isso gerará o código PIN e liberará o pedido no painel dos entregadores.',
      { tone: 'warning', confirmLabel: 'Marcar como pronto', cancelLabel: 'Voltar' }
    );
    if (!ok) return;

    await withBusy(button, 'Preparando...', async () => {
      try {
        await postJson(`/delivery/orders/${encodeURIComponent(orderId)}/prepare`, { orderId });
        await window.zirimDialog.notify('Pedido preparado com sucesso! Ele já aparece para os entregadores.', {
          tone: 'success',
          title: 'Pedido pronto',
        });
        window.location.reload();
      } catch (err) {
        await reportError(err);
      }
    });
  }

  const init = () => {
    refreshIcons();
    document.querySelectorAll('[data-action="prepare-order"]').forEach((button) => {
      button.addEventListener('click', () => prepareOrder(button.dataset.orderId, button));
    });
  };

  window.onPageReady(init);
});
