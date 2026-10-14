/**
 * Visibilidade de variações na loja.
 *
 * Regra: uma variação é vendável enquanto `ativo !== false`. Documentos antigos sem o campo
 * continuam visíveis; o checkbox "Ativo" do formulário grava sempre true/false.
 */

/** Variação ativa (ou sem o campo, por compatibilidade com documentos antigos). */
export const isVariationActive = (variation) => variation?.ativo !== false;

/** Filtro Mongo: produtos com pelo menos uma variação ativa. */
export const ACTIVE_VARIATION_QUERY = { variacoes: { $elemMatch: { ativo: { $ne: false } } } };

/**
 * Prepara um produto para a loja: mantém só as variações ativas.
 * Retorna null quando não sobra nenhuma (produto oculto).
 * Se o campo `variacoes` não veio na projeção, o produto é devolvido sem alteração.
 */
export const toStorefrontProduct = (product) => {
  if (!product || !Array.isArray(product.variacoes)) return product ?? null;
  const variacoes = product.variacoes.filter(isVariationActive);
  return variacoes.length > 0 ? { ...product, variacoes } : null;
};

export const toStorefrontProducts = (products = []) =>
  products.map(toStorefrontProduct).filter(Boolean);
