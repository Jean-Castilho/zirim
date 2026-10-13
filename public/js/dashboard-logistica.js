/**
 * Script da página admin/logistica/dashboard-logistica.ejs (migrado do <script> inline da View).
 */
(() => {
      const refreshIcons = () => window.lucide?.createIcons();
      refreshIcons();

      async function prepareOrder(orderId) {
          if (!confirm('Deseja marcar este pedido como pronto para envio? Isso gerará o código PIN e liberará o pedido no painel dos entregadores.')) {
              return;
          }

          const btn = document.getElementById(`btn-prepare-${orderId}`);
          if (btn) {
              btn.disabled = true;
              btn.innerHTML = 'Preparando...';
          }

          const csrfToken = document.getElementById('csrf-token')?.value;
          const headers = { 'Content-Type': 'application/json' };
          if (csrfToken) headers['x-csrf-token'] = csrfToken;

          try {
              const response = await fetch(`/delivery/orders/${orderId}/prepare`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ orderId })
              });

              const data = await response.json();
              if (!response.ok || data.error) {
                  throw new Error(data.error || 'Erro ao preparar pedido.');
              }

              alert(`Pedido preparado com sucesso! Código PIN gerado: ${data.confirmationCode}`);
              window.location.reload();
          } catch (err) {
              alert(err.message);
              if (btn) {
                  btn.disabled = false;
                  btn.innerHTML = '<i data-lucide="package-check" style="width: 13px; height: 13px;"></i> Preparar';
                  refreshIcons();
              }
          }
      }

      // ---- Eventos (substituem os handlers inline on* da View) ----
      document.querySelectorAll('[data-action="prepare-order"]').forEach((button) => {
          button.addEventListener('click', () => prepareOrder(button.dataset.orderId));
      });
})();
