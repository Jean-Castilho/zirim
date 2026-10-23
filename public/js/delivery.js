/**
 * Script da página admin/delivery/delivery.ejs (migrado do <script> inline da View).
 */
(() => {
      // Marcador: pino SVG (ponta em 0,0) com cor por status.
      const PIN_PATH = 'M0,-44C-10.5,-44 -19,-35.5 -19,-25C-19,-11 0,0 0,0C0,0 19,-11 19,-25C19,-35.5 10.5,-44 0,-44Z';
      const MARKER_TONES = {
          em_rota: { color: '#0284c7', label: 'Em rota' },
          preparado: { color: '#d97706', label: 'Pronto' },
          pago: { color: '#64748b', label: 'Pago' },
          default: { color: '#64748b', label: 'Aguard. pgto' }
      };

      let map;
      let bounds;
      let activeInfoWindow = null;
      let routeService = null;
      let routeRenderer = null;
      let currentRouteOrder = null;
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

          routeService = new google.maps.DirectionsService();
          routeRenderer = new google.maps.DirectionsRenderer({ map, suppressMarkers: false, preserveViewport: false });

          bounds = new google.maps.LatLngBounds();
          let validCount = 0;

          activeOrders.forEach(order => {
              const lat = Number(order.location?.lat);
              const lng = Number(order.location?.lng);
              if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

              const position = { lat, lng };
              bounds.extend(position);
              validCount++;

              const orderShortId = order.shortId || '------';
              const isRedacted = order.redacted === true;
              const clientName = isRedacted ? 'Pedido disponível' : (order.client?.name || ('Cliente ' + window.zirimStoreName));
              const street = order.address?.street || '';
              const neighborhood = order.address?.neighborhood ? `, ${order.address.neighborhood}` : '';
              const fullAddress = isRedacted
                  ? (order.neighborhood ? `Bairro: ${order.neighborhood}` : 'Endereço após o aceite')
                  : (street ? `${street}${neighborhood}` : 'Endereço não informado');
              const orderStatus = order.status || 'pendente';
              const courierName = order.courierName || '';
              const tone = MARKER_TONES[orderStatus] || MARKER_TONES.default;
              const initials = clientName.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || '?';

              const marker = new google.maps.Marker({
                  position,
                  map,
                  title: `Pedido #${orderShortId} - ${clientName}`,
                  icon: {
                      path: PIN_PATH,
                      fillColor: tone.color,
                      fillOpacity: 1,
                      strokeColor: '#ffffff',
                      strokeWeight: 2,
                      scale: 0.9,
                      anchor: new google.maps.Point(0, 0),
                      labelOrigin: new google.maps.Point(0, -29)
                  },
                  label: { text: initials, color: '#ffffff', fontSize: '12px', fontWeight: '700' },
                  zIndex: orderStatus === 'em_rota' ? 2 : 1
              });

              const infoWindow = new google.maps.InfoWindow({
                  maxWidth: 280,
                  content: `
                      <div class="map-popup-card">
                          <div class="map-popup-band" style="--popup-tone: ${tone.color}">
                              <span class="map-popup-id">#${escapeHtml(orderShortId)}</span>
                              <div class="map-popup-band-end">
                                  <span class="map-popup-status">${escapeHtml(tone.label)}</span>
                                  <button type="button" class="map-popup-close" aria-label="Fechar">&times;</button>
                              </div>
                          </div>
                          <div class="map-popup-body">
                              <div class="map-popup-client">
                                  <span class="map-popup-avatar">${escapeHtml(initials)}</span>
                                  <strong>${escapeHtml(clientName)}</strong>
                              </div>
                              <div class="map-popup-row">
                                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>
                                  <span>${escapeHtml(fullAddress)}</span>
                              </div>
                              ${courierName ? `
                              <div class="map-popup-row">
                                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                                  <span>Entregador: <strong>${escapeHtml(courierName)}</strong></span>
                              </div>` : ''}
                          </div>
                      </div>
                  `
              });

              // Botão fechar próprio, dentro da faixa colorida (o nativo do Google fica oculto por CSS).
              infoWindow.addListener('domready', () => {
                  document.querySelector('.map-popup-close')?.addEventListener('click', () => infoWindow.close());
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

      const prepModal = document.getElementById('prep-modal');
      const prepItems = document.getElementById('prep-modal-items');
      const prepTitle = document.getElementById('prep-modal-title');
      const prepConfirm = document.getElementById('prep-confirm');
      const prepError = document.getElementById('prep-error');
      let prepOrderId = null;

      function updatePrepConfirm() {
          const checks = [...prepItems.querySelectorAll('.prep-check')];
          prepConfirm.disabled = checks.length === 0 || !checks.every((check) => check.checked);
      }

      function openPrepModal(orderId, shortIdText) {
          const template = document.getElementById(`prep-items-${orderId}`);
          if (!template || !prepModal) return;

          prepOrderId = orderId;
          prepTitle.textContent = `Montar pedido ${shortIdText}`;
          prepItems.replaceChildren(template.content.cloneNode(true));
          prepItems.querySelectorAll('.prep-check').forEach((check) => {
              check.addEventListener('change', updatePrepConfirm);
          });
          prepError.style.display = 'none';
          prepError.textContent = '';
          updatePrepConfirm();
          prepModal.style.display = 'flex';
      }

      function closePrepModal() {
          prepOrderId = null;
          if (prepModal) prepModal.style.display = 'none';
      }

      async function confirmPrepared() {
          if (!prepOrderId || prepConfirm.disabled) return;
          const orderId = prepOrderId;
          const { postJson, withBusy, reportError, SESSION_EXPIRED } = window.zirimHttp;
          prepError.style.display = 'none';

          await withBusy(prepConfirm, 'Salvando...', async () => {
              try {
                  await postJson(`/delivery/orders/${encodeURIComponent(orderId)}/prepare`, { orderId });
                  window.location.reload();
              } catch (err) {
                  if (err.code === SESSION_EXPIRED) {
                      closePrepModal();
                      await reportError(err);
                      return;
                  }
                  prepError.textContent = err.message;
                  prepError.style.display = 'block';
              }
          });
          updatePrepConfirm();
      }

      function setRoutePanel(title, text) {
          const panel = document.getElementById('route-panel');
          if (!panel) return;
          document.getElementById('route-title').textContent = title;
          document.getElementById('route-summary').textContent = text;
          panel.style.display = 'block';
      }

      // A localização do entregador fica só no navegador: não é enviada ao servidor.
      function drawRouteTo(order) {
          const lat = Number(order.location?.lat);
          const lng = Number(order.location?.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              setRoutePanel('Rota indisponível', 'Este pedido não tem localização do cliente.');
              return;
          }
          if (!routeService) {
              setRoutePanel('Rota indisponível', 'O Google Maps não foi carregado.');
              return;
          }
          if (!navigator.geolocation) {
              setRoutePanel('Rota indisponível', 'Este navegador não informa sua localização.');
              return;
          }

          const destination = { lat, lng };
          setRoutePanel('Calculando rota…', 'Obtendo sua localização.');

          navigator.geolocation.getCurrentPosition((position) => {
              const origin = { lat: position.coords.latitude, lng: position.coords.longitude };
              routeService.route({
                  origin,
                  destination,
                  travelMode: google.maps.TravelMode.DRIVING
              }, (result, status) => {
                  if (status !== 'OK' || !result?.routes?.length) {
                      const hint = status === 'REQUEST_DENIED'
                          ? 'A Directions API não está liberada para a chave do Google Maps. Ative-a no Google Cloud Console.'
                          : `Não foi possível traçar a rota (${status}).`;
                      setRoutePanel('Rota indisponível', hint);
                      return;
                  }
                  routeRenderer.setDirections(result);
                  const leg = result.routes[0].legs[0];
                  setRoutePanel(`Rota até #${order.shortId || ''}`, `${leg.distance.text} · cerca de ${leg.duration.text} de carro`);
              });
          }, () => {
              setRoutePanel('Localização necessária', 'Permita o acesso à localização do navegador para traçar a rota até o cliente.');
              map.setCenter(destination);
              map.setZoom(15);
          }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
      }

      function routeOrderFromUrl() {
          const id = new URLSearchParams(window.location.search).get('route');
          if (!id) return null;
          const order = activeOrders.find((item) => item._id === id);
          if (!order) {
              setRoutePanel('Pedido não encontrado', 'Este pedido não está em rota com você.');
              return null;
          }
          return order;
      }

      function init() {
          initMap();
          if (window.lucide) window.lucide.createIcons();

          currentRouteOrder = routeOrderFromUrl();
          if (currentRouteOrder) drawRouteTo(currentRouteOrder);
          document.getElementById('route-recalc')?.addEventListener('click', () => {
              if (currentRouteOrder) drawRouteTo(currentRouteOrder);
          });

          // ---- Eventos (substituem os handlers inline on* da View) ----
          document.querySelector('[data-action="fit-all"]')?.addEventListener('click', fitAllDeliveries);
          document.getElementById('order-search')?.addEventListener('input', (event) => filterOrders(event.target.value));
          document.querySelectorAll('[data-action="open-prep"]').forEach((button) => {
              button.addEventListener('click', (event) => {
                  event.stopPropagation();
                  openPrepModal(button.dataset.orderId, button.dataset.shortId);
              });
          });
          document.querySelectorAll('[data-action="close-prep"]').forEach((button) => {
              button.addEventListener('click', closePrepModal);
          });
          document.querySelector('[data-action="confirm-prep"]')?.addEventListener('click', confirmPrepared);
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
