/**
 * Visões de pedido para o fluxo de entrega.
 *
 * Regra de dados:
 * - Antes do aceite, o entregador recebe código curto, bairro e posição aproximada (~1 km).
 *   Nome, telefone, endereço completo, posição exata e PIN não saem.
 * - Depois do aceite, só o entregador dono do pedido recebe nome, telefone e endereço.
 * - PIN, e-mail e CPF nunca saem nestas visões.
 */

export const shortId = (id) => (id ? String(id).slice(-6).toUpperCase() : "------");

const PHONE_PLACEHOLDERS = new Set(["", "não informado", "nao informado"]);

/**
 * Telefone do cliente para o entregador. Texto de preenchimento ("Não informado") vira null,
 * e o número sai só com dígitos e "+", pronto para o link tel:.
 */
const phoneOf = (phone) => {
  const raw = (typeof phone === "object" ? phone?.number : phone);
  const text = typeof raw === "string" ? raw.trim() : "";
  if (PHONE_PLACEHOLDERS.has(text.toLowerCase())) return null;
  const digits = text.replace(/[^\d+]/g, "");
  return digits.replace(/(?!^)\+/g, "") || null;
};

const locationOf = (order) => {
  const lat = Number(order.location?.lat);
  const lng = Number(order.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

const addressOf = (address = {}) => ({
  street: address.street || null,
  number: address.number || null,
  complement: address.complement || null,
  neighborhood: address.neighborhood || null,
  cep: address.cep || null,
});

/** Itens para separação e conferência: sem preço e sem dados de pagamento. */
const itemsOf = (order) => (order.items || []).map((item) => ({
  nome: item.nome || "Produto",
  cor: item.cor || null,
  tamanho: item.tamanho || null,
  sku: item.sku || null,
  quantidade: Number(item.quantidade) || 0,
  imagem: item.imagem || null,
}));

const isAssignedTo = (order, courierId) =>
  Boolean(order.delivery?.courierId) && String(order.delivery.courierId) === String(courierId);

const isUnassigned = (order) => !order.delivery?.courierId;

/** Pedido pronto e ainda sem entregador: o que pode aparecer antes do aceite. */
export const toAvailableView = (order) => ({
  _id: String(order._id),
  shortId: shortId(order._id),
  status: order.statusInterno || "preparado",
  neighborhood: order.address?.neighborhood || null,
  createdAt: order.createdAt || null,
});

/** Pedido aceito: dados completos para quem está com ele (e para o admin). */
export const toAssignedView = (order) => ({
  _id: String(order._id),
  shortId: shortId(order._id),
  status: order.statusInterno || "em_rota",
  startedAt: order.delivery?.startedAt || null,
  courierName: order.delivery?.courierName || null,
  client: {
    name: order.user?.name || "Cliente",
    phone: phoneOf(order.user?.phone),
  },
  address: addressOf(order.address),
  location: locationOf(order),
  items: itemsOf(order),
  redacted: false,
});

/**
 * Painel de preparo (admin): itens para separar, sem preço e sem dados de pagamento.
 * Mostra o nome do cliente só para identificar o pacote na separação.
 */
export const toPreparationView = (order) => ({
  _id: String(order._id),
  shortId: shortId(order._id),
  createdAt: order.createdAt || null,
  customer: order.user?.name || "Cliente",
  items: itemsOf(order),
});

/** Entrega concluída do próprio entregador. */
export const toHistoryView = (order) => ({
  _id: String(order._id),
  shortId: shortId(order._id),
  client: { name: order.user?.name || "Cliente" },
  neighborhood: order.address?.neighborhood || null,
  deliveredAt: order.delivery?.deliveredAt || null,
});

/**
 * Visão do mapa para o viewer:
 * - admin: todos os pedidos ativos, com dados completos (sem PIN).
 * - entregador: pedidos disponíveis (sem dados pessoais) e os próprios pedidos aceitos.
 * Pedidos de outro entregador são descartados (retorna null).
 */
export const toMapView = (order, viewer) => {
  if (viewer?.role === "admin") return toAssignedView(order);

  if (isAssignedTo(order, viewer?._id)) return toAssignedView(order);

  // Antes do aceite, só posição aproximada (2 casas decimais, ~1 km): a casa exata não sai.
  if (isUnassigned(order) && order.statusInterno === "preparado") {
    const exact = locationOf(order);
    const approx = exact && {
      lat: Math.round(exact.lat * 100) / 100,
      lng: Math.round(exact.lng * 100) / 100,
    };
    return {
      ...toAvailableView(order),
      location: approx,
      approximateLocation: true,
      redacted: true,
    };
  }

  return null;
};
