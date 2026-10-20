/**
 * Busca e filtro de produtos da loja (página /products).
 *
 * - Busca automática após 300ms de pausa, a partir de 2 caracteres (Enter/botão pesquisam sempre).
 * - Botão de filtro: abre o painel de categorias; escolher uma categoria refaz a busca sem recarregar.
 *   Fecha com outro clique, com Esc ou ao clicar fora.
 * - Mantém busca e categoria na URL (recarregar ou voltar preserva o resultado).
 * - Cancela requisições antigas: só a resposta mais recente atualiza a lista.
 */
(() => {
  const DEBOUNCE_MS = 300;
  const MIN_AUTO_CHARS = 2;

  let debounceTimer = null;
  let controller = null;
  let latestRequest = 0;

  const categoryFromUrl = () => new URLSearchParams(window.location.search).get('category') || '';
  let selectedCategory = categoryFromUrl();

  const buildUrl = (query, category) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (category) params.set('category', category);
    const qs = params.toString();
    return `/products${qs ? `?${qs}` : ''}`;
  };

  const setGridBusy = (busy) => {
    const grid = document.querySelector('.products-grid');
    if (!grid) return;
    grid.setAttribute('aria-busy', String(busy));
    grid.style.opacity = busy ? '0.5' : '1';
  };

  const runSearch = async (input, { force = false } = {}) => {
    if (!input) return;
    const query = input.value.trim();
    if (!force && query.length > 0 && query.length < MIN_AUTO_CHARS) return;

    const url = buildUrl(query, selectedCategory);

    // Cancela a requisição anterior e identifica esta, para ignorar respostas fora de ordem
    if (controller) controller.abort();
    controller = new AbortController();
    const requestId = ++latestRequest;
    setGridBusy(true);

    try {
      // O servidor só devolve o fragmento da página para requisições htmx
      const response = await fetch(url, {
        headers: { 'hx-request': 'true', Accept: 'text/html' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      if (requestId !== latestRequest) return;

      const newGrid = new DOMParser().parseFromString(html, 'text/html').querySelector('.products-grid');
      const grid = document.querySelector('.products-grid');
      if (!newGrid || !grid) return;

      grid.innerHTML = newGrid.innerHTML;
      window.history.replaceState(window.history.state, '', url);
      document.body.dispatchEvent(new CustomEvent('htmx:afterSwap', { detail: { target: grid } }));
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('[Search] Erro na busca:', error);
      if (window.zirimDialog) {
        window.zirimDialog.notify('Não foi possível pesquisar agora. Tente novamente.', { tone: 'danger' });
      }
    } finally {
      if (requestId === latestRequest) setGridBusy(false);
    }
  };

  const filterElements = () => ({
    button: document.getElementById('filter-dropdown-button'),
    panel: document.getElementById('filter-dropdown-content'),
  });

  const setFilterOpen = (open) => {
    const { button, panel } = filterElements();
    if (!button || !panel) return;
    panel.classList.toggle('show', open);
    button.setAttribute('aria-expanded', String(open));
  };

  const isFilterOpen = () => filterElements().panel?.classList.contains('show') === true;

  const syncFilterState = () => {
    const { button, panel } = filterElements();
    if (!button || !panel) return;
    button.classList.toggle('is-filtered', selectedCategory !== '');
    panel.querySelectorAll('a[data-category]').forEach((link) => {
      link.classList.toggle('active', (link.dataset.category || '') === selectedCategory);
    });
  };

  const initFilter = () => {
    const { button, panel } = filterElements();
    if (!button || !panel || button.dataset.filterInitialized) return;
    button.dataset.filterInitialized = 'true';

    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'filter-dropdown-content');

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setFilterOpen(!isFilterOpen());
    });

    panel.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-category]');
      if (!link) return;
      // Filtra na própria página: impede a navegação htmx e o recarregamento
      event.preventDefault();
      event.stopPropagation();
      selectedCategory = link.dataset.category || '';
      setFilterOpen(false);
      syncFilterState();
      clearTimeout(debounceTimer);
      runSearch(document.getElementById('search-input'), { force: true });
    });

    syncFilterState();
  };

  // Listeners globais únicos: fecham o painel ao clicar fora ou pressionar Esc
  if (!document.body.dataset.filterGlobalInitialized) {
    document.body.dataset.filterGlobalInitialized = 'true';
    document.addEventListener('click', (event) => {
      if (isFilterOpen() && !event.target.closest('.filter-search')) setFilterOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isFilterOpen()) setFilterOpen(false);
    });
  }

  const initializeSearch = () => {
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');

    if (searchInput && !searchInput.dataset.searchInitialized) {
      searchInput.dataset.searchInitialized = 'true';

      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runSearch(searchInput), DEBOUNCE_MS);
      });

      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          clearTimeout(debounceTimer);
          runSearch(searchInput, { force: true });
        }
      });
    }

    if (searchButton && !searchButton.dataset.searchInitialized) {
      searchButton.dataset.searchInitialized = 'true';
      searchButton.addEventListener('click', () => {
        clearTimeout(debounceTimer);
        runSearch(searchInput, { force: true });
      });
    }

    initFilter();
  };

  // Listener global único: a página é trocada pelo htmx sem recarregar o script
  if (!document.body.dataset.searchLifecycleInitialized) {
    document.body.dataset.searchLifecycleInitialized = 'true';
    document.body.addEventListener('htmx:afterSwap', initializeSearch);
  }

  initializeSearch();
})();
