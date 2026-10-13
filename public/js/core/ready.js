/**
 * Utilitário global: executa `fn` quando o DOM está pronto.
 * Funciona tanto no carregamento completo quanto em navegações HTMX (hx-boost),
 * onde DOMContentLoaded não é disparado novamente.
 */
window.onPageReady = function onPageReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
};

/**
 * Marca <html class="icons-ready"> quando a fonte Material Icons carregou
 * (ou após 3s, para nunca deixar os ícones invisíveis se a CDN falhar).
 * Combina com o CSS que reserva o espaço dos ícones no carregamento inicial.
 */
(function markIconsReady() {
  const root = document.documentElement;
  const done = () => root.classList.add('icons-ready');
  const timer = window.setTimeout(done, 3000);

  if (document.fonts && document.fonts.load) {
    document.fonts.load('24px "Material Icons"').then(() => {
      window.clearTimeout(timer);
      done();
    }, done);
  }
})();
