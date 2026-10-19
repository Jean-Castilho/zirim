(() => {
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);

  const formatDate = (isoDate) => {
    const date = new Date(isoDate);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  };

  const shortCode = (orderId) => String(orderId).slice(-6).toUpperCase();

  const storage = () => window.GuestOrders || { read: () => [], get: () => null, remove: () => [] };

  const countItems = (order) => (order.items || []).reduce((sum, item) => sum + (Number(item.quantidade) || 0), 0);

  // Status interno do pedido (vem de /orders/:id/summary) -> texto, ícone e cor
  const ORDER_STATUS = {
    pendente: { label: 'Aguardando pagamento', tone: 'pending', icon: 'schedule' },
    pago: { label: 'Pagamento confirmado', tone: 'approved', icon: 'check_circle' },
    preparado: { label: 'Pronto para envio', tone: 'approved', icon: 'inventory_2' },
    em_rota: { label: 'Em rota de entrega', tone: 'transit', icon: 'local_shipping' },
    entregue: { label: 'Entregue', tone: 'approved', icon: 'done_all' },
    cancelado: { label: 'Cancelado', tone: 'cancelled', icon: 'cancel' },
    expirado: { label: 'PIX expirado', tone: 'cancelled', icon: 'timer_off' },
    erro_estoque: { label: 'Em análise', tone: 'pending', icon: 'hourglass_top' }
  };

  const statusInfo = (status) => ORDER_STATUS[status] || { label: 'Em processamento', tone: 'pending', icon: 'hourglass_top' };

  // ------------------------------------------------------------------
  // /pedidos — lista dos pedidos guardados neste navegador
  // ------------------------------------------------------------------
  const initOrderList = (listElement) => {
    const emptyElement = document.getElementById('guest-orders-empty');
    const orders = storage().read();

    if (orders.length === 0) {
      listElement.hidden = true;
      if (emptyElement) emptyElement.hidden = false;
      return;
    }

    listElement.innerHTML = orders.map(order => `
      <a class="order-card" href="/pedidos/${encodeURIComponent(order.orderId)}">
        <div class="order-card-top">
          <span class="order-card-code">Pedido #${escapeHtml(shortCode(order.orderId))}</span>
          <span class="order-card-date">${escapeHtml(formatDate(order.createdAt))}</span>
        </div>
        ${order.lastStatus ? `
        <span class="order-status-badge tone-${escapeHtml(statusInfo(order.lastStatus).tone)}">
          <span class="material-icons" aria-hidden="true">${escapeHtml(statusInfo(order.lastStatus).icon)}</span>
          ${escapeHtml(statusInfo(order.lastStatus).label)}
        </span>` : ''}
        <div class="order-card-bottom">
          <span>${countItems(order)} ${countItems(order) === 1 ? 'item' : 'itens'}</span>
          <strong>${escapeHtml(currency.format(Number(order.total) || 0))}</strong>
        </div>
        <span class="order-card-link">Ver detalhes <span class="material-icons">chevron_right</span></span>
      </a>
    `).join('');
  };

  // ------------------------------------------------------------------
  // /pedidos/:id — detalhe de um pedido
  // ------------------------------------------------------------------
  const renderOrderDetail = (order) => {
    const addressParts = [order.address?.street, order.address?.neighborhood, order.address?.city, order.address?.state]
      .filter(Boolean);
    const shippingLabel = Number(order.shipping?.cost) > 0
      ? currency.format(Number(order.shipping.cost))
      : 'Grátis';
    const subtotal = (order.items || []).reduce(
      (sum, item) => sum + (Number(item.preco) || 0) * (Number(item.quantidade) || 0), 0
    );

    const itemsHtml = (order.items || []).map(item => {
      const variant = [item.cor && `Cor: ${item.cor}`, item.tamanho && `Tamanho: ${item.tamanho}`]
        .filter(Boolean).join(' · ');
      return `
        <li class="order-item">
          <img src="${escapeHtml(item.imagem || '/img/placeholder-product.svg')}" alt="${escapeHtml(item.nome)}" loading="lazy">
          <div class="order-item-info">
            <strong>${escapeHtml(item.nome)}</strong>
            ${variant ? `<span class="order-item-variant">${escapeHtml(variant)}</span>` : ''}
            <span class="order-item-qty">${escapeHtml(item.quantidade)} x ${escapeHtml(currency.format(Number(item.preco) || 0))}</span>
          </div>
          <span class="order-item-total">${escapeHtml(currency.format((Number(item.preco) || 0) * (Number(item.quantidade) || 0)))}</span>
        </li>`;
    }).join('');

    return `
      <div id="guest-order-status" class="order-status-box tone-pending" aria-live="polite"></div>

      <div class="order-detail-meta">
        <div>
          <span class="order-detail-label">Número do pedido</span>
          <strong>#${escapeHtml(shortCode(order.orderId))}</strong>
        </div>
        <div>
          <span class="order-detail-label">Data</span>
          <strong>${escapeHtml(formatDate(order.createdAt))}</strong>
        </div>
      </div>

      <ul class="order-items">${itemsHtml}</ul>

      <dl class="order-summary">
        <div><dt>Subtotal</dt><dd>${escapeHtml(currency.format(subtotal))}</dd></div>
        <div><dt>Entrega</dt><dd>${escapeHtml(shippingLabel)}</dd></div>
        <div class="order-summary-total"><dt>Total</dt><dd>${escapeHtml(currency.format(Number(order.total) || 0))}</dd></div>
      </dl>

      ${addressParts.length ? `
        <div class="order-address">
          <span class="order-detail-label">Entrega em</span>
          <p>${escapeHtml(addressParts.join(' - '))}${order.address?.cep ? ` (CEP ${escapeHtml(order.address.cep)})` : ''}</p>
        </div>` : ''}

      <div class="order-detail-actions">
        <a class="btn-primary order-status-link" href="/checkout/${encodeURIComponent(order.orderId)}">
          <span class="material-icons">payments</span> Ver pagamento e status
        </a>
        <button type="button" class="btn-secondary order-remove-btn" id="guest-order-remove">
          Remover deste navegador
        </button>
      </div>
      <p class="order-detail-note">
        O status é consultado na loja a cada abertura. Se não carregar, o acesso de convidado pode ter expirado neste navegador.
      </p>`;
  };

  /** Consulta o status atual no servidor e mostra no topo do detalhe. */
  const loadCurrentStatus = async (orderId) => {
    const box = document.getElementById('guest-order-status');
    if (!box) return;

    box.className = 'order-status-box tone-pending';
    box.innerHTML = '<span class="order-status-text">Consultando status…</span>';

    try {
      const response = await fetch(`/orders/${encodeURIComponent(orderId)}/summary`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const info = statusInfo(data.statusInterno);
      const time = new Date(data.updatedAt || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      box.className = `order-status-box tone-${info.tone}`;
      box.innerHTML = `
        <span class="material-icons" aria-hidden="true">${escapeHtml(info.icon)}</span>
        <div class="order-status-main">
          <strong>${escapeHtml(info.label)}</strong>
          <span class="order-status-text">Atualizado às ${escapeHtml(time)}</span>
        </div>
        <button type="button" class="order-status-refresh" id="guest-order-status-refresh">Atualizar</button>`;

      storage().setStatus?.(orderId, data.statusInterno);
    } catch (error) {
      console.warn('Não foi possível consultar o status do pedido.', error);
      box.className = 'order-status-box tone-unavailable';
      box.innerHTML = `
        <span class="material-icons" aria-hidden="true">cloud_off</span>
        <div class="order-status-main">
          <strong>Status indisponível agora</strong>
          <span class="order-status-text">O acesso de convidado pode ter expirado neste navegador.</span>
        </div>
        <button type="button" class="order-status-refresh" id="guest-order-status-refresh">Tentar de novo</button>`;
    }

    document.getElementById('guest-order-status-refresh')?.addEventListener('click', () => loadCurrentStatus(orderId));
  };

  const initOrderDetail = (page) => {
    const orderId = page.dataset.orderId || '';
    const detailElement = document.getElementById('guest-order-detail');
    const missingElement = document.getElementById('guest-order-missing');
    const order = storage().get(orderId);

    if (!order) {
      if (detailElement) detailElement.hidden = true;
      if (missingElement) missingElement.hidden = false;
      return;
    }

    detailElement.innerHTML = renderOrderDetail(order);
    detailElement.hidden = false;
    loadCurrentStatus(orderId);

    const removeButton = document.getElementById('guest-order-remove');
    removeButton?.addEventListener('click', () => {
      if (!window.confirm('Remover este pedido da lista deste navegador? O pedido continua válido na loja.')) return;
      storage().remove(orderId);
      window.location.assign('/pedidos');
    });
  };

  const initOrdersPages = () => {
    const listElement = document.getElementById('guest-orders-list');
    if (listElement) initOrderList(listElement);

    const detailPage = document.querySelector('.order-detail-page');
    if (detailPage) initOrderDetail(detailPage);
  };

  // Os scripts de páginas são reexecutados a cada troca do hx-boost, então o init roda em cada uma.
  initOrdersPages();
})();
