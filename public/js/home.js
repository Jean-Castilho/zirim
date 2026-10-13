(() => {
  const preloadImageWithFetch = async (img) => {
    const src = img.getAttribute('data-src');
    if (!src || img.dataset.loading) return;
    img.dataset.loading = 'true';

    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`Status HTTP: ${response.status}`);

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      img.onload = () => {
        img.classList.remove('skeleton-loader');
        img.classList.add('loaded');
      };
      img.src = objectUrl;

      if (img.complete) {
        img.classList.remove('skeleton-loader');
        img.classList.add('loaded');
      }
    } catch (error) {
      console.warn('Falha no pré-carregamento com fetch. Aplicando fallback direto:', error);
      img.src = src;
      img.classList.remove('skeleton-loader');
      img.classList.add('loaded');
    }
  };

  const preloadBgWithFetch = async (el) => {
    const src = el.getAttribute('data-bg');
    if (!src || el.dataset.loading) return;
    el.dataset.loading = 'true';

    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`Status HTTP: ${response.status}`);

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const tempImg = new Image();
      tempImg.onload = () => {
        el.style.backgroundImage = `url('${objectUrl}')`;
        el.classList.remove('skeleton-loader');
        el.classList.add('loaded');
      };
      tempImg.src = objectUrl;

      if (tempImg.complete) {
        el.style.backgroundImage = `url('${objectUrl}')`;
        el.classList.remove('skeleton-loader');
        el.classList.add('loaded');
      }
    } catch (error) {
      console.warn('Falha no pré-carregamento do hero banner. Aplicando fallback direto:', error);
      el.style.backgroundImage = `url('${src}')`;
      el.classList.remove('skeleton-loader');
      el.classList.add('loaded');
    }
  };

  const initPreload = () => {
    const targets = document.querySelectorAll(
      'img[data-src]:not([data-loading="true"]), [data-bg]:not([data-loading="true"])'
    );

    const processTarget = (el) => {
      if (el.tagName === 'IMG') {
        preloadImageWithFetch(el);
      } else {
        preloadBgWithFetch(el);
      }
    };

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            obs.unobserve(entry.target);
            processTarget(entry.target);
          }
        });
      }, { rootMargin: '100px 0px' });

      targets.forEach((target) => observer.observe(target));
    } else {
      targets.forEach(processTarget);
    }
  };

  window.onPageReady(initPreload);
})();