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

    const iconContainer = document.createElement('span');
    iconContainer.className = 'notification-icon';
    iconContainer.innerHTML = `<span class="material-icons" aria-hidden="true">${icon}</span>`;

    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    notification.appendChild(iconContainer);
    notification.appendChild(textSpan);

    container.appendChild(notification);

    // Trigger para animação de entrada
    requestAnimationFrame(() => {
        notification.classList.add('show');
    });

    // Remove após 3 segundos, com animação de saída
    setTimeout(() => {
        notification.classList.remove('show');
        notification.classList.add('leaving');

        const finishExit = () => notification.remove();
        notification.addEventListener('transitionend', finishExit, { once: true });

        window.setTimeout(finishExit, 300);
    }, 3000);
}

// Mantém as classes ativas do nav-menu atualizadas dinamicamente nas transições do HTMX
function updateActiveNavigation() {
    const currentPath = window.location.pathname;
    // Seleciona todos os links do menu principal e submenus de navegação
    const navLinks = document.querySelectorAll('header nav a, .nav-menu a, .filter-links a');

    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;

        // Verifica correspondência exata de rota ou sub-rotas (ex: /products)
        const isExactMatch = currentPath === href;
        const isSubRoute = href !== '/' && currentPath.startsWith(href);

        if (isExactMatch || isSubRoute) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

document.addEventListener('DOMContentLoaded', updateActiveNavigation);
document.body.addEventListener('htmx:afterSwap', updateActiveNavigation);

// ---------------------------------------------------------------------------
// Estilos das páginas trocadas pelo htmx (navegações hx-boost / hx-get).
// A resposta parcial traz o <link rel="stylesheet"> da página junto com o HTML.
// Se o conteúdo aparecer antes desse CSS, a página "pisca" sem estilo.
// Aqui, quando a troca traz folhas ainda não carregadas, a área trocada fica
// oculta até essas folhas carregarem (com timeout de segurança).
// O fluxo do htmx (histórico, eventos, processamento) não é alterado.
// ---------------------------------------------------------------------------
const STYLE_WAIT_TIMEOUT_MS = 3000;

// Folhas já presentes na carga inicial já foram carregadas (main.js roda no fim do <body>)
const loadedStylesheets = new Set(
    [...document.querySelectorAll('link[rel="stylesheet"]')].map(link => link.getAttribute('href'))
);

function waitForStylesheet(link) {
    return new Promise(resolve => {
        if (link.sheet) return resolve(true);
        link.addEventListener('load', () => resolve(true), { once: true });
        link.addEventListener('error', () => resolve(false), { once: true });
    });
}

document.body.addEventListener('htmx:afterSwap', (event) => {
    const target = event.detail?.target;
    if (!target || typeof target.querySelectorAll !== 'function') return;

    const pending = [...target.querySelectorAll('link[rel="stylesheet"]')]
        .filter(link => !loadedStylesheets.has(link.getAttribute('href')));
    if (pending.length === 0) return;

    // Esta tarefa ainda não pintou a tela: ocultar agora impede o flash sem estilo
    target.style.visibility = 'hidden';

    const timeout = new Promise(resolve => window.setTimeout(() => resolve(false), STYLE_WAIT_TIMEOUT_MS));

    Promise.race([Promise.all(pending.map(waitForStylesheet)), timeout]).then(() => {
        pending.forEach(link => {
            if (link.sheet) loadedStylesheets.add(link.getAttribute('href'));
        });
        target.style.visibility = '';
    });
});

// Erros de requisições htmx (hx-put/hx-delete/hx-post e navegações boostadas).
// O htmx não troca o conteúdo em respostas 4xx/5xx; sem este handler a falha ficava silenciosa.
// Registrado uma única vez (main.js não é recarregado nas navegações).
function getHtmxErrorMessage(xhr, fallback) {
    try {
        const data = JSON.parse(xhr?.responseText || '');
        return data.message || data.error || fallback;
    } catch {
        return fallback;
    }
}

document.body.addEventListener('htmx:responseError', (event) => {
    const message = getHtmxErrorMessage(event.detail?.xhr, 'Não foi possível concluir a ação. Tente novamente.');
    showNotification(message, 'error');
});

document.body.addEventListener('htmx:sendError', () => {
    showNotification('Sem conexão com o servidor. Verifique sua internet e tente novamente.', 'error');
});

// ---------------------------------------------------------------------------
// Comportamentos declarativos (substituem handlers inline on* nas Views).
// Delegação no document: funcionam com conteúdo trazido pelo HTMX.
// ---------------------------------------------------------------------------

// <a data-prevent-default>: impede navegação (links de pré-visualização)
document.addEventListener('click', (event) => {
    if (event.target.closest('[data-prevent-default]')) event.preventDefault();

    // <a data-focus-target="id">: foca o campo indicado
    const focusLink = event.target.closest('[data-focus-target]');
    if (focusLink) document.getElementById(focusLink.dataset.focusTarget)?.focus();
});

// <form data-confirm="mensagem">: pede confirmação antes de enviar
document.addEventListener('submit', (event) => {
    const message = event.target?.dataset?.confirm;
    if (message && !window.confirm(message)) event.preventDefault();
});

// <img data-fallback-src="url">: troca a imagem quebrada (uma única vez)
document.addEventListener('error', (event) => {
    const img = event.target;
    if (img?.tagName !== 'IMG' || !img.dataset.fallbackSrc || img.dataset.fallbackApplied) return;
    img.dataset.fallbackApplied = 'true';
    img.src = img.dataset.fallbackSrc;
}, true);
