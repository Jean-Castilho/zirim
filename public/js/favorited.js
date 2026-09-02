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

document.addEventListener('DOMContentLoaded', () => {

    initializeFavoriteButtons(document);

    document.body.addEventListener('click', (event) => {
        const button = event.target.closest('.btn-favorite');
        if (button) {
            event.preventDefault();
            const currentProductId = button.dataset.productId;

            if (button.dataset.isFavorited === 'true') {
                if (removeFromFavorites(currentProductId, button)) {
                    const favoriteCard = button.closest('.favorites-container .product-card');

                    if (favoriteCard) {
                        favoriteCard.remove();
                    } else {
                        updateFavoriteButtonVisualState(button);
                        const icon = button.querySelector('.favorite-icon');
                        icon.classList.add('smooth-scale-animation');
                        setTimeout(() => icon.classList.remove('smooth-scale-animation'), 300);
                    }
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