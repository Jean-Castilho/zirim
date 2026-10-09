(() => {
  const read = () => {
    try {
      const cart = JSON.parse(localStorage.getItem('cart') || '[]');
      return Array.isArray(cart)
        ? cart.filter(item => item && typeof item === 'object' && !Array.isArray(item))
        : [];
    } catch {
      return [];
    }
  };

  const write = (cart) => {
    const items = Array.isArray(cart) ? cart : [];
    localStorage.setItem('cart', JSON.stringify(items));
    return items;
  };

  const count = () => read().reduce(
    (total, item) => total + (Number(item?.quantidade ?? item?.quantity) || 0),
    0
  );

  window.CartStorage = Object.freeze({ read, write, count });
})();