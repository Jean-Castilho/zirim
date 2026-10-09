(() => {
  const getFavoriteIds = () => {
    try {
      const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      return Array.isArray(favorites) ? favorites.map(String) : [];
    } catch {
      return [];
    }
  };

  const createEmptyState = (message) => {
    const state = document.createElement('div');
    state.className = 'empty-state';

    const icon = document.createElement('i');
    icon.className = 'material-icons';
    icon.textContent = 'favorite_border';

    const text = document.createElement('p');
    text.textContent = message;
    state.append(icon, text);
    return state;
  };

  const createProductCard = (product) => {
    const productId = String(product._id);
    const name = product.nome || 'Produto';
    const imageName = product.variacoes?.[0]?.imagens?.[0];

    const card = document.createElement('div');
    card.className = 'product-card';

    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'product-image-wrapper';

    const image = document.createElement('img');
    image.src = imageName ? `/image/${imageName}` : 'https://via.placeholder.com/400x400';
    image.alt = name;

    const favoriteButton = document.createElement('button');
    favoriteButton.type = 'button';
    favoriteButton.className = 'btn-favorite';
    favoriteButton.dataset.productId = productId;
    favoriteButton.dataset.isFavorited = 'true';
    favoriteButton.title = 'Remover dos favoritos';

    const favoriteIcon = document.createElement('i');
    favoriteIcon.className = 'material-icons favorite-icon';
    favoriteIcon.textContent = 'favorite';
    favoriteButton.append(favoriteIcon);
    imageWrapper.append(image, favoriteButton);

    const details = document.createElement('div');
    details.className = 'product-details';

    const category = document.createElement('span');
    category.className = 'product-category';
    category.textContent = product.categoria || 'Geral';

    const title = document.createElement('h3');
    title.className = 'product-title';
    title.textContent = name;

    const link = document.createElement('a');
    link.className = 'btn-view-details';
    link.href = `/product/${encodeURIComponent(productId)}`;
    link.textContent = 'Ver Detalhes';

    details.append(category, title, link);
    card.append(imageWrapper, details);
    return card;
  };

  const loadFavoriteProducts = async (page) => {
    const grid = page.querySelector('.products-grid');
    if (!grid || grid.dataset.loading === 'true') return;
    grid.dataset.loading = 'true';

    try {
      const ids = getFavoriteIds();
      if (ids.length === 0) {
        grid.replaceChildren(createEmptyState('Você ainda não possui produtos favoritos.'));
        return;
      }

      const response = await fetch('/products/projectionByIds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids,
          projection: { nome: 1, categoria: 1, 'variacoes.imagens': { $slice: 1 } }
        })
      });
      if (!response.ok) throw new Error(`Status HTTP: ${response.status}`);

      const products = await response.json();
      if (!Array.isArray(products) || products.length === 0) {
        grid.replaceChildren(createEmptyState('Nenhum produto encontrado.'));
        return;
      }

      grid.replaceChildren(...products.map(createProductCard));
    } catch (error) {
      console.error('Erro ao carregar produtos favoritos:', error);
      grid.replaceChildren(createEmptyState('Não foi possível carregar os produtos favoritos.'));
    } finally {
      grid.dataset.loading = 'false';
    }
  };

  const initializeFavoritesPage = (root = document) => {
    const pages = root.matches?.('.favorites-container')
      ? [root]
      : root.querySelectorAll('.favorites-container');
    pages.forEach(page => loadFavoriteProducts(page));
  };

  if (!document.body.dataset.favoritesPageInitialized) {
    document.body.dataset.favoritesPageInitialized = 'true';
    document.body.addEventListener('htmx:afterSwap', event => {
      initializeFavoritesPage(event.detail.target || document);
    });
    window.addEventListener('favoritesUpdated', () => initializeFavoritesPage());
  }

  initializeFavoritesPage();
})();