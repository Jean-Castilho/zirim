/**
 * Campos de produto que a API pública pode devolver.
 * Qualquer outro campo (custos, fornecedor, notas internas, texto de busca) fica de fora,
 * mesmo que o cliente peça na projeção.
 */
const PUBLIC_ROOT_FIELDS = new Set(["_id", "nome", "descricao", "categoria", "variacoes"]);
const PUBLIC_VARIATION_FIELDS = new Set(["_id", "preco", "estoque", "tamanhos", "cores", "imagens", "ativo"]);
const DEFAULT_PROJECTION = { nome: 1, categoria: 1, variacoes: 1 };

/**
 * Converte a projeção pedida pelo cliente numa projeção segura para o Mongo.
 * Atenção: o Mongo rejeita "variacoes" junto de "variacoes.<campo>" ("Path collision").
 * Por isso, se `variacoes` vier inteiro, os subcampos são descartados (o array já vem completo).
 */
export const toPublicProjection = (requested = {}) => {
  const safe = {};
  for (const [key, value] of Object.entries(requested || {})) {
    if (!value) continue; // só inclusões e $slice
    const [root, sub] = key.split(".");
    if (root === "variacoes") {
      if (!sub || PUBLIC_VARIATION_FIELDS.has(sub)) safe[key] = value;
    } else if (PUBLIC_ROOT_FIELDS.has(root) && !sub) {
      safe[key] = value;
    }
  }

  if (Object.keys(safe).length === 0) return { ...DEFAULT_PROJECTION };

  if (safe.variacoes) {
    for (const key of Object.keys(safe)) {
      if (key.startsWith("variacoes.")) delete safe[key];
    }
    return safe;
  }

  if (Object.keys(safe).some((k) => k.startsWith("variacoes."))) safe["variacoes.ativo"] = 1;
  return safe;
};

/** Remove, do documento já lido, qualquer campo fora da lista pública. */
export const sanitizePublicProduct = (product) => {
  if (!product) return product;
  const result = {};
  for (const [key, value] of Object.entries(product)) {
    if (!PUBLIC_ROOT_FIELDS.has(key)) continue;
    if (key === "variacoes" && Array.isArray(value)) {
      result.variacoes = value.map((variation) => Object.fromEntries(
        Object.entries(variation || {}).filter(([field]) => PUBLIC_VARIATION_FIELDS.has(field))
      ));
    } else {
      result[key] = value;
    }
  }
  return result;
};
