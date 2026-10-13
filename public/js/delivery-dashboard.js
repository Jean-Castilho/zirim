/**
 * Script da página admin/delivery/dashboard.ejs (migrado do <script> inline da View).
 */
(() => {
      const refreshIcons = () => window.lucide?.createIcons();
      refreshIcons();

      let currentOrderId = null;
      const modal = document.getElementById('pin-modal');
      const pinInput = document.getElementById('pin-code-input');
      const errorBox = document.getElementById('pin-error-msg');
      const orderLabel = document.getElementById('modal-order-id');
      const submitBtn = document.getElementById('btn-submit-pin');

      async function selectOrder(orderId) {
          const csrfToken = document.getElementById('csrf-token')?.value;
          const headers = { 'Content-Type': 'application/json' };
          if (csrfToken) headers['x-csrf-token'] = csrfToken;

          try {
              const response = await fetch('/delivery/select', {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ orderId })
              });

              const data = await response.json();
              if (!response.ok || data.error) {
                  throw new Error(data.error || 'Erro ao aceitar pedido.');
              }

              alert(data.message || 'Pedido aceito! Rota iniciada.');
              window.location.reload();
          } catch (err) {
              alert(err.message);
          }
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

          submitBtn.disabled = true;
          submitBtn.textContent = 'Verificando...';
          errorBox.style.display = 'none';
          const csrfToken = document.getElementById('csrf-token')?.value;
          const headers = { 'Content-Type': 'application/json' };
          if (csrfToken) {
              headers['x-csrf-token'] = csrfToken;
          }

          try {
              const response = await fetch('/delivery/confirm', {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ orderId: currentOrderId, code })
              });

              const data = await response.json();

              if (!response.ok || data.error) {
                  throw new Error(data.error || 'Código incorreto.');
              }

              const card = document.getElementById(`card-${currentOrderId}`);
              if (card) {
                  card.style.transition = 'all 0.3s ease';
                  card.style.opacity = '0';
                  card.style.transform = 'scale(0.95)';
                  setTimeout(() => card.remove(), 300);
              }

              const countEl = document.getElementById('deliveries-count');
              if (countEl) {
                  countEl.textContent = Math.max(0, Number(countEl.textContent || 1) - 1);
                  if (Number(countEl.textContent) === 0) {
                      const listEl = document.getElementById('courier-list');
                      if (listEl) {
                          listEl.innerHTML = `
                              <div class="empty-orders-state" style="margin-top: 2rem;">
                                  <div class="empty-icon-wrap"><i data-lucide="check-check"></i></div>
                                  <h3>Nenhuma entrega pendente</h3>
                                  <p>Bom trabalho! Todas as entregas sob sua responsabilidade foram concluídas.</p>
                              </div>
                          `;
                          refreshIcons();
                      }
                  }
              }

              closePinModal();
          } catch (err) {
              errorBox.textContent = err.message;
              errorBox.style.display = 'block';
              pinInput.select();
          } finally {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Finalizar Entrega';
          }
      }

      // ---- Eventos (substituem os handlers inline on* da View) ----
      document.querySelectorAll('[data-action="select-order"]').forEach((button) => {
          button.addEventListener('click', () => selectOrder(button.dataset.orderId));
      });
      document.querySelectorAll('[data-action="open-pin"]').forEach((button) => {
          button.addEventListener('click', () => openPinModal(button.dataset.orderId, button.dataset.shortId));
      });
      document.querySelectorAll('[data-action="close-pin"]').forEach((button) => {
          button.addEventListener('click', closePinModal);
      });
      document.getElementById('pin-form')?.addEventListener('submit', submitDeliveryCode);
})();
