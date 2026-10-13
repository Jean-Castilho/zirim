/**
 * Página de detalhes do produto.
 * Busca os dados em /products/projectionByIds e monta galeria, variações, preço e estoque.
 */
(() => {
  const page = document.querySelector('.product-details-page');
  if (!page) return;

  const PLACEHOLDER = '/img/placeholder-product.svg';
  const money = (value) => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const imageUrl = (name) => (name ? `/image/${encodeURIComponent(name)}` : PLACEHOLDER);
  const $ = (id) => document.getElementById(id);

  const el = {
    mainImage: $('mainImage'),
    thumbs: $('galleryThumbnails'),
    stockBadge: $('stockBadgeDisplay'),
    title: $('productTitle'),
    breadcrumb: $('breadcrumbCategory'),
    priceBox: $('productPriceContainer'),
    amount: $('productAmount'),
    specCategory: $('specCategory'),
    specStock: $('specStock'),
    description: $('productDescription'),
    colorSection: $('colorSelectorSection'),
    sizeSection: $('sizeSelectorSection'),
    colorPills: $('colorPillSelector'),
    sizePills: $('sizePillSelector'),
    colorError: $('colorError'),
    sizeError: $('sizeError'),
    qty: $('quantity'),
    decrease: $('decreaseQtyBtn'),
    increase: $('increaseQtyBtn'),
    addToCart: $('addToCartButton'),
    error: $('productError'),
  };

  const state = {
    product: null,
    variations: [],
    selected: null, // variação resolvida (cor/tamanho completos)
  };

  const unskeleton = (...nodes) => nodes.forEach((n) => n?.classList.remove('skeleton'));
  const norm = (list) => (list || []).map((v) => String(v).trim());
  const hasColors = () => !el.colorSection.hidden;
  const hasSizes = () => !el.sizeSection.hidden;
  const pickedColor = () => el.colorPills.querySelector('.selected')?.textContent.trim() || '';
  const pickedSize = () => el.sizePills.querySelector('.selected')?.textContent.trim() || '';

  // ------------------------------------------------------------------
  // Quantidade
  // ------------------------------------------------------------------
  function setQuantityLimit(maxStock) {
    const max = Math.max(0, Number(maxStock) || 0);
    el.qty.max = String(max);
    el.qty.value = String(max > 0 ? 1 : 0);
    syncQuantityButtons();
  }

  function syncQuantityButtons() {
    const current = Number(el.qty.value) || 0;
    const max = Number(el.qty.max) || 0;
    el.decrease.disabled = current <= 1;
    el.increase.disabled = current >= max;
  }

  function changeQuantity(step) {
    const max = Number(el.qty.max) || 0;
    const next = (Number(el.qty.value) || 0) + step;
    if (next < 1 || next > max) return;
    el.qty.value = String(next);
    syncQuantityButtons();
  }

  // ------------------------------------------------------------------
  // Galeria
  // ------------------------------------------------------------------
  function showImage(src, thumb = null) {
    el.mainImage.classList.add('is-switching');
    window.setTimeout(() => {
      el.mainImage.src = src;
      el.mainImage.classList.remove('is-switching');
    }, 200);

    if (thumb) {
      el.thumbs.querySelectorAll('.thumbnail').forEach((t) => t.classList.remove('active'));
      thumb.classList.add('active');
    }
  }

  function renderGallery(product, images) {
    el.thumbs.replaceChildren(...images.map((name, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `thumbnail${index === 0 ? ' active' : ''}`;
      button.setAttribute('aria-label', `Ver imagem ${index + 1}`);

      const img = document.createElement('img');
      img.src = imageUrl(name);
      img.alt = `${product.nome}, imagem ${index + 1}`;
      img.loading = 'lazy';
      button.append(img);

      button.addEventListener('click', () => showImage(imageUrl(name), button));
      return button;
    }));
  }

  // ------------------------------------------------------------------
  // Variações (cor / tamanho)
  // ------------------------------------------------------------------
  function createPill(type, value) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'pill-option';
    pill.textContent = value;
    pill.addEventListener('click', () => togglePill(type, pill));
    return pill;
  }

  function renderVariationSelectors() {
    const colors = [...new Set(state.variations.flatMap((v) => norm(v.cores)))];
    const sizes = [...new Set(state.variations.flatMap((v) => norm(v.tamanhos)))];

    el.colorSection.hidden = colors.length === 0;
    el.sizeSection.hidden = sizes.length === 0;
    el.colorPills.replaceChildren(...colors.map((c) => createPill('color', c)));
    el.sizePills.replaceChildren(...sizes.map((s) => createPill('size', s)));
  }

  const matchesSelection = (variation, color, size) =>
    (!color || norm(variation.cores).includes(color)) &&
    (!size || norm(variation.tamanhos).includes(size));

  function updatePillAvailability(color, size) {
    const refresh = (container, isAvailable) => {
      container.querySelectorAll('.pill-option').forEach((pill) => {
        const available = isAvailable(pill.textContent.trim());
        pill.classList.toggle('disabled', !available);
        pill.disabled = !available;
      });
    };

    if (hasSizes()) {
      refresh(el.sizePills, (value) =>
        state.variations.some((v) => matchesSelection(v, color, value) && Number(v.estoque) > 0));
    }
    if (hasColors()) {
      refresh(el.colorPills, (value) =>
        state.variations.some((v) => matchesSelection(v, value, size) && Number(v.estoque) > 0));
    }
  }

  function togglePill(type, pill) {
    if (pill.disabled) return;

    const wasSelected = pill.classList.contains('selected');
    pill.parentElement.querySelectorAll('.pill-option').forEach((p) => p.classList.remove('selected'));
    if (!wasSelected) pill.classList.add('selected');

    applySelection();
  }

  function applySelection() {
    const color = pickedColor();
    const size = pickedSize();
    updatePillAvailability(color, size);

    // Limpa erros de validação já resolvidos
    if (color) {
      el.colorError.hidden = true;
      el.colorPills.classList.remove('error-ring');
    }
    if (size) {
      el.sizeError.hidden = true;
      el.sizePills.classList.remove('error-ring');
    }

    const matches = state.variations.filter((v) => matchesSelection(v, color, size));
    const stock = matches.reduce((sum, v) => sum + (Number(v.estoque) || 0), 0);
    el.specStock.textContent = `${stock} unidades`;

    const complete = (!hasColors() || color) && (!hasSizes() || size);
    if (complete && matches.length > 0) {
      const match = matches.find((v) => Number(v.estoque) > 0) || matches[0];
      state.selected = match;
      el.amount.textContent = money(match.preco);
      setQuantityLimit(match.estoque);
      if (match.imagens?.[0]) showImage(imageUrl(match.imagens[0]));
      el.addToCart.disabled = Number(match.estoque) <= 0;
    } else {
      state.selected = null;
      setQuantityLimit(stock);
      el.amount.textContent = money(state.variations[0]?.preco);
      el.addToCart.disabled = stock <= 0;
    }
  }

  // ------------------------------------------------------------------
  // Carrinho
  // ------------------------------------------------------------------
  function addToCart() {
    let invalid = false;

    if (hasColors() && !pickedColor()) {
      el.colorError.hidden = false;
      el.colorPills.classList.add('error-ring');
      invalid = true;
    }
    if (hasSizes() && !pickedSize()) {
      el.sizeError.hidden = false;
      el.sizePills.classList.add('error-ring');
      invalid = true;
    }
    if (invalid) {
      showNotification('Selecione as opções desejadas antes de prosseguir.', 'error');
      return;
    }
    if (!state.selected) return;

    const { product, selected } = state;
    const item = {
      id: product._id,
      productId: product._id,
      cor: pickedColor(),
      tamanho: pickedSize(),
      nome: product.nome,
      preco: selected.preco,
      quantidade: Number(el.qty.value) || 1,
      imagem: selected.imagens?.[0] ? imageUrl(selected.imagens[0]) : PLACEHOLDER,
      estoqueMax: selected.estoque,
    };

    const cart = window.CartStorage.read();
    const existing = cart.find((i) =>
      i.productId === item.productId && i.cor === item.cor && i.tamanho === item.tamanho);

    if (existing) {
      existing.quantidade = Math.min((Number(existing.quantidade) || 0) + item.quantidade, item.estoqueMax);
    } else {
      cart.push(item);
    }

    window.CartStorage.write(cart);
    window.dispatchEvent(new Event('cartUpdated'));
    showNotification('Produto adicionado ao carrinho!', 'success');
  }

  // ------------------------------------------------------------------
  // Carregamento dos dados
  // ------------------------------------------------------------------
  function renderProduct(product) {
    state.product = product;
    state.variations = product.variacoes || [];

    const initial = state.variations.find((v) => Number(v.estoque) > 0) || state.variations[0] || {};
    const totalStock = state.variations.reduce((sum, v) => sum + (Number(v.estoque) || 0), 0);
    const category = product.categoria || 'Geral';
    const images = [...new Set(state.variations.flatMap((v) => v.imagens || []))];

    el.mainImage.src = imageUrl(initial.imagens?.[0] || images[0]);
    el.mainImage.alt = product.nome;
    el.mainImage.classList.remove('is-loading');
    el.mainImage.onerror = () => { el.mainImage.onerror = null; el.mainImage.src = PLACEHOLDER; };
    unskeleton(el.mainImage.parentElement, el.thumbs);

    el.stockBadge.textContent = totalStock > 0 ? 'Em estoque' : 'Indisponível';
    el.stockBadge.classList.toggle('is-out', totalStock <= 0);

    el.title.textContent = product.nome;
    el.breadcrumb.textContent = category;
    el.specCategory.textContent = category;
    el.specStock.textContent = `${totalStock} unidades`;
    el.amount.textContent = money(initial.preco);
    el.description.textContent = product.descricao || 'Sem descrição disponível.';
    document.title = `${product.nome} | Zirim`;

    unskeleton(el.stockBadge, el.title, el.breadcrumb, el.specCategory, el.specStock, el.priceBox, el.description);

    renderGallery(product, images);
    renderVariationSelectors();
    updatePillAvailability('', '');

    if (hasColors() || hasSizes()) {
      state.selected = null;
      setQuantityLimit(totalStock);
      el.addToCart.disabled = totalStock <= 0;
    } else {
      state.selected = state.variations.length ? initial : null;
      setQuantityLimit(Number(initial.estoque) || 0);
      el.addToCart.disabled = !state.selected || Number(initial.estoque) <= 0;
    }
  }

  function showLoadError() {
    el.error.hidden = false;
    el.mainImage.classList.remove('is-loading');
    el.mainImage.alt = 'Imagem indisponível';
    document.querySelectorAll('.product-details-page .skeleton').forEach((n) => n.classList.remove('skeleton'));
    el.title.textContent = 'Produto indisponível';
    el.breadcrumb.textContent = '-';
    el.specCategory.textContent = '-';
    el.specStock.textContent = '-';
    el.description.textContent = '';
    el.stockBadge.hidden = true;
  }

  async function loadProduct() {
    const productId = page.dataset.productId;
    if (!productId) return showLoadError();

    try {
      const response = await fetch('/products/projectionByIds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ids: [productId] }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const [product] = await response.json();
      if (!product) throw new Error('Produto não encontrado');

      renderProduct(product);
    } catch (error) {
      console.error('Erro ao buscar informações do produto:', error);
      showLoadError();
    }
  }

  el.decrease.addEventListener('click', () => changeQuantity(-1));
  el.increase.addEventListener('click', () => changeQuantity(1));
  el.addToCart.addEventListener('click', addToCart);
  el.error.querySelector('.retry-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    el.error.hidden = true;
    loadProduct();
  });

  loadProduct();
})();
