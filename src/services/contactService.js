import dotenv from "dotenv";
import nodemailer from "nodemailer";

import { ValidationError } from "../utils/handleResponse.js";
import { storeOtpCode, generateOtpCode } from "./otpService.js";

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
    pass: process.env.EMAIL_PASS,
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
    throw new Error(
      "A configuração do servidor para envio de mensagens está incompleta. Defina WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID no .env.",
    );
  }

  try {
    const fetchOptions = await createWhatsAppMessageCode(number);
    const response = await fetch(WHATSAPP_API_URL, fetchOptions);
    const data = await response.json();

    return data;
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
    throw new Error("Erro ao enviar mensagem.");
  }
};

export const sendEmailOtp = async (email) => {
  if (!email) {
    throw new Error("O endereço de e-mail é obrigatório para enviar o OTP.");
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
    console.log(`OTP enviado com sucesso para ${email}`);
  } catch (error) {
    console.error("Erro ao enviar OTP por e-mail:", error);
    throw error;
  }
};

export const sendFeedbackEmail = async (req, res) => {
  const { email, subject, message } = req.body;

  if (!email || !subject || !message) {
    return res.status(400).json({ mensagem: "Email, assunto e mensagem são obrigatórios." });
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject,
    text: message,
  };

  try {
    const emailSend = await transporter.sendMail(mailOptions);
    return res.status(200).json({ mensagem: "feedback enviado com sucesso!", emailSend });
  } catch (error) {
    return res.status(500).json({ mensagem: "erro ao enviar email" });
  }
};