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

        // Converte coordenada vinda de API. Number("") e Number(null) dão 0 (ponto no Golfo da Guiné),
        // por isso valores vazios viram null antes da conversão.
        const toCoordinate = (value) => {
            if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
            const number = Number(value);
            return Number.isFinite(number) ? number : null;
        };

        // Todo CEP é do Brasil: aceita apenas pontos dentro do retângulo que cobre o país.
        const isBrazilPoint = (latitude, longitude) =>
            latitude !== null && longitude !== null &&
            latitude >= -34 && latitude <= 6 && longitude >= -74 && longitude <= -28;

        // Versão da lógica de geolocalização do CEP. Dados salvos com versão antiga
        // (coordenada do CEP inteiro, ou (0,0) vindo de API vazia) são recalculados.
        const CEP_GEO_VERSION = 5;

        // Texto sem acento, caixa ou pontuação, para comparar com o retorno do geocodificador.
        const normalizeText = (value) => String(value ?? '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Nome da via sem o tipo ("Rua", "Av.", "Avenida"...).
        const streetCoreName = (value) => normalizeText(value)
            .replace(/^(rua|r|avenida|av|alameda|al|travessa|tv|praca|pc|estrada|rodovia|rod|largo|viela|beco|via)\s+/, '')
            .trim();

        // Mesmo nome de via, tolerando abreviações ("dr" x "doutor") e uma palavra a mais ou a menos.
        const sameName = (a, b) => {
            if (!a || !b) return false;
            if (a === b) return true;
            const wordsA = new Set(a.split(' '));
            const wordsB = new Set(b.split(' '));
            const common = [...wordsA].filter(word => wordsB.has(word)).length;
            return common / Math.max(wordsA.size, wordsB.size) >= 0.75;
        };

        const searchNominatim = async (params) => {
            const url = new URL('https://nominatim.openstreetmap.org/search');
            url.search = new URLSearchParams({
                format: 'jsonv2',
                addressdetails: '1',
                countrycodes: 'br',
                limit: '5',
                ...params
            });
            const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
            if (!res.ok) return [];
            const matches = await res.json();
            return Array.isArray(matches) ? matches : [];
        };

        /**
         * Localiza o logradouro encontrado pelo CEP (rua + cidade + UF) no OpenStreetMap Nominatim.
         * Tenta a busca estruturada e, depois, a busca por texto completo com o bairro.
         * Só aceita uma via com o mesmo nome do CEP, para não marcar uma rua homônima de outra região.
         */
        const geocodeStreet = async (address) => {
            const wantedStreet = streetCoreName(address.street);
            if (wantedStreet.length < 3) return null;

            const wantedNeighborhood = normalizeText(address.neighborhood);
            const queries = [
                { street: address.street, city: address.city, state: address.state, country: 'Brasil' },
                { q: [address.street, address.neighborhood, address.city, address.state, 'Brasil'].filter(Boolean).join(', ') }
            ];

            for (const params of queries) {
                try {
                    const matches = await searchNominatim(params);
                    const candidates = matches.filter(match =>
                        sameName(streetCoreName(match.address?.road || match.name), wantedStreet)
                        && isBrazilPoint(toCoordinate(match.lat), toCoordinate(match.lon))
                    );
                    if (candidates.length === 0) continue;

                    // Prefere o trecho no bairro do CEP, depois a própria via (highway) sobre estabelecimentos.
                    const inNeighborhood = (match) => [match.address?.suburb, match.address?.neighbourhood, match.address?.quarter]
                        .some(name => wantedNeighborhood && sameName(normalizeText(name), wantedNeighborhood));
                    const best = candidates.find(inNeighborhood)
                        || candidates.find(match => match.class === 'highway')
                        || candidates[0];

                    return { lat: toCoordinate(best.lat), lng: toCoordinate(best.lon) };
                } catch (error) {
                    console.warn('Busca da rua pelo CEP falhou:', error);
                }
            }
            return null;
        };

        // Bairro do CEP: busca o nome do bairro dentro da cidade (nunca só a cidade).
        const geocodeNeighborhood = async (address) => {
            const wanted = normalizeText(address.neighborhood);
            if (wanted.length < 3) return null;
            try {
                const matches = await searchNominatim({
                    q: [address.neighborhood, address.city, address.state, 'Brasil'].filter(Boolean).join(', ')
                });
                const match = matches.find(item => {
                    const names = [item.address?.suburb, item.address?.neighbourhood, item.address?.quarter, item.name];
                    return names.some(name => sameName(normalizeText(name), wanted))
                        && isBrazilPoint(toCoordinate(item.lat), toCoordinate(item.lon));
                });
                return match ? { lat: toCoordinate(match.lat), lng: toCoordinate(match.lon) } : null;
            } catch (error) {
                console.warn('Busca do bairro pelo CEP falhou:', error);
                return null;
            }
        };

        // Centro da cidade do CEP: usado só para recusar pontos que cairiam no centro.
        const geocodeCityCenter = async (address) => {
            const wanted = normalizeText(address.city);
            if (!wanted) return null;
            try {
                const matches = await searchNominatim({
                    q: [address.city, address.state, 'Brasil'].filter(Boolean).join(', ')
                });
                const match = matches.find(item => sameName(normalizeText(item.name), wanted)
                    && isBrazilPoint(toCoordinate(item.lat), toCoordinate(item.lon)));
                return match ? { lat: toCoordinate(match.lat), lng: toCoordinate(match.lon) } : null;
            } catch (error) {
                console.warn('Busca do centro da cidade falhou:', error);
                return null;
            }
        };

        // Distância aproximada em km entre dois pontos (fórmula de Haversine).
        const distanceKm = (a, b) => {
            const toRad = (degrees) => degrees * Math.PI / 180;
            const dLat = toRad(b.lat - a.lat);
            const dLng = toRad(b.lng - a.lng);
            const h = Math.sin(dLat / 2) ** 2
                + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
            return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
        };

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
            cepLookupTimer: null,
            cepLookupRequestId: 0,
            cepLookupInFlight: '',

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

                        // Resultado salvo com a lógica antiga: refaz a busca para marcar a rua exata.
                        // Um ponto ajustado manualmente pelo cliente é preservado.
                        if (savedCepData.geoVersion !== CEP_GEO_VERSION && !savedCepData.locationSelectedManually && this.elements.cepInput) {
                            this.handleCepLookup({ force: true });
                        }
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
                        this.onCepTyping(val);
                    });

                    this.elements.cepInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            this.cancelScheduledCepLookup();
                            this.handleCepLookup({ force: true });
                        }
                    });
                }

                if (this.elements.cepBtn) {
                    this.elements.cepBtn.addEventListener('click', () => {
                        this.handleCepLookup({ force: true });
                    });
                }

            },

            /** Enquanto o CEP é digitado: limpa a confirmação anterior e agenda a consulta quando houver 8 dígitos. */
            onCepTyping(digits) {
                const savedCepData = this.getSavedCepData();
                if (savedCepData?.cep && savedCepData.cep !== digits) {
                    // O endereço confirmado não corresponde mais ao que está digitado.
                    this.cancelScheduledCepLookup();
                    if (this.elements.cepResult) this.elements.cepResult.style.display = 'none';
                    if (this.elements.mapStatusBadge) {
                        this.elements.mapStatusBadge.innerText = digits.length === 8 ? 'Confirmando CEP...' : 'Digitando CEP...';
                        this.elements.mapStatusBadge.classList.remove('active');
                    }
                }

                if (digits.length !== 8) {
                    this.cancelScheduledCepLookup();
                    return;
                }

                if (this.cepLookupInFlight === digits || savedCepData?.cep === digits) return;

                this.cancelScheduledCepLookup();
                this.cepLookupTimer = window.setTimeout(() => {
                    this.cepLookupTimer = null;
                    this.handleCepLookup();
                }, 350);
            },

            cancelScheduledCepLookup() {
                if (this.cepLookupTimer) {
                    window.clearTimeout(this.cepLookupTimer);
                    this.cepLookupTimer = null;
                }
            },

            getSavedCepData() {
                try {
                    return JSON.parse(localStorage.getItem('cart_cep_data') || 'null');
                } catch (e) {
                    return null;
                }
            },

            /**
             * @param {{ force?: boolean }} options
             * force = busca explícita (botão/Enter): sempre consulta o CEP e recentraliza o marcador
             * na localização do CEP, descartando um ponto ajustado manualmente.
             * Sem force (consulta automática ao digitar): reaproveita o CEP já confirmado.
             */
            async handleCepLookup({ force = false } = {}) {
                this.cancelScheduledCepLookup();
                const rawValue = this.elements.cepInput.value;
                const cleanCep = rawValue.replace(/\D/g, '');

                if (cleanCep.length !== 8) {
                    this.showCepError('Por favor, digite um CEP válido com 8 dígitos.');
                    return;
                }

                // Se este CEP já está confirmado, apenas reaplica o resultado salvo.
                const savedCepData = this.getSavedCepData();
                if (!force && savedCepData?.cep === cleanCep && savedCepData.geoVersion === CEP_GEO_VERSION && isBrazilPoint(savedCepData.lat, savedCepData.lng)) {
                    this.applyCepResult(savedCepData, true);
                    return;
                }

                const requestId = ++this.cepLookupRequestId;
                this.cepLookupInFlight = cleanCep;
                this.showCepLoading(true);

                try {
                    const data = await this.fetchAddressAndCoords(cleanCep);
                    // Descarta respostas antigas se o usuário já digitou outro CEP.
                    if (requestId !== this.cepLookupRequestId) return;

                    data.formattedCep = cleanCep.slice(0, 5) + '-' + cleanCep.slice(5);
                    data.cep = cleanCep;
                    localStorage.setItem('cart_cep_data', JSON.stringify(data));
                    this.applyCepResult(data, true);
                } catch (error) {
                    if (requestId !== this.cepLookupRequestId) return;
                    console.error('Erro na consulta do CEP:', error);
                    this.showCepError(error.message || 'Não foi possível consultar este CEP.');
                } finally {
                    if (requestId === this.cepLookupRequestId) {
                        this.cepLookupInFlight = '';
                        this.showCepLoading(false);
                    }
                }
            },

            async fetchAddressAndCoords(cleanCep) {
                let result = null;

                // 1. Consulta BrasilAPI v2 (endereço + coordenadas geográficas nativas)
                try {
                    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`);
                    if (res.ok) {
                        const data = await res.json();
                        // A BrasilAPI costuma devolver coordenadas vazias: toCoordinate descarta esses casos.
                        const lat = toCoordinate(data.location?.coordinates?.latitude);
                        const lng = toCoordinate(data.location?.coordinates?.longitude);
                        result = {
                            street: data.street || '',
                            neighborhood: data.neighborhood || '',
                            city: data.city || '',
                            state: data.state || '',
                            lat: isBrazilPoint(lat, lng) ? lat : null,
                            lng: isBrazilPoint(lat, lng) ? lng : null
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

                // 3. Rua do CEP (campos "street" e "neighborhood" da consulta do CEP).
                const streetPoint = result.street ? await geocodeStreet(result) : null;
                // 4. Sem rua localizada, usa o bairro do CEP.
                const neighborhoodPoint = !streetPoint && result.neighborhood ? await geocodeNeighborhood(result) : null;

                const precise = streetPoint || neighborhoodPoint;
                if (precise) {
                    result.lat = precise.lat;
                    result.lng = precise.lng;
                    result.geoPrecision = streetPoint ? 'street' : 'neighborhood';
                } else {
                    // 5. Último recurso (CEP sem rua nem bairro encontrados): coordenada do CEP,
                    // mas recusa qualquer ponto que caia no centro da cidade.
                    const cityCenter = await geocodeCityCenter(result);
                    const notCityCenter = (point) => isBrazilPoint(point?.lat, point?.lng)
                        && (!cityCenter || distanceKm(point, cityCenter) > 1);

                    let fallback = isBrazilPoint(result.lat, result.lng) ? { lat: result.lat, lng: result.lng } : null;
                    if (!notCityCenter(fallback)) {
                        fallback = null;
                        try {
                            const [match] = await searchNominatim({ postalcode: cleanCep, country: 'Brasil', limit: '1' });
                            const point = match && { lat: toCoordinate(match.lat), lng: toCoordinate(match.lon) };
                            if (notCityCenter(point)) fallback = point;
                        } catch (geoErr) {
                            console.warn('Busca da localização pelo CEP falhou:', geoErr);
                        }
                    }

                    if (!fallback) {
                        throw new Error('Não foi possível localizar a rua ou o bairro deste CEP no mapa. Confira o CEP e tente novamente.');
                    }
                    result.lat = fallback.lat;
                    result.lng = fallback.lng;
                    result.geoPrecision = 'cep';
                }

                result.geoVersion = CEP_GEO_VERSION;
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
                this.renderMiniMap(data.lat, data.lng, isNewSearch);
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
                        title: 'Ponto exato de entrega',
                        draggable: true
                    });
                    // O marcador é o ponto de entrega: arrastá-lo atualiza a localização salva.
                    this.googleMapMarker.addListener('dragend', event => this.selectMapPoint(event.latLng));
                } else {
                    this.googleMapMarker.setPosition({ lat, lng });
                }


                if (this.elements.mapPlaceholder) {
                    this.elements.mapPlaceholder.style.display = 'none';
                }
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
                    // O painel de frete (CEP), o mini-mapa e os dados do cliente continuam visíveis
                    // mesmo com o carrinho vazio; só o botão de checkout é desabilitado.
                    this.updateTotals(0);
                    this.elements.checkoutBtn.disabled = true;
                    return;
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
                                <input type="checkbox" class="item-checkbox" data-index="${index}" ${item.selected ? 'checked' : ''} aria-label="Selecionar ${escapeHtml(item.nome)}">
                            </div>
                            <div class="item-image">
                                <img src="${escapeHtml(item.imagem || '/img/placeholder-product.svg')}" alt="${escapeHtml(item.nome)}">
                            </div>
                            <div class="item-details">
                                <h3 class="item-name">${escapeHtml(item.nome)}</h3>
                                <p class="item-variation">${escapeHtml(item.cor)} ${item.tamanho ? '| ' + escapeHtml(item.tamanho) : ''}</p>
                                <div class="quantity-control">
                                    <button class="qty-btn" data-index="${index}" data-change="-1" aria-label="Diminuir quantidade">-</button>
                                    <input type="text" value="${item.quantidade}" readonly aria-label="Quantidade">
                                    <button class="qty-btn" data-index="${index}" data-change="1" aria-label="Aumentar quantidade" ${item.quantidade >= (item.estoqueMax ?? Infinity) ? 'disabled' : ''}>+</button>
                                </div>
                                <span class="item-price">R$ ${item.preco.toFixed(2)}</span>
                                ${item.quantidade > 1 ? `<span class="item-total">Total: R$ ${itemTotal.toFixed(2)}</span>` : ''}
                            </div>
                            <div class="item-actions">
                                <button class="remove-item" data-index="${index}" title="Remover item" aria-label="Remover item">
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

            /** Guarda no navegador uma cópia do pedido, só para clientes não cadastrados. */
            saveGuestOrder(orderId, selectedItems, savedCepData, customer) {
                if (!this.elements.guestName || !orderId || !window.GuestOrders) return;

                const items = selectedItems.map(item => ({
                    nome: String(item.nome ?? 'Produto'),
                    preco: parseCartNumber(item.preco, 0),
                    quantidade: Number(item.quantidade) || 0,
                    imagem: item.imagem || '/img/placeholder-product.svg',
                    cor: item.cor || '',
                    tamanho: item.tamanho || ''
                }));

                const total = items.reduce((sum, item) => sum + item.preco * item.quantidade, 0);

                window.GuestOrders.add({
                    orderId: String(orderId),
                    createdAt: new Date().toISOString(),
                    customer: { name: customer.name || '', email: customer.email || '', phone: customer.phone || '' },
                    items,
                    total: Math.round(total * 100) / 100,
                    shipping: { method: 'padrao', cost: 0 },
                    address: {
                        cep: savedCepData.formattedCep || savedCepData.cep || '',
                        street: savedCepData.street || '',
                        neighborhood: savedCepData.neighborhood || '',
                        city: savedCepData.city || '',
                        state: savedCepData.state || ''
                    }
                });
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

                if (!savedCepData || !savedCepData.cep || currentCepDigits !== savedCepData.cep) {
                    if (this.elements.cepInput) {
                        this.elements.cepInput.focus();
                        this.elements.cepInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    if (currentCepDigits.length === 8) {
                        // CEP completo mas ainda não confirmado: confirma agora e pede nova tentativa.
                        this.showCepError('Aguarde a confirmação do CEP antes de finalizar a compra.');
                        if (this.cepLookupInFlight !== currentCepDigits) this.handleCepLookup({ force: true });
                    } else {
                        this.showCepError('Por favor, informe seu CEP para calcular a entrega antes de finalizar a compra.');
                    }
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
                        this.saveGuestOrder(data.orderId || targetUrl.split('/checkout/')[1], selectedItems, savedCepData, customer);
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
                        this.saveGuestOrder(response.url.split('/checkout/')[1]?.split(/[?#]/)[0], selectedItems, savedCepData, customer);
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