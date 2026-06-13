import { ObjectId } from "mongodb";
import ProductControllers from "../controllers/productControllers.js";

const productControllers = new ProductControllers();

export const validateOrderItems = async (items) => {
  const productIds = items.map(item => new ObjectId(item.id));
  const productsSelec = await productControllers.getCollection().find({ _id: { $in: productIds } }).toArray();

  if (!productsSelec) {
    throw new Error('Não foi possível validar os produtos do carrinho via API.');
  };

  const foundIds = productsSelec.map(p => p._id.toString());
  const notFound = foundIds.filter(id => !foundIds.includes(id));

  if (notFound.length > 0) {
    throw new Error(`Os seguintes produtos não foram encontrados: ${notFound.join(', ')}`);
  };

  const itemsResumidos = productsSelec.map(item => {
    const cartItem = items.find(cartItem => cartItem.id === item._id.toString());
    return {
      id: item._id,
      nome: item.nome,
      preco: item.preco,
      quantidade: cartItem ? cartItem.quantity : 0,
      garantia: item.garantia,
      imagens: item.imagens,
    };
  });

  return itemsResumidos;
};