import { ObjectId } from "mongodb";
import ProductRepository from "../repository/ProductRepository.js";
import OrderRepository from "../repository/OrderRepository.js";
import { ValidationError } from "../utils/handleResponse.js";

const productRepository = new ProductRepository();
const orderRepository = new OrderRepository();

export const validateCartItems = async (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("O carrinho está vazio ou os itens não foram enviados corretamente.");
  }

  const normalizedItems = items.map((item) => {
    if (!item?.id) {
      throw new Error("Cada item do carrinho precisa ter um identificador válido.");
    }

    const quantity = Number(item.quantity ?? 0);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
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

  const groupedItems = new Map();
  for (const item of normalizedItems) {
    const key = JSON.stringify([item.id, item.cor, item.tamanho]);
    const existing = groupedItems.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      if (!Number.isSafeInteger(existing.quantity)) {
        throw new ValidationError(`A quantidade do produto ${item.id} excede o limite permitido.`);
      }
    } else {
      groupedItems.set(key, { ...item });
    }
  }
  const consolidatedItems = [...groupedItems.values()];

  const productIds = consolidatedItems.map((item) => item.id);
  const validObjectIds = productIds
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));

  const selectedProducts = await productRepository.findAll({
    _id: { $in: validObjectIds }
  });

  if (!Array.isArray(selectedProducts)) {
    throw new Error("Não foi possível validar os produtos do carrinho via API.");
  }

  const foundIds = new Set(selectedProducts.map((product) => product._id.toString()));
  const notFound = consolidatedItems
    .filter((item) => !foundIds.has(item.id))
    .map((item) => item.id);

  if (notFound.length > 0) {
    throw new Error(`Os seguintes produtos não foram encontrados: ${notFound.join(", ")}`);
  }

  const productMap = new Map(selectedProducts.map((p) => [p._id.toString(), p]));

  return consolidatedItems.map((cartItem) => {
    const product = productMap.get(cartItem.id);
    
    // Busca a variação correspondente por cor e tamanho para obter o preço correto
    const variation = product.variacoes?.find((v) => {
      const matchColor = !cartItem.cor || (v.cores && v.cores.some(c => c.trim() === cartItem.cor));
      const matchSize = !cartItem.tamanho || (v.tamanhos && v.tamanhos.some(s => String(s).trim() === cartItem.tamanho));
      return matchColor && matchSize;
    });

    if (!variation) {
      throw new ValidationError(`Variação do produto ${product.nome} (Cor: ${cartItem.cor || 'N/A'}, Tamanho: ${cartItem.tamanho || 'N/A'}) não encontrada.`);
    }

    if (variation.estoque < cartItem.quantity) {
      throw new ValidationError(`Estoque insuficiente para o produto ${product.nome} (Cor: ${cartItem.cor || 'N/A'}, Tamanho: ${cartItem.tamanho || 'N/A'}). Disponível: ${variation.estoque}, Solicitado: ${cartItem.quantity}.`);
    }

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
      tamanho: cartItem.tamanho,
      sku: variation?.sku || null
    };
  });
};

export const processCreateOrder = async (user, orderData) => {
  if (!user?._id) {
    throw new ValidationError("Dados do comprador inválidos.");
  }

  const validatedItems = await validateCartItems(orderData.items);
  const itemsTotal = validatedItems.reduce((acc, item) => acc + item.preco * Number(item.quantidade), 0);

  const addressData = orderData.address || {};
  const shippingData = orderData.shipping || {};
  const shippingMethod = String(shippingData.method || "padrao");
  const shippingPrices = { padrao: 0, expresso: 14.9 };
  if (!Object.hasOwn(shippingPrices, shippingMethod)) {
    throw new ValidationError("Método de entrega inválido.");
  }
  const validShippingCost = shippingPrices[shippingMethod];
  const totalPrice = itemsTotal + validShippingCost;

  const payloadOrder = {
    user: {
      _id: user._id,
      name: user.name || "Cliente Zirim",
      phone: user.phone?.number || user.phone || "Não informado",
      email: user.email?.endereco || user.email || ""
    },
    items: validatedItems,
    address: {
      cep: addressData.cep || "",
      street: addressData.street || "",
      neighborhood: addressData.neighborhood || "",
      city: addressData.city || "",
      state: addressData.state || "",
      complement: addressData.complement || ""
    },
    location: {
      lat: Number(addressData.lat || -23.5505),
      lng: Number(addressData.lng || -46.6333)
    },
    shipping: {
      method: shippingMethod,
      cost: validShippingCost
    },
    subtotal: itemsTotal,
    total: totalPrice,
    statusInterno: "pendente",
    createdAt: new Date(),
    stateVersion: 0,
    inventoryProcessed: false,
    payment: {}
  };

  const orderId = await orderRepository.create(payloadOrder);

  const paymentResult = await orderRepository.gerarPix(totalPrice, user);
  if (paymentResult.error) {
    await orderRepository.updateOrderPayment(orderId, paymentResult, "pagamento_falhou");
    throw new ValidationError(`Erro ao gerar PIX: ${paymentResult.error}`);
  }

  await orderRepository.updateOrderPayment(
    orderId,
    paymentResult,
    orderRepository.mapStatus(paymentResult.status)
  );

  return { orderId: orderId.toString() };
};