/**
 * Script da página admin/dashboard.ejs.
 * Os dados chegam renderizados pelo servidor no carregamento da página; este script só cria os ícones.
 */
(() => {
  // Em navegações htmx, o script do lucide pode ainda não ter carregado quando este arquivo roda.
  const renderIcons = () => window.lucide?.createIcons();

  if (window.lucide) {
    renderIcons();
    return;
  }

  const lucideScript = document.querySelector('#main-content script[src*="lucide"]');
  lucideScript?.addEventListener('load', renderIcons, { once: true });
})();
