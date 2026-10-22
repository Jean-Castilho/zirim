/**
 * Funções puras sobre variações de produto (sem acesso ao banco).
 * Mantidas separadas do repository para poderem ser testadas isoladamente.
 */

/**
 * Variações ativas que correspondem a um item de pedido ANTIGO, que não guarda `variacaoId`.
 * Critério: SKU quando o item tem SKU; senão, cor e tamanho (quando informados).
 * O chamador deve exigir exatamente uma correspondência; zero ou mais de uma é ambíguo.
 */
export const findLegacyVariations = (variacoes = [], item = {}) =>
  (Array.isArray(variacoes) ? variacoes : []).filter((variation) => {
    if (!variation || variation.ativo === false) return false;
    if (item.sku) return variation.sku === item.sku;

    const colorMatches = !item.cor || (variation.cores || []).includes(item.cor);
    const sizeMatches = !item.tamanho
      || (variation.tamanhos || []).map(String).includes(String(item.tamanho));
    return colorMatches && sizeMatches;
  });

/**
 * Garante um `_id` estável em cada variação. Variações que já têm `_id` são mantidas.
 * `newId` gera o identificador (ex.: `() => new ObjectId()`).
 * Retorna { variacoes, changed }.
 */
export const ensureVariationIds = (variacoes = [], newId) => {
  let changed = false;
  const result = (Array.isArray(variacoes) ? variacoes : []).map((variation) => {
    if (variation?._id) return variation;
    changed = true;
    return { _id: newId(), ...variation };
  });
  return { variacoes: result, changed };
};
