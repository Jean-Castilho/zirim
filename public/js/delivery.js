/**
 * Script da página admin/delivery/delivery.ejs (migrado do <script> inline da View).
 */
(() => {
      let map;
      let bounds;
      let activeInfoWindow = null;
      const markersMap = {};
      const activeOrders = JSON.parse(document.getElementById('delivery-page')?.dataset.orders || '[]');
      const defaultPosition = { lat: -22.8894, lng: -42.0286 };

      function escapeHtml(text) {
          const div = document.createElement('div');
          div.textContent = text || '';
          return div.innerHTML;
      }

      function initMap() {
          if (typeof google === 'undefined' || !google.maps) {
              const mapEl = document.getElementById('map');
              if (mapEl) {
                  mapEl.innerHTML = `
                      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#6c757d;text-align:center;padding:2rem;">
                          <p style="font-weight:600;margin-bottom:0.5rem;">Não foi possível carregar o Google Maps.</p>
                          <small>Verifique se a variável GOOGLE_API_KEY está configurada no seu ambiente.</small>
                      </div>
                  `;
              }
              return;
          }

          map = new google.maps.Map(document.getElementById('map'), {
              center: defaultPosition,
              zoom: 12,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
              zoomControl: true
          });

          bounds = new google.maps.LatLngBounds();
          let validCount = 0;

          activeOrders.forEach(order => {
              const lat = Number(order.location?.lat);
              const lng = Number(order.location?.lng);
              if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

              const position = { lat, lng };
              bounds.extend(position);
              validCount++;

              const orderShortId = order._id ? String(order._id).slice(-6).toUpperCase() : '------';
              const clientName = order.user?.name || 'Cliente Zirim';
              const street = order.address?.street || '';
              const neighborhood = order.address?.neighborhood ? `, ${order.address.neighborhood}` : '';
              const cep = order.address?.cep ? ` (CEP: ${order.address.cep})` : '';
              const fullAddress = street ? `${street}${neighborhood}${cep}` : 'Endereço não informado';
              const orderStatus = order.statusInterno || 'pendente';
              const courierName = order.delivery?.courierName || '';
              const statusLabel = orderStatus === 'em_rota' ? 'Em Rota' : (orderStatus === 'preparado' ? 'Pronto' : (orderStatus === 'pago' ? 'Pago' : 'Aguard. Pgto'));
              const badgeClass = orderStatus === 'em_rota' ? 'status-transit' : (orderStatus === 'preparado' ? 'status-pending' : 'status-transit');

              const marker = new google.maps.Marker({
                  position,
                  map,
                  title: `Pedido #${orderShortId} - ${clientName}`
              });

              const infoWindow = new google.maps.InfoWindow({
                  content: `
                      <div class="map-popup-card">
                          <header>
                              <strong>#${orderShortId}</strong>
                              <span class="status-badge ${badgeClass}">
                                  ${statusLabel}
                              </span>
                          </header>
                          <div style="font-size: 0.85rem; color: #212529;">
                              <p style="margin: 0 0 4px 0; font-weight: 600;">${escapeHtml(clientName)}</p>
                              <p style="margin: 0; color: #6c757d;">${escapeHtml(fullAddress)}</p>
                              ${courierName ? `<p style="margin: 6px 0 0 0; font-size: 0.8rem; color: #0284c7;"><strong>Entregador:</strong> ${escapeHtml(courierName)}</p>` : ''}
                          </div>
                      </div>
                  `
              });

              marker.addListener('click', () => {
                  if (activeInfoWindow) activeInfoWindow.close();
                  infoWindow.open(map, marker);
                  activeInfoWindow = infoWindow;
                  highlightCard(order._id);
              });

              markersMap[order._id] = { marker, infoWindow, position };
          });

          if (validCount > 0) {
              if (validCount === 1) {
                  map.setCenter(bounds.getCenter());
                  map.setZoom(15);
              } else {
                  map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
              }
          }
      }

      function highlightCard(orderId) {
          document.querySelectorAll('.order-card').forEach(card => card.classList.remove('is-selected'));
          if (!orderId) return;
          const selectedCard = document.getElementById(`order-card-${orderId}`);
          if (selectedCard) {
              selectedCard.classList.add('is-selected');
              selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
      }

      function focusDelivery(lat, lng, orderId) {
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              highlightCard(orderId);
              return;
          }
          if (!map) return;

          map.panTo({ lat, lng });
          map.setZoom(16);

          if (orderId && markersMap[orderId]) {
              if (activeInfoWindow) activeInfoWindow.close();
              const { marker, infoWindow } = markersMap[orderId];
              infoWindow.open(map, marker);
              activeInfoWindow = infoWindow;
          }

          highlightCard(orderId);
      }

      function fitAllDeliveries() {
          if (!map || !bounds || bounds.isEmpty()) return;
          map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
      }

      function filterOrders(query) {
          const term = (query || '').trim().toLowerCase();
          const cards = document.querySelectorAll('.order-card');
          let visibleCount = 0;

          cards.forEach(card => {
              const text = card.getAttribute('data-search') || '';
              const orderId = card.id.replace('order-card-', '');
              const isMatch = !term || text.includes(term);

              card.style.display = isMatch ? 'flex' : 'none';

              if (markersMap[orderId]) {
                  markersMap[orderId].marker.setVisible(isMatch);
              }

              if (isMatch) visibleCount++;
          });

          const countBadge = document.getElementById('orders-count');
          if (countBadge) {
              countBadge.textContent = visibleCount;
          }
      }

      function init() {
          initMap();
          if (window.lucide) window.lucide.createIcons();

          // ---- Eventos (substituem os handlers inline on* da View) ----
          document.querySelector('[data-action="fit-all"]')?.addEventListener('click', fitAllDeliveries);
          document.getElementById('order-search')?.addEventListener('input', (event) => filterOrders(event.target.value));
          document.querySelectorAll('[data-action="focus-delivery"]').forEach((card) => {
              card.addEventListener('click', () => focusDelivery(
                  Number.parseFloat(card.dataset.lat),
                  Number.parseFloat(card.dataset.lng),
                  card.dataset.orderId
              ));
          });
      }

      window.onPageReady(init);
})();
