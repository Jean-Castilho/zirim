(() => {
  const terminalStatuses = new Set([
    'approved', 'authorized', 'rejected', 'cancelled', 'expired', 'refunded', 'charged_back'
  ]);

  const clearStatusPolling = () => {
    if (window.checkoutStatusInterval) {
      clearInterval(window.checkoutStatusInterval);
      window.checkoutStatusInterval = null;
    }
  };

  const setStatusBadge = (badge, status, message) => {
    if (!badge) return;
    badge.className = `status-badge status-${status}`;
    badge.replaceChildren();

    const icon = document.createElement('span');
    icon.className = 'material-icons';
    icon.textContent = status === 'approved' ? 'check_circle' : 'cancel';

    const text = document.createElement('span');
    text.textContent = message;
    badge.append(icon, text);
  };

  const initializeCheckoutPage = () => {
    clearStatusPolling();
    const card = document.getElementById('payment-card');
    if (!card) return;

    const paymentId = card.dataset.paymentId;
    const paymentStatus = card.dataset.paymentStatus;
    const orderStatus = card.dataset.orderStatus;
    const lastSynced = card.dataset.paymentLastSynced === 'true';
    const copyButton = document.getElementById('btn-copy-pix');
    const pixCode = document.getElementById('pix-code-text')?.textContent || '';
    const statusBadge = document.getElementById('payment-status-badge');
    const paymentArea = document.getElementById('pix-payment-area');
    const title = document.getElementById('checkout-title');

    if (copyButton && !copyButton.dataset.copyHandlerInitialized) {
      copyButton.dataset.copyHandlerInitialized = 'true';
      copyButton.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(pixCode);
          copyButton.textContent = 'Copiado!';
          window.setTimeout(() => {
            copyButton.innerHTML = '<span class="material-icons" style="font-size: 1.3rem;">content_copy</span> Copiar Código PIX';
          }, 2500);
        } catch (error) {
          console.error('Erro ao copiar:', error);
        }
      });
    }

    const legacyUnconfirmedCancellation = ['cancelado', 'expirado'].includes(orderStatus) &&
      ['cancelled', 'expired'].includes(paymentStatus) && !lastSynced;
    if (!paymentId || terminalStatuses.has(paymentStatus) && !legacyUnconfirmedCancellation) return;

    const checkPaymentStatus = async () => {
      try {
        const response = await fetch(`/orders/status/${encodeURIComponent(paymentId)}`);
        if (!response.ok) return;

        const payment = await response.json();
        if (['approved', 'authorized'].includes(payment.status)) {
          clearStatusPolling();
          if (title) title.textContent = 'Pagamento Confirmado!';
          if (paymentArea) paymentArea.remove();
          setStatusBadge(statusBadge, 'approved', 'Pagamento recebido com sucesso!');
          card.querySelector('.success-checkmark')?.remove();
          const successIcon = document.createElement('div');
          successIcon.className = 'success-checkmark material-icons';
          successIcon.textContent = 'check_circle';
          card.prepend(successIcon);
        } else if (['rejected', 'cancelled', 'expired', 'refunded', 'charged_back'].includes(payment.status)) {
          clearStatusPolling();
          if (title) title.textContent = payment.status === 'expired' ? 'PIX Expirado' : 'Pagamento Cancelado';
          if (paymentArea) paymentArea.remove();
          const message = payment.status === 'expired'
            ? 'O prazo para pagamento do PIX terminou.'
            : 'O pagamento foi cancelado, recusado ou estornado.';
          setStatusBadge(statusBadge, 'cancelled', message);
          const errorIcon = document.createElement('div');
          errorIcon.className = 'error-cross material-icons';
          errorIcon.textContent = 'cancel';
          card.prepend(errorIcon);
        }
      } catch (error) {
        console.error('Erro na sincronização:', error);
      }
    };

    window.checkoutStatusInterval = window.setInterval(checkPaymentStatus, 8000);
  };

  if (!document.body.dataset.checkoutLifecycleInitialized) {
    document.body.dataset.checkoutLifecycleInitialized = 'true';
    document.body.addEventListener('htmx:beforeSwap', clearStatusPolling);
    document.body.addEventListener('htmx:afterSwap', initializeCheckoutPage);
  }

  initializeCheckoutPage();
})();