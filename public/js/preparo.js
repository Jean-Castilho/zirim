/**
 * Painel de preparo (admin): checklist de separação e marcação do pedido como preparado.
 * A regra de negócio (pedido pago, admin) é validada no servidor; o checklist é só apoio visual.
 */
window.onPageReady(() => {
  const { postJson, withBusy, reportError } = window.zirimHttp;
  const refreshIcons = () => window.lucide?.createIcons();

  const updateButton = (card) => {
    if (!card) return;
    const button = card.querySelector('[data-action="mark-prepared"]');
    const checks = [...card.querySelectorAll('.prep-check')];
    if (button) button.disabled = checks.length === 0 || !checks.every((check) => check.checked);
  };

  const decrementCount = () => {
    const countEl = document.getElementById('prep-count');
    if (countEl) countEl.textContent = Math.max(0, Number(countEl.textContent || 1) - 1);
  };

  const removeCardIfEmpty = () => {
    const list = document.getElementById('prep-list');
    if (!list || list.querySelector('.prep-card')) return;
    list.innerHTML = `
      <div class="empty-orders-state u-margin-top-2rem">
        <div class="empty-icon-wrap"><i data-lucide="check-check"></i></div>
        <h3>Nada para preparar</h3>
        <p>Quando um pedido for pago, ele aparece aqui para separação.</p>
      </div>`;
    refreshIcons();
  };

  const markPrepared = async (orderId, button) => {
    const card = button.closest('.prep-card');
    const ok = await window.zirimDialog.confirm('Confirmar que todos os itens deste pedido foram separados?', {
      tone: 'warning',
      confirmLabel: 'Sim, pronto',
      cancelLabel: 'Voltar',
    });
    if (!ok) return;

    await withBusy(button, 'Salvando...', async () => {
      try {
        await postJson(`/delivery/orders/${encodeURIComponent(orderId)}/prepare`, { orderId });
        card?.remove();
        decrementCount();
        removeCardIfEmpty();
      } catch (err) {
        await reportError(err);
      }
    });
    updateButton(card);
  };

  const init = () => {
    refreshIcons();

    document.querySelectorAll('.prep-card').forEach((card) => {
      card.querySelectorAll('.prep-check').forEach((check) => {
        check.addEventListener('change', () => updateButton(card));
      });
      updateButton(card);
    });

    document.querySelectorAll('[data-action="mark-prepared"]').forEach((button) => {
      button.addEventListener('click', () => markPrepared(button.dataset.orderId, button));
    });
  };

  window.onPageReady(init);
});
