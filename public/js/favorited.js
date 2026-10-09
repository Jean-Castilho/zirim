(() => {
    const readFavorites = () => {
        try {
            const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
            return Array.isArray(favorites) ? favorites.map(String) : [];
        } catch {
            return [];
        }
    };

    const updateFavoriteButtonVisualState = (button) => {
        const icon = button.querySelector('.favorite-icon');
        if (!icon) return;

        const isFavorited = readFavorites().includes(button.dataset.productId);
        icon.textContent = isFavorited ? 'favorite' : 'favorite_border';
        button.dataset.isFavorited = String(isFavorited);
        if (!isFavorited) icon.classList.remove('smooth-scale-animation');
    };

    const initializeFavoriteButtons = (container) => {
        container.querySelectorAll('.btn-favorite').forEach((button) => {
            updateFavoriteButtonVisualState(button);
            button.querySelector('.favorite-icon')?.classList.remove('smooth-scale-animation');
        });
    };

    const addToFavorites = (productId) => {
        const favorites = readFavorites();
        if (favorites.includes(productId)) {
            showNotification('Este produto já está nos seus favoritos!', 'info');
            return false;
        }

        favorites.push(productId);
        localStorage.setItem('favorites', JSON.stringify(favorites));
        showNotification('Produto adicionado aos favoritos!', 'success');
        return true;
    };

    const removeFromFavorites = (productId) => {
        const favorites = readFavorites();
        const updatedFavorites = favorites.filter(id => id !== productId);
        if (updatedFavorites.length === favorites.length) return false;

        localStorage.setItem('favorites', JSON.stringify(updatedFavorites));
        showNotification('Produto removido dos favoritos!', 'info');
        return true;
    };

    initializeFavoriteButtons(document);

    if (document.body.dataset.favoriteHandlersInitialized) return;
    document.body.dataset.favoriteHandlersInitialized = 'true';

    document.body.addEventListener('click', (event) => {
        const button = event.target.closest('.btn-favorite');
        if (!button) return;

        event.preventDefault();
        const productId = button.dataset.productId;
        const icon = button.querySelector('.favorite-icon');

        if (button.dataset.isFavorited === 'true') {
            if (!removeFromFavorites(productId)) return;

            const favoriteCard = button.closest('.favorites-container .product-card');
            if (favoriteCard) {
                favoriteCard.remove();
                window.dispatchEvent(new Event('favoritesUpdated'));
            } else {
                updateFavoriteButtonVisualState(button);
                icon?.classList.add('smooth-scale-animation');
                setTimeout(() => icon?.classList.remove('smooth-scale-animation'), 300);
            }
            return;
        }

        if (addToFavorites(productId)) {
            updateFavoriteButtonVisualState(button);
            icon?.classList.add('smooth-scale-animation');
            setTimeout(() => icon?.classList.remove('smooth-scale-animation'), 300);
        }
    });

    document.body.addEventListener('mouseover', (event) => {
        const button = event.target.closest('.btn-favorite');
        if (button && button.dataset.isFavorited === 'false') {
            button.querySelector('.favorite-icon')?.replaceChildren('favorite');
        }
    });

    document.body.addEventListener('mouseout', (event) => {
        const button = event.target.closest('.btn-favorite');
        if (button && button.dataset.isFavorited === 'false') {
            button.querySelector('.favorite-icon')?.replaceChildren('favorite_border');
        }
    });

    document.body.addEventListener('htmx:afterSwap', (event) => {
        initializeFavoriteButtons(event.detail.target || document);
    });
})();