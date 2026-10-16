/**
 * Texto de busca normalizado de cada produto.
 *
 * Um campo único, em minúsculas e sem acentos, é gravado no produto ao salvar.
 * A busca usa substring em cada termo digitado, então funciona com palavras incompletas
 * ("tên" encontra "tênis") e ignora acentuação ("calcado" encontra "calçado").
 */

const MAX_TERMS = 5;

export const normalizeSearchText = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Só variações ativas entram no texto: cor/SKU de variação oculta não deve aparecer na busca. */
export const buildSearchText = (product = {}) => {
  const variacoes = Array.isArray(product.variacoes) ? product.variacoes : [];
  const activeVariations = variacoes.filter((v) => v?.ativo !== false);
  const parts = [
    product.nome,
    product.categoria,
    product.descricao,
    ...activeVariations.flatMap((v) => [v.sku, ...(v.cores || []), ...(v.tamanhos || []).map(String)]),
  ];
  return normalizeSearchText(parts.filter(Boolean).join(' | '));
};

/** Termos da busca já normalizados e escapados para uso em regex. */
export const parseSearchTerms = (query) => normalizeSearchText(query)
  .split(' ')
  .filter(Boolean)
  .slice(0, MAX_TERMS)
  .map(escapeRegex);

/** Preenche `searchText` nos produtos que ainda não têm o campo (migração na inicialização). */
export const backfillProductSearchText = async (collection) => {
  const cursor = collection.find(
    { searchText: { $exists: false } },
    { projection: { nome: 1, categoria: 1, descricao: 1, 'variacoes.cores': 1, 'variacoes.tamanhos': 1, 'variacoes.sku': 1, 'variacoes.ativo': 1 } },
  );

  let batch = [];
  let total = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    await collection.bulkWrite(batch, { ordered: false });
    total += batch.length;
    batch = [];
  };

  for await (const product of cursor) {
    batch.push({
      updateOne: {
        filter: { _id: product._id },
        update: { $set: { searchText: buildSearchText(product) } },
      },
    });
    if (batch.length === 500) await flush();
  }
  await flush();
  return total;
};
