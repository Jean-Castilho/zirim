import { MercadoPagoConfig, Payment } from "mercadopago";
import crypto from "crypto";
import { ExternalServiceError, UnauthorizedError } from "../../utils/errors.js";

const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN });
const paymentClient = new Payment(client);

const PIX_LIFETIME_MINUTES = 60;

/**
 * Integração com o Mercado Pago. Única camada que conhece o SDK.
 * Falhas viram ExternalServiceError.
 */
export const createPixPayment = async ({ amount, payer }) => {
  const expirationDate = new Date(Date.now() + PIX_LIFETIME_MINUTES * 60 * 1000);
  const [firstName, ...lastNameParts] = (payer.name || "Cliente").split(" ");

  const body = {
    transaction_amount: parseFloat(parseFloat(amount).toFixed(2)),
    description: "Pagamento PIX - Zirim Store",
    payment_method_id: "pix",
    notification_url: process.env.MERCADOPAGO_WEBHOOK_URL || "https://zirim.onrender.com/orders/webhook",
    date_of_expiration: expirationDate.toISOString(),
    payer: {
      email: payer.email?.endereco || payer.email || "contato@zirim.com",
      first_name: firstName,
      last_name: lastNameParts.join(" ") || "Zirim",
      identification: {
        type: "CPF",
        number: payer.cpf || "17984881758", // CPF de teste (fallback)
      },
    },
  };

  try {
    const result = await paymentClient.create({ body });
    const transactionData = result.point_of_interaction?.transaction_data ?? result.transaction_data ?? {};

    return {
      id: result.id,
      status: result.status,
      status_detail: result.status_detail,
      transaction_amount: result.transaction_amount,
      date_of_expiration: new Date(result.date_of_expiration || expirationDate),
      date_last_updated: result.date_last_updated,
      qr_code: transactionData.qr_code,
      qr_code_base64: transactionData.qr_code_base64,
    };
  } catch (error) {
    console.error("Erro ao gerar PIX:", error);
    throw new ExternalServiceError(`Erro ao gerar PIX: ${error.message}`);
  }
};

export const getPayment = async (id) => {
  try {
    return await paymentClient.get({ id });
  } catch (error) {
    console.error("Erro ao consultar pagamento:", error);
    throw new ExternalServiceError("Erro ao consultar pagamento.");
  }
};

/** Valida a assinatura x-signature do webhook (quando o segredo está configurado). */
export const assertValidWebhookSignature = ({ headers, body }) => {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const xSignature = headers["x-signature"];
  if (!xSignature || !secret) return;

  try {
    const parts = xSignature.split(",");
    const ts = parts.find((p) => p.startsWith("ts=")).split("=")[1];
    const hash = parts.find((p) => p.startsWith("v1=")).split("=")[1];
    const manifest = `id:${body.data.id};request-id:${headers["x-request-id"]};ts:${ts};`;
    const hmac = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

    const valid = hmac.length === hash.length &&
      crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(hash));
    if (!valid) throw new Error("hash divergente");
  } catch (error) {
    console.error("Assinatura do webhook inválida:", error.message);
    throw new UnauthorizedError("Assinatura do webhook inválida.");
  }
};
