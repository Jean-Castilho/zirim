function showNotification(message, type = 'success') {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerText = message;

    container.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300); 
    }, 3000);
}


function addToFavorites(productId) {
    let favorites = JSON.parse(localStorage.getItem('favorites')) || [];

    if (favorites.includes(productId)) {

        showNotification('Este produto já está nos seus favoritos!', 'info');

        

        return;
    }

    favorites.push(productId);
    localStorage.setItem('favorites', JSON.stringify(favorites));

    showNotification('Produto adicionado aos favoritos!', 'success');
    // Você pode querer atualizar o ícone de favorito na UI aqui
    // Por exemplo, mudar de 'favorite_border' para 'favorite'
}
