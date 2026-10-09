(() => {
/**
 * search.js - Lógica de busca com debounce (espera de 500ms)
 * Melhora a UX e reduz carga no servidor.
 */

let debounceTimer;

const performSearch = (searchInput) => {
    if (!searchInput) return;

    const searchQuery = searchInput.value.trim();
    const url = `/products?q=${encodeURIComponent(searchQuery)}`;

    const grid = document.querySelector('.products-grid');
    if (grid) grid.style.opacity = '0.5';

    fetch(url, {
        headers: { 'hx-request': 'true' }
    })
    .then(response => response.text())
    .then(html => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newGrid = doc.querySelector('.products-grid');

        if (newGrid && grid) {
            grid.innerHTML = newGrid.innerHTML;
            document.body.dispatchEvent(new CustomEvent('htmx:afterSwap', { 
                detail: { target: grid } 
            }));
        }
    })
    .catch(error => console.error('[Search] Erro na busca:', error))
    .finally(() => {
        if (grid) grid.style.opacity = '1';
    });
};

const initializeSearch = () => {
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');

    if (searchInput) {
        if (searchInput.dataset.searchInitialized) return;
        searchInput.dataset.searchInitialized = 'true';

        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                performSearch(searchInput);
            }, 500);
        });

        searchInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                clearTimeout(debounceTimer);
                performSearch(searchInput);
            }
        });
    }

    if (searchButton && !searchButton.dataset.searchInitialized) {
        searchButton.dataset.searchInitialized = 'true';
        searchButton.addEventListener('click', () => {
            clearTimeout(debounceTimer);
            performSearch(searchInput);
        });
    }
};

if (!document.body.dataset.searchLifecycleInitialized) {
    document.body.dataset.searchLifecycleInitialized = 'true';
    document.body.addEventListener('htmx:afterSwap', initializeSearch);
}

initializeSearch();
})();
