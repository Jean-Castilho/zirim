function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge || !window.CartStorage) return;

  const totalItems = window.CartStorage.count();

  if (totalItems > 0) {
    badge.innerText = totalItems > 99 ? '99+' : totalItems;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', updateCartBadge);
window.addEventListener('cartUpdated', updateCartBadge);
// Atualiza já (o script pode rodar depois do DOM estar pronto)
updateCartBadge();

const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');
const navOverlay = document.querySelector('.nav-overlay');

if (hamburger && navMenu && navOverlay) {
  const setMenuOpen = (isOpen) => {
    hamburger.classList.toggle('active', isOpen);
    navMenu.classList.toggle('active', isOpen);
    navOverlay.classList.toggle('active', isOpen);
    document.body.classList.toggle('no-scroll', isOpen);
    hamburger.setAttribute('aria-expanded', String(isOpen));
  };

  hamburger.addEventListener('click', () => {
    setMenuOpen(!navMenu.classList.contains('active'));
  });

  hamburger.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setMenuOpen(!navMenu.classList.contains('active'));
    }
  });

  navOverlay.addEventListener('click', () => setMenuOpen(false));

  // Fecha o menu ao escolher um link (a navegação via hx-boost troca só o conteúdo)
  navMenu.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenuOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenuOpen(false);
  });
}
