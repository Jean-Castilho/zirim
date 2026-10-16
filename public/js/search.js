/**
 * Busca de produtos da loja (página /products).
 *
 * - Busca automática após 300ms de pausa, a partir de 2 caracteres (Enter/botão pesquisam sempre).
 * - Mantém a categoria ativa da URL e grava a busca na URL (recarregar ou voltar preserva o resultado).
 * - Cancela requisições antigas: só a resposta mais recente atualiza a lista.
 */
(() => {
  const DEBOUNCE_MS = 300;
  const MIN_AUTO_CHARS = 2;

  let debounceTimer = null;
  let controller = null;
  let latestRequest = 0;

  const currentCategory = () => new URLSearchParams(window.location.search).get('category') || '';

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

    const category = currentCategory();
    const url = buildUrl(query, category);

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
      if (typeof showNotification === 'function') {
        showNotification('Não foi possível pesquisar agora. Tente novamente.', 'error');
      }
    } finally {
      if (requestId === latestRequest) setGridBusy(false);
    }
  };

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
  };

  // Listener global único: a página é trocada pelo htmx sem recarregar o script
  if (!document.body.dataset.searchLifecycleInitialized) {
    document.body.dataset.searchLifecycleInitialized = 'true';
    document.body.addEventListener('htmx:afterSwap', initializeSearch);
  }

  initializeSearch();
})();
