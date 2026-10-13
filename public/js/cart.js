(() => {
    const initializeCartPage = () => {
        if (!document.getElementById('cart-items')) return;

        const parseCartNumber = (value, fallback) => {
            if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;

            const normalizedValue = String(value ?? '').trim().replace(/[^\d,.-]/g, '');
            const decimalValue = normalizedValue.includes(',')
                ? normalizedValue.replace(/\./g, '').replace(',', '.')
                : normalizedValue;
            const parsedValue = Number(decimalValue);
            return Number.isFinite(parsedValue) ? parsedValue : fallback;
        };

        const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);

        const hasValidCoordinates = (latitude, longitude) =>
            Number.isFinite(latitude) && Number.isFinite(longitude) &&
            latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

        const loadCartItems = () => {
            try {
                const storedCart = window.CartStorage.read();
                const cart = (Array.isArray(storedCart) ? storedCart : [])
                    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
                    .map(item => {
                        const productId = item.productId ?? item._id ?? item.id;
                        const quantity = Math.trunc(parseCartNumber(item.quantidade ?? item.quantity, 1));

                        return {
                            ...item,
                            id: productId,
                            productId,
                            nome: String(item.nome ?? item.name ?? 'Produto'),
                            preco: parseCartNumber(item.preco ?? item.price ?? item.valor, 0),
                            quantidade: quantity >= 0 ? quantity : 1,
                            imagem: item.imagem ?? item.image ?? '/img/placeholder-product.svg',
                            cor: item.cor ?? item.color ?? '',
                            tamanho: item.tamanho ?? item.size ?? '',
                            selected: item.selected !== false
                        };
                    });

                window.CartStorage.write(cart);
                return cart;
            } catch (error) {
                console.warn('Erro ao carregar itens do carrinho salvo:', error);
                window.CartStorage.write([]);
                return [];
            }
        };

        const CartPage = {
            mapApiKey: document.getElementById('cart-mini-map')?.dataset.mapApiKey || '',
            googleMapInstance: null,
            googleMapMarker: null,
            locationDetailsOverlay: null,

            elements: {
                itemsContainer: document.getElementById('cart-items'),
                totalDisplay: document.getElementById('cart-total'),
                subtotalDisplay: document.getElementById('cart-subtotal'),
                checkoutBtn: document.getElementById('checkout-btn'),
                mapsContainer: document.getElementById('cart-maps-container'),
                cepInput: document.getElementById('cart-cep-input'),
                cepBtn: document.getElementById('cart-cep-btn'),
                cepLoading: document.getElementById('cart-cep-loading'),
                cepError: document.getElementById('cart-cep-error'),
                cepResult: document.getElementById('cart-cep-result'),
                cepStreet: document.getElementById('cep-res-street'),
                cepNeighborhood: document.getElementById('cep-res-neighborhood'),
                mapPointLabel: document.getElementById('cart-map-point'),
                locationArticle: document.getElementById('cart-map-location-details'),
                locationLatitude: document.getElementById('cart-map-location-latitude'),
                locationLongitude: document.getElementById('cart-map-location-longitude'),
                miniMap: document.getElementById('cart-mini-map'),
                mapPlaceholder: document.getElementById('cart-map-placeholder'),
                mapStatusBadge: document.getElementById('map-status-badge'),
                guestName: document.getElementById('guest-name'),
                guestEmail: document.getElementById('guest-email'),
                guestPhone: document.getElementById('guest-phone')
            },

            init() {
                this.render();
                this.bindEvents();
                if (!window.google?.maps) {
                    document.addEventListener('cartGoogleMapsReady', () => {
                        try {
                            const savedCepData = JSON.parse(localStorage.getItem('cart_cep_data') || 'null');
                            if (savedCepData?.cep) this.applyCepResult(savedCepData, false);
                        } catch (e) {
                            console.warn('Erro ao carregar CEP salvo:', e);
                        }
                    }, { once: true });
                }
                this.initCep();
                this.loadSavedCustomer();
            },

            loadSavedCustomer() {
                try {
                    const savedCustomer = JSON.parse(localStorage.getItem('cart_customer') || 'null');
                    if (savedCustomer) {
                        if (this.elements.guestName) this.elements.guestName.value = savedCustomer.name || '';
                        if (this.elements.guestEmail) this.elements.guestEmail.value = savedCustomer.email || '';
                        if (this.elements.guestPhone) this.elements.guestPhone.value = savedCustomer.phone || '';
                    }
                } catch (e) {
                    console.warn('Erro ao carregar dados do cliente salvo:', e);
                }
            },

            initCep() {
                try {
                    const savedCepData = JSON.parse(localStorage.getItem('cart_cep_data') || 'null');
                    if (savedCepData && savedCepData.cep) {
                        if (this.elements.cepInput) {
                            this.elements.cepInput.value = savedCepData.formattedCep || savedCepData.cep;
                        }
                        this.applyCepResult(savedCepData, false);
                    }
                } catch (e) {
                    console.warn('Erro ao carregar CEP salvo:', e);
                }
            },

            bindEvents() {
                this.elements.itemsContainer.addEventListener('click', (e) => {
                    const removeBtn = e.target.closest('.remove-item');
                    if (removeBtn) {
                        this.removeItem(removeBtn.dataset.index);
                    }

                    const qtyBtn = e.target.closest('.qty-btn');
                    if (qtyBtn) {
                        const index = qtyBtn.dataset.index;
                        const change = parseInt(qtyBtn.dataset.change);
                        this.updateQuantity(index, change);
                    }
                });

                this.elements.checkoutBtn.addEventListener('click', () => {
                    this.handleCheckout();
                });

                this.elements.itemsContainer.addEventListener('change', (e) => {
                    const checkbox = e.target.closest('.item-checkbox');
                    if (checkbox) {
                        this.toggleSelection(checkbox.dataset.index, checkbox.checked);
                    }
                });

                // Eventos de CEP e Frete
                if (this.elements.cepInput) {
                    this.elements.cepInput.addEventListener('input', (e) => {
                        let val = e.target.value.replace(/\D/g, '');
                        if (val.length > 8) val = val.slice(0, 8);
                        if (val.length > 5) {
                            e.target.value = val.slice(0, 5) + '-' + val.slice(5);
                        } else {
                            e.target.value = val;
                        }
                        if (this.elements.cepError) {
                            this.elements.cepError.style.display = 'none';
                        }
                    });

                    this.elements.cepInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            this.handleCepLookup();
                        }
                    });
                }

                if (this.elements.cepBtn) {
                    this.elements.cepBtn.addEventListener('click', () => {
                        this.handleCepLookup();
                    });
                }

            },

            async handleCepLookup() {
                const rawValue = this.elements.cepInput.value;
                const cleanCep = rawValue.replace(/\D/g, '');

                if (cleanCep.length !== 8) {
                    this.showCepError('Por favor, digite um CEP válido com 8 dígitos.');
                    return;
                }

                this.showCepLoading(true);

                try {
                    const data = await this.fetchAddressAndCoords(cleanCep);
                    data.formattedCep = cleanCep.slice(0, 5) + '-' + cleanCep.slice(5);
                    data.cep = cleanCep;
                    localStorage.setItem('cart_cep_data', JSON.stringify(data));
                    this.applyCepResult(data, true);
                } catch (error) {
                    console.error('Erro na consulta do CEP:', error);
                    this.showCepError(error.message || 'Não foi possível consultar este CEP.');
                } finally {
                    this.showCepLoading(false);
                }
            },

            async fetchAddressAndCoords(cleanCep) {
                let result = null;

                // 1. Consulta BrasilAPI v2 (endereço + coordenadas geográficas nativas)
                try {
                    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`);
                    if (res.ok) {
                        const data = await res.json();
                        let lat = null;
                        let lng = null;
                        if (data.location?.coordinates) {
                            lng = Number(data.location.coordinates.longitude);
                            lat = Number(data.location.coordinates.latitude);
                        }
                        result = {
                            street: data.street || '',
                            neighborhood: data.neighborhood || '',
                            city: data.city || '',
                            state: data.state || '',
                            lat,
                            lng
                        };
                    }
                } catch (e) {
                    console.warn('BrasilAPI indisponível, tentando ViaCEP:', e);
                }

                // 2. Fallback para ViaCEP se BrasilAPI falhar
                if (!result) {
                    const viaRes = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
                    if (!viaRes.ok) throw new Error('CEP não encontrado');
                    const viaData = await viaRes.json();
                    if (viaData.erro) throw new Error('CEP não encontrado');

                    result = {
                        street: viaData.logradouro || '',
                        neighborhood: viaData.bairro || '',
                        city: viaData.localidade || '',
                        state: viaData.uf || '',
                        lat: null,
                        lng: null
                    };
                }

                // 3. Se ainda não temos coordenadas, geocodifica via OpenStreetMap Nominatim
                if (!hasValidCoordinates(result.lat, result.lng)) {
                    try {
                        const nomUrl = new URL('https://nominatim.openstreetmap.org/search');
                        nomUrl.search = new URLSearchParams({
                            format: 'jsonv2',
                            postalcode: cleanCep,
                            country: 'Brazil',
                            addressdetails: '1',
                            limit: '1'
                        });
                        const nomRes = await fetch(nomUrl, {
                            headers: { 'Accept-Language': 'pt-BR' }
                        });
                        if (nomRes.ok) {
                            const [match] = await nomRes.json();
                            if (match) {
                                result.lat = Number(match.lat);
                                result.lng = Number(match.lon);
                            }
                        }
                    } catch (geoErr) {
                        console.warn('Busca da localização pelo CEP falhou:', geoErr);
                    }
                }

                if (!hasValidCoordinates(result.lat, result.lng)) {
                    throw new Error('Não foi possível localizar esse CEP no mapa. Confira o CEP e tente novamente.');
                }

                return result;
            },

            applyCepResult(data, isNewSearch = false) {
                if (this.elements.cepStreet) {
                    this.elements.cepStreet.innerText = data.street || `${data.city} - ${data.state}`;
                }
                if (this.elements.cepNeighborhood) {
                    const parts = [];
                    if (data.neighborhood) parts.push(data.neighborhood);
                    if (data.city) parts.push(data.city);
                    if (data.state) parts.push(data.state);
                    this.elements.cepNeighborhood.innerText = parts.join(' - ');
                }

                if (this.elements.cepResult) {
                    this.elements.cepResult.style.display = 'flex';
                }

                if (this.elements.mapStatusBadge) {
                    this.elements.mapStatusBadge.innerText = data.locationSelectedManually ? 'Ponto definido' : 'Localizado';
                    this.elements.mapStatusBadge.classList.add('active');
                }

                if (this.elements.mapPointLabel) {
                    this.elements.mapPointLabel.textContent = data.locationSelectedManually
                        ? 'Clique no mapa para ajustar o ponto de entrega.'
                        : 'Clique no mapa para marcar o ponto exato de entrega.';
                }
                this.updateLocationArticle(data);
                this.renderMiniMap(data.lat, data.lng, isNewSearch);
            },

            updateLocationArticle(data) {
                if (!this.elements.locationArticle) return;

                this.elements.locationArticle.hidden = !data.locationSelectedManually;
                if (!data.locationSelectedManually) return;

                if (this.elements.locationLatitude) {
                    this.elements.locationLatitude.textContent = Number(data.lat).toFixed(6);
                }
                if (this.elements.locationLongitude) {
                    this.elements.locationLongitude.textContent = Number(data.lng).toFixed(6);
                }
            },

            showCepLoading(isLoading) {
                if (this.elements.cepLoading) {
                    this.elements.cepLoading.style.display = isLoading ? 'flex' : 'none';
                }
                if (this.elements.cepBtn) {
                    this.elements.cepBtn.disabled = isLoading;
                }
                if (isLoading && this.elements.cepError) {
                    this.elements.cepError.style.display = 'none';
                }
            },

            showCepError(message) {
                if (this.elements.cepError) {
                    this.elements.cepError.innerText = message;
                    this.elements.cepError.style.display = 'block';
                }
                if (this.elements.cepResult) {
                    this.elements.cepResult.style.display = 'none';
                }
                if (this.elements.mapStatusBadge) {
                    this.elements.mapStatusBadge.innerText = 'CEP não encontrado';
                    this.elements.mapStatusBadge.classList.remove('active');
                }
            },

            renderMiniMap(lat, lng, animate = true) {
                if (!this.mapApiKey) {
                    if (this.elements.mapPlaceholder) {
                        this.elements.mapPlaceholder.style.display = 'flex';
                        this.elements.mapPlaceholder.innerHTML = `
                            <span class="material-icons">map_off</span>
                            <p>Google Maps indisponível</p>
                            <small>Configure GOOGLE_API_KEY para exibir o mapa.</small>
                        `;
                    }
                    return;
                }

                if (!window.google?.maps) {
                    return;
                }

                this.renderGoogleMap(lat, lng, animate);
            },

            showMapError(message) {
                if (this.elements.mapPlaceholder) {
                    this.elements.mapPlaceholder.style.display = 'flex';
                    this.elements.mapPlaceholder.innerHTML = `
                        <span class="material-icons">error_outline</span>
                        <p>Mapa indisponível</p>
                        <small>${message}</small>
                    `;
                }
                if (this.elements.mapStatusBadge) {
                    this.elements.mapStatusBadge.innerText = 'Erro no mapa';
                    this.elements.mapStatusBadge.classList.remove('active');
                }
            },

            renderGoogleMap(lat, lng, animate = true) {
                if (!window.google?.maps || !this.elements.miniMap) return;

                if (!this.googleMapInstance) {
                    this.googleMapInstance = new google.maps.Map(this.elements.miniMap, {
                        center: { lat, lng },
                        zoom: 15,
                        mapTypeControl: false,
                        streetViewControl: false,
                        fullscreenControl: false
                    });
                    this.googleMapInstance.addListener('click', event => this.selectMapPoint(event.latLng));
                } else if (animate) {
                    this.googleMapInstance.panTo({ lat, lng });
                    this.googleMapInstance.setZoom(15);
                }

                if (!this.googleMapMarker) {
                    this.googleMapMarker = new google.maps.Marker({
                        position: { lat, lng },
                        map: this.googleMapInstance,
                        title: 'Ponto exato de entrega'
                    });
                } else {
                    this.googleMapMarker.setPosition({ lat, lng });
                }

                this.attachLocationDetailsOverlay();
                if (this.locationDetailsOverlay && this.googleMapMarker) {
                    this.locationDetailsOverlay.setLocation(this.googleMapMarker.getPosition());
                }

                if (this.elements.mapPlaceholder) {
                    this.elements.mapPlaceholder.style.display = 'none';
                }
            },

            attachLocationDetailsOverlay() {
                if (this.locationDetailsOverlay || !this.elements.locationArticle || !google.maps.OverlayView) return;

                const article = this.elements.locationArticle;
                this.locationDetailsOverlay = new class extends google.maps.OverlayView {
                    position = null;

                    onAdd() {
                        this.getPanes().floatPane.appendChild(article);
                        this.draw();
                        this.getMap().addListener('idle', () => this.ensureSpaceAbovePoint());
                        this.ensureSpaceAbovePoint();
                    }

                    draw() {
                        if (!this.position || article.hidden) return;

                        const pixel = this.getProjection()?.fromLatLngToContainerPixel(this.position);
                        const mapElement = this.getMap()?.getDiv();
                        const pane = this.getPanes()?.floatPane;
                        if (!pixel || !mapElement || !pane) return;

                        const margin = 10;
                        const halfWidth = article.offsetWidth / 2;
                        const left = Math.max(halfWidth + margin, Math.min(
                            pixel.x,
                            mapElement.clientWidth - halfWidth - margin
                        ));
                        const topAbovePoint = pixel.y - article.offsetHeight - 18;
                        const isBelowPoint = topAbovePoint < margin;
                        const top = isBelowPoint
                            ? Math.min(pixel.y + 20, mapElement.clientHeight - article.offsetHeight - margin)
                            : topAbovePoint;
                        const mapRect = mapElement.getBoundingClientRect();
                        const paneRect = pane.getBoundingClientRect();

                        article.style.left = `${mapRect.left - paneRect.left + left}px`;
                        article.style.top = `${mapRect.top - paneRect.top + Math.max(margin, top)}px`;
                        article.style.setProperty('--location-anchor-x', `${pixel.x - left + halfWidth}px`);
                        article.classList.toggle('is-below-point', isBelowPoint);
                    }

                    onRemove() {
                        article.remove();
                    }

                    ensureSpaceAbovePoint() {
                        if (this.adjustingMap || !this.position || article.hidden) return;

                        const map = this.getMap();
                        const pixel = this.getProjection()?.fromLatLngToContainerPixel(this.position);
                        if (!map || !pixel) return;

                        const mapHeight = map.getDiv().clientHeight;
                        const desiredY = Math.min(article.offsetHeight + 28, mapHeight - 10);
                        if (pixel.y >= desiredY) return;

                        this.adjustingMap = true;
                        google.maps.event.addListenerOnce(map, 'idle', () => {
                            this.adjustingMap = false;
                            this.draw();
                        });
                        map.panBy(0, pixel.y - desiredY);
                    }

                    setLocation(position) {
                        this.position = position;
                        this.draw();
                        this.ensureSpaceAbovePoint();
                    }
                }();
                this.locationDetailsOverlay.setMap(this.googleMapInstance);
            },

            selectMapPoint(latLng) {
                if (!latLng) return;

                const point = latLng.toJSON();
                if (!hasValidCoordinates(point.lat, point.lng)) return;

                let savedCepData;
                try {
                    savedCepData = JSON.parse(localStorage.getItem('cart_cep_data') || 'null');
                } catch (error) {
                    savedCepData = null;
                }
                if (!savedCepData?.cep) return;

                const updatedData = {
                    ...savedCepData,
                    lat: point.lat,
                    lng: point.lng,
                    locationSelectedManually: true
                };
                localStorage.setItem('cart_cep_data', JSON.stringify(updatedData));

                this.googleMapMarker?.setPosition(point);

                if (this.elements.mapStatusBadge) {
                    this.elements.mapStatusBadge.innerText = 'Ponto definido';
                    this.elements.mapStatusBadge.classList.add('active');
                }
                if (this.elements.mapPointLabel) {
                    this.elements.mapPointLabel.textContent = 'Clique no mapa para ajustar o ponto de entrega.';
                }
                this.updateLocationArticle(updatedData);
                this.locationDetailsOverlay?.setLocation(this.googleMapMarker?.getPosition());
            },

            toggleSelection(index, isChecked) {
                const cart = window.CartStorage.read();
                if (cart[index]) {
                    cart[index].selected = isChecked;
                    window.CartStorage.write(cart);
                    this.render();
                    window.dispatchEvent(new Event('cartUpdated'));
                }
            },

            render() {
                const cart = loadCartItems();

                if (cart.length === 0) {
                    this.elements.itemsContainer.innerHTML = `
                        <div class="empty-cart">
                            <span class="material-icons">shopping_basket</span>
                            <p>Seu carrinho está vazio.</p>
                            <a href="/products" class="btn-primary">Explorar Produtos</a>
                        </div>
                    `;
                    if (this.elements.mapsContainer) {
                        this.elements.mapsContainer.style.display = 'none';
                    }
                    this.updateTotals(0);
                    this.elements.checkoutBtn.disabled = true;
                    return;
                }

                if (this.elements.mapsContainer) {
                    this.elements.mapsContainer.style.display = 'flex';
                }

                let html = '';
                let total = 0;
                let hasSelected = false;


                cart.forEach((item, index) => {
                    if (item.selected === undefined) item.selected = true;

                    const itemTotal = item.preco * item.quantidade;
                    if (item.selected && item.quantidade > 0) {
                        total += itemTotal;
                        hasSelected = true;
                    }

                    html += `
                        <div class="cart-item">
                            <div class="item-selection">
                                <input type="checkbox" class="item-checkbox" data-index="${index}" ${item.selected ? 'checked' : ''}>
                            </div>
                            <div class="item-image">
                                <img src="${escapeHtml(item.imagem || '/img/placeholder-product.svg')}" alt="${escapeHtml(item.nome)}">
                            </div>
                            <div class="item-details">
                                <h3 class="item-name">${escapeHtml(item.nome)}</h3>
                                <p class="item-variation">${escapeHtml(item.cor)} ${item.tamanho ? '| ' + escapeHtml(item.tamanho) : ''}</p>
                                <div class="item-price-qty">
                                    <span class="item-price">R$ ${item.preco.toFixed(2)}</span>
                                    <div class="quantity-control">
                                        <button class="qty-btn" data-index="${index}" data-change="-1">-</button>
                                        <input type="text" value="${item.quantidade}" readonly>
                                        <button class="qty-btn" data-index="${index}" data-change="1" ${item.quantidade >= (item.estoqueMax ?? Infinity) ? 'disabled' : ''}>+</button>
                                    </div>
                                </div>
                            </div>
                            <div class="item-actions">
                                <span class="item-total">R$ ${itemTotal.toFixed(2)}</span>
                                <button class="remove-item" data-index="${index}" title="Remover item">
                                    <span class="material-icons">delete_outline</span>
                                </button>
                            </div>
                        </div>
                    `;
                });

                this.elements.itemsContainer.innerHTML = html;
                this.updateTotals(total);
                this.elements.checkoutBtn.disabled = !hasSelected;
            },

            updateTotals(total) {
                const finalTotal = total > 0 ? total : 0;
                this.elements.totalDisplay.innerText = finalTotal.toFixed(2).replace('.', ',');
                this.elements.subtotalDisplay.innerText = total.toFixed(2).replace('.', ',');
            },

            removeItem(index) {
                const cart = window.CartStorage.read();
                cart.splice(index, 1);
                window.CartStorage.write(cart);
                this.render();
                window.dispatchEvent(new Event('cartUpdated'));
            },

            updateQuantity(index, change) {
                const cart = window.CartStorage.read();
                const newQty = cart[index].quantidade + change;
                const maxQty = cart[index].estoqueMax ?? Infinity;

                if (newQty >= 1 && newQty <= maxQty) {
                    cart[index].quantidade = newQty;
                    window.CartStorage.write(cart);
                    this.render();
                    window.dispatchEvent(new Event('cartUpdated'));
                } else if (newQty === 0) {
                    cart[index].quantidade = 0;
                    window.CartStorage.write(cart);
                    this.render();
                    window.dispatchEvent(new Event('cartUpdated'));
                }
            },

            async handleCheckout() {
                const cart = window.CartStorage.read();
                const selectedItems = cart.filter(item => item.selected !== false && Number(item.quantidade) > 0);
                if (selectedItems.length === 0) return;

                // Valida se o CEP foi informado antes de prosseguir
                let savedCepData = null;
                try {
                    savedCepData = JSON.parse(localStorage.getItem('cart_cep_data') || 'null');
                } catch (e) {}

                const currentCepDigits = this.elements.cepInput ? this.elements.cepInput.value.replace(/\D/g, '') : '';

                if (!savedCepData || !savedCepData.cep || currentCepDigits.length !== 8) {
                    if (this.elements.cepInput) {
                        this.elements.cepInput.focus();
                        this.elements.cepInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    this.showCepError('Por favor, informe seu CEP para calcular a entrega antes de finalizar a compra.');
                    return;
                }

                try {
                    this.elements.checkoutBtn.disabled = true;
                    this.elements.checkoutBtn.innerText = 'Processando...';

                    // Mapeia apenas os itens selecionados para o formato esperado pelo backend
                    const items = selectedItems.map(item => ({
                        id: item.productId || item._id || item.id,
                        quantity: item.quantidade,
                        cor: item.cor || '',
                        tamanho: item.tamanho || ''
                    }));

                    const guestName = this.elements.guestName?.value.trim() || '';
                    const guestEmail = this.elements.guestEmail?.value.trim() || '';
                    const guestPhone = this.elements.guestPhone?.value.trim() || '';

                    if (this.elements.guestName) {
                        if (!guestName || !guestEmail) {
                            showNotification('Informe nome e e-mail para concluir a compra temporária.', 'warning');
                            this.elements.guestName.focus();
                            return;
                        }

                        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
                            showNotification('Informe um e-mail válido para concluir a compra.', 'error');
                            this.elements.guestEmail.focus();
                            return;
                        }
                    }

                    const customer = this.elements.guestName
                        ? { name: guestName, email: guestEmail, phone: guestPhone }
                        : {};

                    if (Object.keys(customer).length > 0) {
                        localStorage.setItem('cart_customer', JSON.stringify(customer));
                        localStorage.setItem('cart_address', JSON.stringify({
                            ...savedCepData,
                            cep: savedCepData.formattedCep || savedCepData.cep
                        }));
                    }

                    const orderPayload = {
                        customer,
                        items,
                        address: {
                            cep: savedCepData.formattedCep || savedCepData.cep,
                            street: savedCepData.street || '',
                            neighborhood: savedCepData.neighborhood || '',
                            city: savedCepData.city || '',
                            state: savedCepData.state || '',
                            lat: savedCepData.lat,
                            lng: savedCepData.lng
                        },
                        shipping: {
                            method: 'padrao',
                            cost: 0
                        }
                    };

                    showNotification('Criando sua compra temporária...', 'info');
                    const response = await fetch('/orders/create-order', {
                        method: 'POST',
                        redirect: 'follow',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'x-csrf-token': document.querySelector('.cart-page')?.dataset.csrfToken || ''
                        },
                        body: JSON.stringify(orderPayload)
                    });

                    const data = await response.json().catch(() => ({}));

                    if (response.ok && (data.redirectUrl || data.orderId)) {
                        const targetUrl = data.redirectUrl || `/checkout/${data.orderId}`;
                        const remainingCart = cart.filter(item => item.selected === false);
                        if (remainingCart.length > 0) {
                            window.CartStorage.write(remainingCart);
                        } else {
                            window.CartStorage.write([]);
                        }
                        showNotification('Compra criada com sucesso. Abrindo o checkout.', 'success');
                        window.location.assign(targetUrl);
                        return;
                    }

                    if (response.redirected && response.url.includes('/checkout/')) {
                        const remainingCart = cart.filter(item => item.selected === false);
                        if (remainingCart.length > 0) {
                            window.CartStorage.write(remainingCart);
                        } else {
                            window.CartStorage.write([]);
                        }
                        showNotification('Compra criada com sucesso. Abrindo o checkout.', 'success');
                        window.location.assign(response.url);
                        return;
                    }

                    if (response.status === 401) {
                        showNotification('Não foi possível concluir a compra sem uma sessão.', 'error');
                        window.location.assign('/login?redirect=' + encodeURIComponent('/cart'));
                        return;
                    }

                    showNotification(data.message || data.error || 'Erro ao processar o checkout. Tente novamente.', 'error');
                } catch (error) {
                    console.error('Erro no checkout:', error);
                    showNotification('Ocorreu um erro ao tentar finalizar a compra.', 'error');
                } finally {
                    this.elements.checkoutBtn.disabled = false;
                    this.elements.checkoutBtn.innerText = 'Finalizar Compra';
                }
            }

        };

        CartPage.init();
    };

    window.onCartGoogleMapsReady = () => document.dispatchEvent(new Event('cartGoogleMapsReady'));
    initializeCartPage();

    const mapApiKey = document.getElementById('cart-mini-map')?.dataset.mapApiKey;
    if (mapApiKey && !window.google?.maps && !document.getElementById('cart-google-maps-api')) {
        const mapsScript = document.createElement('script');
        mapsScript.id = 'cart-google-maps-api';
        mapsScript.async = true;
        mapsScript.defer = true;
        mapsScript.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapApiKey)}&callback=onCartGoogleMapsReady&loading=async`;
        document.head.appendChild(mapsScript);
    }
    })();