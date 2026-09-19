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
      cor: item.cor ? String(item.cor).trim() : '',
      tamanho: item.tamanho ? String(item.tamanho).trim() : ''
    };
  });

  const productIds = normalizedItems.map((item) => item.id);
  const selectedProducts = await productControllers.getProductsByIds(productIds);

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

  const productMap = new Map(selectedProducts.map((p) => [p._id.toString(), p]));

  return normalizedItems.map((cartItem) => {
    const product = productMap.get(cartItem.id);
    
    // Busca a variação correspondente por cor e tamanho para obter o preço correto
    const variation = product.variacoes?.find((v) => {
      const matchColor = !cartItem.cor || v.cores?.map(c => c.trim()).includes(cartItem.cor);
      const matchSize = !cartItem.tamanho || v.tamanhos?.map(s => String(s).trim()).includes(cartItem.tamanho);
      return matchColor && matchSize;
    });

    const preco = variation ? variation.preco : (product.preco || product.variacoes?.[0]?.preco || 0);
    
    // Otimização: Lógica de seleção de imagem consolidada
    const imagem = variation?.imagens?.[0] 
                || product.variacoes?.find(v => v.imagens?.length > 0)?.imagens?.[0]
                || 'default-product.png';

    return {
      id: product._id,
      nome: product.nome,
      preco: preco,
      imagem: imagem,
      quantidade: cartItem.quantity,
      garantia: product.garantia || null,
      cor: cartItem.cor,
      tamanho: cartItem.tamanho
    };
  });
};