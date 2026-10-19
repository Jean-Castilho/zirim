/**
 * Pedidos de clientes não cadastrados (convidados), guardados no navegador.
 *
 * O pedido também fica preso à sessão do servidor (guestOrderIds), mas a sessão
 * pode expirar ou o cookie pode ser apagado. Esta cópia local garante que o
 * cliente continue vendo o que comprou. Cada entrada é um "instantâneo" do
 * pedido no momento da compra; o status atual continua na página de checkout.
 */
(() => {
  const STORAGE_KEY = 'guest_orders';
  const MAX_ORDERS = 50;

  const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  const read = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(stored) ? stored.filter(item => isObject(item) && item.orderId) : [];
    } catch {
      return [];
    }
  };

  const write = (orders) => {
    const list = Array.isArray(orders) ? orders.slice(0, MAX_ORDERS) : [];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (error) {
      // Armazenamento cheio ou bloqueado (modo privado): a página segue funcionando sem a cópia local.
      console.warn('Não foi possível salvar o pedido no navegador.', error);
    }
    return list;
  };

  /** Adiciona (ou substitui, pelo mesmo orderId) um pedido no topo da lista. */
  const add = (order) => {
    if (!isObject(order) || !order.orderId) return read();
    const remaining = read().filter(item => item.orderId !== order.orderId);
    return write([order, ...remaining]);
  };

  const get = (orderId) => read().find(item => item.orderId === String(orderId)) || null;

  const remove = (orderId) => write(read().filter(item => item.orderId !== String(orderId)));

  /** Guarda o último status consultado no servidor (a lista mostra esse valor). Mantém a ordem da lista. */
  const setStatus = (orderId, status) => {
    const id = String(orderId);
    const updated = read().map(item => (item.orderId === id
      ? { ...item, lastStatus: String(status), lastStatusAt: new Date().toISOString() }
      : item));
    return write(updated);
  };

  const count = () => read().length;

  window.GuestOrders = Object.freeze({ read, add, get, remove, setStatus, count });
})();
