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
