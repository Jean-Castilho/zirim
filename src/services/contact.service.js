import dotenv from "dotenv";
import nodemailer from "nodemailer";

import { ValidationError, ExternalServiceError } from "../utils/errors.js";
import { storeOtpCode, generateOtpCode } from "./otp.service.js";

dotenv.config();

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID_ENV = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_API_URL = WHATSAPP_PHONE_NUMBER_ID_ENV
  ? `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID_ENV}/messages`
  : null;

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT || 587),
  secure: Number(process.env.EMAIL_PORT || 587) === 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS?.replace(/\s+/g, ""),
  },
});

const createWhatsAppMessageCode = async (to) => {
  const otp = generateOtpCode();

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "verifycode",
      language: { code: "en_US" },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: otp }],
        },
        {
          type: "button",
          sub_type: "url",
          index: 0,
          parameters: [{ type: "text", text: otp }],
        },
      ],
    },
  };

  await storeOtpCode(to, otp);

  return {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };
};

export const sendWhatsAppOtp = async (number) => {
  if (!number) {
    throw new ValidationError("Número de telefone não fornecido.");
  }

  if (!WHATSAPP_TOKEN || !WHATSAPP_API_URL) {
    console.error("WhatsApp não configurado: defina WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID no .env.");
    throw new ExternalServiceError("Serviço de mensagens indisponível no momento.", 503);
  }

  try {
    const fetchOptions = await createWhatsAppMessageCode(number);
    const response = await fetch(WHATSAPP_API_URL, fetchOptions);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || "A API do WhatsApp recusou o envio do código.");
    }

    return data;
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
    throw new ExternalServiceError("Erro ao enviar mensagem.");
  }
};

export const sendEmailOtp = async (email) => {
  if (!email) {
    throw new ValidationError("O endereço de e-mail é obrigatório para enviar o OTP.");
  }

  const otp = generateOtpCode();
  await storeOtpCode(email, otp);

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Seu código OTP",
    text: `Seu código OTP é: ${otp}`,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Erro ao enviar OTP por e-mail:", error);
    throw new ExternalServiceError("Não foi possível enviar o e-mail de verificação.");
  }
};

export const sendPasswordResetEmail = async (email, resetUrl) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Redefinição de senha",
    text: `Use este link para redefinir sua senha (válido por 30 minutos): ${resetUrl}`,
    html: `<p>Recebemos uma solicitação para redefinir sua senha.</p><p><a href="${resetUrl}">Redefinir senha</a></p><p>O link expira em 30 minutos. Se você não solicitou a redefinição, ignore este e-mail.</p>`,
  });
};

export const sendFeedbackEmail = async ({ email, subject, message } = {}) => {
  if (!email || !subject || !message) {
    throw new ValidationError("Email, assunto e mensagem são obrigatórios.");
  }

  try {
    return await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject,
      text: message,
    });
  } catch (error) {
    console.error("Erro ao enviar feedback:", error);
    throw new ExternalServiceError("Erro ao enviar e-mail.");
  }
};
