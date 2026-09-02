function showNotification(message, type = 'success') {
    let container = document.getElementById('notification-container');
    
    // Cria o container dinamicamente se não existir
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        document.body.appendChild(container);
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    // Define o ícone baseado no tipo
    let icon = 'info';
    if (type === 'success') icon = 'check_circle';
    if (type === 'error') icon = 'error';
    if (type === 'warning') icon = 'warning';

        //<i class="material-icons">${icon}</i>
    notification.innerHTML = `
        <span>${message}</span>
    `;

    container.appendChild(notification);

    // Trigger para animação de entrada
    requestAnimationFrame(() => {
        notification.classList.add('show');
    });

    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        // Aguarda a transição terminar para remover do DOM
        notification.addEventListener('transitionend', () => {
            notification.remove();
        }, { once: true });
    }, 3000);
}
