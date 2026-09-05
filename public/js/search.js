/**
 * search.js - Lógica de busca com debounce (espera de 500ms)
 * Melhora a UX e reduz carga no servidor.
 */

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    let debounceTimer;

    // Função que dispara a busca (reutilizando a lógica global se disponível ou implementando a necessária)
    const performSearch = () => {
        if (!searchInput) return;
        
        const searchQuery = searchInput.value.trim();
        const url = `/products?q=${encodeURIComponent(searchQuery)}`;
        
        // Dispara o evento de atualização (o products.ejs escuta e processa o fetch)
        // Se a função updateProducts estiver no escopo global ou puder ser disparada via evento:
        console.log(`[Search] Iniciando busca para: "${searchQuery}"`);
        
        // Tentamos encontrar o container de produtos para dar feedback visual
        const grid = document.querySelector('.products-grid');
        if (grid) grid.style.opacity = '0.5';

        // Fazemos o fetch similar ao que está no EJS, mas centralizado
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
                // Dispara evento para outros scripts (ex: favorited.js) saberem que o DOM mudou
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

    if (searchInput) {
        // Evento de digitação com Debounce de 500ms
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                performSearch();
            }, 500);
        });

        // Evento de tecla Enter (imediato)
        searchInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                clearTimeout(debounceTimer);
                performSearch();
            }
        });
    }

    if (searchButton) {
        // Evento de clique no botão (imediato)
        searchButton.addEventListener('click', () => {
            clearTimeout(debounceTimer);
            performSearch();
        });
    }
});
