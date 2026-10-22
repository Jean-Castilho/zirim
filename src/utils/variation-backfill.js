import { ObjectId } from "mongodb";
import { ensureVariationIds } from "./variation-match.js";

/**
 * Dá um `_id` estável às variações de produtos cadastrados antes dessa versão.
 * Roda na inicialização, antes de qualquer pedido ser processado. Idempotente.
 * Retorna quantos produtos foram atualizados.
 */
export const backfillVariationIds = async (collection) => {
  const cursor = collection.find(
    { variacoes: { $elemMatch: { _id: { $exists: false } } } },
    { projection: { variacoes: 1 } },
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
    const { variacoes, changed } = ensureVariationIds(product.variacoes, () => new ObjectId());
    if (!changed) continue;

    batch.push({
      updateOne: {
        filter: { _id: product._id },
        update: { $set: { variacoes } },
      },
    });
    if (batch.length === 500) await flush();
  }
  await flush();
  return total;
};
