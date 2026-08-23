import { ObjectId } from "mongodb";
import ProductControllers from "../controllers/productControllers.js";

const productControllers = new ProductControllers();

export const validateCartItems = async (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("O carrinho está vazio ou os itens não foram enviados corretamente.");
  }

  const normalizedItems = items.map((item) => {
    if (!item?.id) {
      throw new Error("Cada item do carrinho precisa ter um identificador válido.");
    }

    const quantity = Number(item.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`A quantidade do produto ${item.id} é inválida.`);
    }

    return {
      ...item,
      id: String(item.id),
      quantity,
    };
  });

  const productIds = normalizedItems.map((item) => new ObjectId(item.id));
  const selectedProducts = await productControllers
    .getCollection()
    .find({ _id: { $in: productIds } })
    .toArray();

  if (!Array.isArray(selectedProducts)) {
    throw new Error("Não foi possível validar os produtos do carrinho via API.");
  }

  const foundIds = new Set(selectedProducts.map((product) => product._id.toString()));
  const notFound = normalizedItems
    .filter((item) => !foundIds.has(item.id))
    .map((item) => item.id);

  if (notFound.length > 0) {
    throw new Error(`Os seguintes produtos não foram encontrados: ${notFound.join(", ")}`);
  }

  return selectedProducts.map((product) => {
    const cartItem = normalizedItems.find(
      (item) => item.id === product._id.toString(),
    );

    return {
      id: product._id,
      nome: product.nome,
      preco: product.preco,
      quantidade: cartItem ? cartItem.quantity : 0,
      garantia: product.garantia,
      imagens: product.imagens,
    };
  });
};

export const validateOrderItems = validateCartItems;