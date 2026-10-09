(() => {
  const page = document.querySelector('.product-details-page');
  if (!page) return;

  let productDataGlobal = null;
  let selectedVariation = null;

  const qtyInput = document.getElementById('quantity');
  const decreaseBtn = document.getElementById('decreaseQtyBtn');
  const increaseBtn = document.getElementById('increaseQtyBtn');
  const addToCartBtn = document.getElementById('addToCartButton');

  function updateQuantity(val) {
    let current = parseInt(qtyInput.value) || 0;
    const max = parseInt(qtyInput.max) || 0;

    if (val > 0 && current < max) current++;
    if (val < 0 && current > 1) current--;

    qtyInput.value = current;
    decreaseBtn.disabled = current <= 1;
    increaseBtn.disabled = current >= max;
  }

  decreaseBtn.addEventListener('click', () => updateQuantity(-1));
  increaseBtn.addEventListener('click', () => updateQuantity(1));

  function resetQuantity(maxStock) {
    qtyInput.value = maxStock > 0 ? 1 : 0;
    qtyInput.max = maxStock;
    updateQuantity(0);
  }

  async function getProductInfo() {
    const productId = page.dataset.productId;
    const elements = {
      title: document.getElementById('productTitle'),
      amount: document.getElementById('productAmount'),
      description: document.getElementById('productDescription')
    };

    if (!productId) return;

    try {
      const response = await fetch('/products/projectionByIds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids: [productId] })
      });
      const data = await response.json();
      const p = data[0];

      if (!p) return;
      productDataGlobal = p;

      const variations = p.variacoes || [];
      const initialVar = variations.find(variation => Number(variation.estoque) > 0) || variations[0] || {};
      const totalStock = variations.reduce((acc, v) => acc + (v.estoque || 0), 0);
      const initialPrice = initialVar.preco || 0;

      const mainImg = document.getElementById('mainImage');
      const firstImage = initialVar.imagens?.[0] || 'placeholder-product.webp';
      mainImg.src = `/image/${firstImage}`;
      mainImg.alt = p.nome;
      mainImg.style.opacity = '1';
      mainImg.parentElement.classList.remove('skeleton');

      const stockBadge = document.getElementById('stockBadgeDisplay');
      stockBadge.textContent = totalStock > 0 ? 'Em estoque' : 'Indisponível';
      stockBadge.classList.remove('skeleton');

      const allImages = [...new Set(variations.flatMap(v => v.imagens || []))];
      const thumbContainer = document.querySelector('.gallery-thumbnails');
      thumbContainer.replaceChildren(...allImages.map((imageName, index) => {
        const thumbnail = document.createElement('button');
        thumbnail.type = 'button';
        thumbnail.className = `thumbnail ${index === 0 ? 'active' : ''}`;
        thumbnail.setAttribute('aria-label', `Ver imagem ${index + 1}`);

        const image = document.createElement('img');
        image.src = `/image/${imageName}`;
        image.alt = `${p.nome}, imagem ${index + 1}`;
        image.loading = 'lazy';
        thumbnail.append(image);
        thumbnail.addEventListener('click', () => updateGallery(`/image/${imageName}`, thumbnail));
        return thumbnail;
      }));

      elements.title.textContent = p.nome;
      elements.title.classList.remove('skeleton');

      const breadcrumbCat = document.getElementById('breadcrumbCategory');
      breadcrumbCat.textContent = p.categoria || 'Geral';
      breadcrumbCat.classList.remove('skeleton');

      const specCat = document.getElementById('specCategory');
      specCat.textContent = p.categoria || 'Geral';
      specCat.classList.remove('skeleton');

      const amountElem = document.getElementById('productAmount');
      amountElem.textContent = initialPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      document.getElementById('productPriceContainer').classList.remove('skeleton');

      const specStock = document.getElementById('specStock');
      specStock.textContent = `${totalStock} unidades`;
      specStock.classList.remove('skeleton');

      elements.description.textContent = p.descricao || 'Sem descrição disponível.';
      elements.description.classList.remove('skeleton');
      thumbContainer.classList.remove('skeleton');

      renderVariationSelectors(variations);
      const hasRequiredSelection = document.getElementById('colorSelectorSection').style.display !== 'none' ||
        document.getElementById('sizeSelectorSection').style.display !== 'none';
      if (!hasRequiredSelection) {
        selectedVariation = variations.length > 0 ? initialVar : null;
        resetQuantity(Number(initialVar.estoque) || 0);
      }
      updatePillAvailability();
      addToCartBtn.disabled = totalStock <= 0 || (!hasRequiredSelection && !selectedVariation);
    } catch (error) {
      console.error('Erro ao buscar informações do produto:', error);
    }
  }

  function renderVariationSelectors(variations) {
    const colors = [...new Set(variations.flatMap(v => v.cores || []))];
    const sizes = [...new Set(variations.flatMap(v => v.tamanhos || []))];

    if (colors.length > 0) {
      const colorSection = document.getElementById('colorSelectorSection');
      const colorContainer = document.getElementById('colorPillSelector');
      colorSection.style.display = 'block';
      colorContainer.replaceChildren(...colors.map(color => createVariationOption('color', color)));
    }

    if (sizes.length > 0) {
      const sizeSection = document.getElementById('sizeSelectorSection');
      const sizeContainer = document.getElementById('sizePillSelector');
      sizeSection.style.display = 'block';
      sizeContainer.replaceChildren(...sizes.map(size => createVariationOption('size', size)));
    }
  }

  function createVariationOption(type, value) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'pill-option';
    option.textContent = value;
    option.addEventListener('click', () => selectAttribute(type, value, option));
    return option;
  }

  function selectAttribute(type, value, el) {
    if (el?.classList.contains('disabled')) return;
    if (el) {
      const isAlreadySelected = el.classList.contains('selected');

      if (isAlreadySelected) {
        el.classList.remove('selected');
      } else {
        if (el.classList.contains('disabled')) {
          const otherSelector = type === 'color' ? '#sizePillSelector' : '#colorPillSelector';
          document.querySelectorAll(`${otherSelector} .pill-option`).forEach(p => p.classList.remove('selected'));
        }

        el.parentElement.querySelectorAll('.pill-option').forEach(p => p.classList.remove('selected'));
        el.classList.add('selected');
      }
    }

    const color = document.querySelector('#colorPillSelector .selected')?.textContent?.trim();
    const size = document.querySelector('#sizePillSelector .selected')?.textContent?.trim();

    updatePillAvailability(color, size);

    const matches = productDataGlobal.variacoes.filter(v =>
      (!color || (v.cores || []).map(c => c.trim()).includes(color)) &&
      (!size || (v.tamanhos || []).map(s => String(s).trim()).includes(size))
    );

    const currentStock = matches.reduce((acc, v) => acc + (v.estoque || 0), 0);
    document.getElementById('specStock').textContent = `${currentStock} unidades`;

    const isColorRequired = document.getElementById('colorSelectorSection').style.display !== 'none';
    const isSizeRequired = document.getElementById('sizeSelectorSection').style.display !== 'none';
    const selectionComplete = (!isColorRequired || !!color) && (!isSizeRequired || !!size);
    const colorError = document.getElementById('colorError');
    const sizeError = document.getElementById('sizeError');
    const colorContainer = document.getElementById('colorPillSelector');
    const sizeContainer = document.getElementById('sizePillSelector');

    if (color) {
      colorError.classList.remove('active');
      colorContainer.classList.remove('error-ring');
    }
    if (size) {
      sizeError.classList.remove('active');
      sizeContainer.classList.remove('error-ring');
    }

    if (selectionComplete && matches.length > 0) {
      const match = matches[0];
      selectedVariation = match;
      document.getElementById('productAmount').textContent = match.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      resetQuantity(match.estoque);
      if (match.imagens?.[0]) updateGallery(`/image/${match.imagens[0]}`);
      addToCartBtn.disabled = match.estoque <= 0;
    } else {
      selectedVariation = null;
      resetQuantity(currentStock);

      if (productDataGlobal && productDataGlobal.variacoes?.[0]) {
        document.getElementById('productAmount').textContent = productDataGlobal.variacoes[0].preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      }
    }
  }

  function updatePillAvailability(selectedColor, selectedSize) {
    if (!productDataGlobal || !productDataGlobal.variacoes) return;

    if (document.getElementById('sizeSelectorSection').style.display !== 'none') {
      const sizePills = document.querySelectorAll('#sizePillSelector .pill-option');
      sizePills.forEach(pill => {
        const sizeVal = pill.textContent.trim();
        const hasStock = productDataGlobal.variacoes.some(v =>
          (!selectedColor || (v.cores || []).map(c => c.trim()).includes(selectedColor)) &&
          (v.tamanhos || []).map(String).includes(sizeVal) &&
          v.estoque > 0
        );
        pill.classList.toggle('disabled', !hasStock);
        pill.disabled = !hasStock;
      });
    }

    if (document.getElementById('colorSelectorSection').style.display !== 'none') {
      const colorPills = document.querySelectorAll('#colorPillSelector .pill-option');
      colorPills.forEach(pill => {
        const colorVal = pill.textContent.trim();
        const hasStock = productDataGlobal.variacoes.some(v =>
          (v.cores || []).map(c => c.trim()).includes(colorVal) &&
          (!selectedSize || (v.tamanhos || []).map(String).includes(selectedSize)) &&
          v.estoque > 0
        );
        pill.classList.toggle('disabled', !hasStock);
        pill.disabled = !hasStock;
      });
    }
  }

  function updateGallery(src, thumbEl = null) {
    const mainImg = document.getElementById('mainImage');
    mainImg.style.opacity = '0';
    setTimeout(() => {
      mainImg.src = src;
      mainImg.style.opacity = '1';
    }, 200);

    if (thumbEl) {
      document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
      thumbEl.classList.add('active');
    }
  }

  addToCartBtn.addEventListener('click', () => {
    const isColorRequired = document.getElementById('colorSelectorSection').style.display !== 'none';
    const isSizeRequired = document.getElementById('sizeSelectorSection').style.display !== 'none';
    const colorSelected = document.querySelector('#colorPillSelector .selected');
    const sizeSelected = document.querySelector('#sizePillSelector .selected');

    let hasError = false;

    if (isColorRequired && !colorSelected) {
      document.getElementById('colorError').classList.add('active');
      document.getElementById('colorPillSelector').classList.add('error-ring');
      hasError = true;
    }

    if (isSizeRequired && !sizeSelected) {
      document.getElementById('sizeError').classList.add('active');
      document.getElementById('sizePillSelector').classList.add('error-ring');
      hasError = true;
    }

    if (hasError) {
      if (typeof showNotification === 'function') {
        showNotification('Selecione as opções desejadas antes de prosseguir.', 'error');
      }
      return;
    }

    if (!selectedVariation) return;

    const cartItem = {
      id: productDataGlobal._id,
      productId: productDataGlobal._id,
      cor: document.querySelector('#colorPillSelector .selected')?.textContent?.trim() || '',
      tamanho: document.querySelector('#sizePillSelector .selected')?.textContent?.trim() || '',
      nome: productDataGlobal.nome,
      preco: selectedVariation.preco,
      quantidade: parseInt(qtyInput.value),
      imagem: selectedVariation.imagens?.[0] ? `/image/${selectedVariation.imagens[0]}` : '/img/placeholder-product.webp',
      estoqueMax: selectedVariation.estoque
    };

    saveToCart(cartItem);
  });

  function saveToCart(item) {
    const cart = window.CartStorage.read();
    const existingIndex = cart.findIndex(i =>
      i.productId === item.productId &&
      i.cor === item.cor &&
      i.tamanho === item.tamanho
    );

    if (existingIndex > -1) {
      const newQty = cart[existingIndex].quantidade + item.quantidade;
      cart[existingIndex].quantidade = Math.min(newQty, item.estoqueMax);
    } else {
      cart.push(item);
    }

    window.CartStorage.write(cart);
    window.dispatchEvent(new Event('cartUpdated'));
    showNotification('adicionado ao carrinho!', 'success');
  }

  getProductInfo();
})();