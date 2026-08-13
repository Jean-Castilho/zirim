/**
 * Adiciona um produto aos favoritos no localStorage.
 * @param {string} productId - O ID do produto a ser adicionado aos favoritos.
 * @param {HTMLElement} buttonElement - O elemento do botão de favorito associado.
 * @returns {boolean} True se o produto foi adicionado, false se já existia.
 */
function addToFavorites(productId, buttonElement) {
    let favorites = JSON.parse(localStorage.getItem('favorites')) || [];

    if (favorites.includes(productId)) {
        showNotification('Este produto já está nos seus favoritos!', 'info');
        return false;
    }

    favorites.push(productId);
    localStorage.setItem('favorites', JSON.stringify(favorites));

    showNotification('Produto adicionado aos favoritos!', 'success');
    return true;
}

/**
 * Remove um produto dos favoritos no localStorage.
 * @param {string} productId - O ID do produto a ser removido dos favoritos.
 * @param {HTMLElement} buttonElement - O elemento do botão de favorito associado.
 * @returns {boolean} True se o produto foi removido, false se não foi encontrado.
 */
function removeFromFavorites(productId, buttonElement) {
    let favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    const updatedFavorites = favorites.filter(id => id !== productId);

    if (updatedFavorites.length < favorites.length) {
        localStorage.setItem('favorites', JSON.stringify(updatedFavorites));
        showNotification('Produto removido dos favoritos!', 'info');
        return true;
    }
    return false;
}

function updateFavoriteButtonVisualState(button) {
    const productId = button.dataset.productId;
    const icon = button.querySelector('.favorite-icon');
    const favorites = JSON.parse(localStorage.getItem('favorites')) || [];

    if (favorites.includes(productId)) {
        icon.textContent = 'favorite';
        button.dataset.isFavorited = 'true';
    } else {
        icon.textContent = 'favorite_border';
        button.dataset.isFavorited = 'false';
        icon.classList.remove('smooth-scale-animation');
    }
}

function initializeFavoriteButtons(container) {
    const favoriteButtons = container.querySelectorAll('.btn-favorite');
    favoriteButtons.forEach(button => {
        updateFavoriteButtonVisualState(button);
        const icon = button.querySelector('.favorite-icon');
        icon.classList.remove('smooth-scale-animation');
    });
}

/**
 * Obtém detalhes de produtos por uma lista de IDs, com projeção opcional.
 * @param {string[]} ids - Um array de IDs de produtos.
 * @param {object} projection - Um objeto de projeção para os campos a serem retornados.
 * @returns {Promise<object[]>} Uma promessa que resolve para um array de objetos de produtos.
 */
async function getProdutcDetailsByIds(ids, projection = {}) {
    if (!Array.isArray(ids) || ids.length === 0) {
        console.warn("Nenhum ID fornecido para buscar detalhes do produto.");
        return [];
    }

    try {
        const response = await fetch('/products/projectionByIds', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids, projection }),
        });
        const products = await response.json();
        return products;
    } catch (error) {
        console.error('Erro ao buscar detalhes do produto por IDs:', error);
        return [];
    }

}

document.addEventListener('DOMContentLoaded', () => {

    // Para "ler" o retorno da Promise, você deve usar .then() ou await.
    getProdutcDetailsByIds(["6a2efdaf533c3e53c2684ac1", "6a2f3734590825373032b956"])
        .then(products => {
            console.log("Detalhes dos produtos favoritos:", products);
        })
        .catch(error => console.error("Erro ao buscar detalhes dos produtos favoritos:", error));

    initializeFavoriteButtons(document);

    document.body.addEventListener('click', (event) => {
        const button = event.target.closest('.btn-favorite');
        if (button) {
            event.preventDefault();
            const currentProductId = button.dataset.productId;

            if (button.dataset.isFavorited === 'true') {
                if (removeFromFavorites(currentProductId, button)) {
                    updateFavoriteButtonVisualState(button);
                    const icon = button.querySelector('.favorite-icon');
                    icon.classList.add('smooth-scale-animation');
                    setTimeout(() => icon.classList.remove('smooth-scale-animation'), 300);
                }
            } else {
                if (addToFavorites(currentProductId, button)) {
                    updateFavoriteButtonVisualState(button);
                    const icon = button.querySelector('.favorite-icon');
                    icon.classList.add('smooth-scale-animation');
                    setTimeout(() => icon.classList.remove('smooth-scale-animation'), 300);
                }
            }
        }
    });

    document.body.addEventListener('mouseover', (event) => {
        const button = event.target.closest('.btn-favorite');
        if (button && button.dataset.isFavorited === 'false') {
            const icon = button.querySelector('.favorite-icon');
            icon.textContent = 'favorite';
        }
    });

    document.body.addEventListener('mouseout', (event) => {
        const button = event.target.closest('.btn-favorite');
        if (button && button.dataset.isFavorited === 'false') {
            const icon = button.querySelector('.favorite-icon');
            icon.textContent = 'favorite_border';
        }
    });

    // evento htmx:afterSwap para re-inicializar os botões de favorito em conteúdo novo
    document.body.addEventListener('htmx:afterSwap', (event) => {
        initializeFavoriteButtons(event.detail.target || document);
    });
});