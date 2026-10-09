function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;

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

const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');
const navOverlay = document.querySelector('.nav-overlay');

if (hamburger && navMenu && navOverlay) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMenu.classList.toggle('active');
    navOverlay.classList.toggle('active');
    document.body.classList.toggle('no-scroll');
  });

  navOverlay.addEventListener('click', () => {
    hamburger.classList.remove('active');
    navMenu.classList.remove('active');
    navOverlay.classList.remove('active');
    document.body.classList.remove('no-scroll');
  });
}
