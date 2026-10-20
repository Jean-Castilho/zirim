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
// Estilo primeiro, conteúdo imediato (navegações hx-boost / hx-get).
// Antes de trocar a área, carregamos as folhas de estilo da página nova.
// Quando estão prontas, a troca acontece de uma vez: o HTML já aparece
// estilizado, na posição final, sem ser ocultado e sem expandir depois.
// Folhas de páginas anteriores são removidas na troca seguinte.
// ---------------------------------------------------------------------------
const STYLE_WAIT_SAFETY_MS = 3000;
const PAGE_STYLE_RE = /<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi;

function ensurePageStyle(href) {
    const existing = [...document.head.querySelectorAll('link[data-page-css]')]
        .find(link => link.getAttribute('href') === href);
    if (existing && existing.sheet) return Promise.resolve();

    return new Promise(resolve => {
        const link = existing || document.createElement('link');
        if (!existing) {
            link.rel = 'stylesheet';
            link.href = href;
            link.dataset.pageCss = 'true';
            document.head.appendChild(link);
        }
        link.addEventListener('load', () => resolve(), { once: true });
        link.addEventListener('error', () => resolve(), { once: true });
    });
}

function syncPageStyles(hrefs) {
    document.head.querySelectorAll('link[data-page-css]').forEach(link => {
        if (!hrefs.includes(link.getAttribute('href'))) link.remove();
    });
}

const styleReady = new WeakSet();

document.body.addEventListener('htmx:beforeSwap', (event) => {
    const detail = event.detail;
    if (!detail?.target || typeof detail.serverResponse !== 'string' || detail.isError) return;
    if (styleReady.has(detail)) return;
    if (detail.requestConfig?.verb !== 'get') return;

    const hrefs = [...detail.serverResponse.matchAll(PAGE_STYLE_RE)]
        .map(match => match[0].match(/href=["']([^"']+)["']/i)?.[1])
        .filter(Boolean);
    if (hrefs.length === 0) {
        syncPageStyles([]);
        return;
    }

    // Segura a troca padrão do htmx e faz a troca manualmente quando o CSS estiver pronto
    detail.shouldSwap = false;
    styleReady.add(detail);

    const content = detail.serverResponse.replace(PAGE_STYLE_RE, '');
    const target = detail.target;
    const isRestore = detail.requestConfig?.headers?.['HX-History-Restore-Request'];
    const finalPath = detail.pathInfo?.finalRequestPath || detail.requestConfig?.path;

    const safety = new Promise(resolve => window.setTimeout(resolve, STYLE_WAIT_SAFETY_MS));
    Promise.race([Promise.all(hrefs.map(ensurePageStyle)), safety]).then(() => {
        syncPageStyles(hrefs);
        hrefs.forEach(href => {
            if (!document.head.querySelector(`link[data-page-css][href="${href}"]`)) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href;
                link.dataset.pageCss = 'true';
                document.head.appendChild(link);
            }
        });

        const title = new DOMParser().parseFromString(detail.serverResponse, 'text/html').querySelector('title');
        if (title) document.title = title.textContent;

        if (!isRestore && finalPath && window.location.pathname !== finalPath) {
            window.history.pushState({ htmx: true }, '', finalPath);
        }

        window.htmx.swap(target, content, { swapStyle: 'innerHTML' });
        updateActiveNavigation();
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

// <form data-confirm="mensagem">: pede confirmação (diálogo do sistema) antes de enviar
document.addEventListener('submit', (event) => {
    const form = event.target;
    const message = form?.dataset?.confirm;
    if (!message || form.dataset.confirmed === 'true') return;
    event.preventDefault();
    window.zirimDialog.confirm(message, { tone: 'danger' }).then((ok) => {
        if (!ok) return;
        form.dataset.confirmed = 'true';
        form.requestSubmit();
        delete form.dataset.confirmed;
    });
});

// hx-confirm="mensagem" (HTMX): mesmo diálogo do sistema
document.addEventListener('htmx:confirm', (event) => {
    const question = event.detail?.question;
    if (!question) return;
    event.preventDefault();
    window.zirimDialog.confirm(question, { tone: 'danger' }).then((ok) => {
        if (ok) event.detail.issueRequest(true);
    });
});

// <img data-fallback-src="url">: troca a imagem quebrada (uma única vez)
document.addEventListener('error', (event) => {
    const img = event.target;
    if (img?.tagName !== 'IMG' || !img.dataset.fallbackSrc || img.dataset.fallbackApplied) return;
    img.dataset.fallbackApplied = 'true';
    img.src = img.dataset.fallbackSrc;
}, true);
