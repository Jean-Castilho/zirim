import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

import { armazenCodeOtp, generateOTP } from "./otpService.js"

const WHATSAPP_TOKEN = "EAA1BR5qp0TMBP5gN408BxXEDdA2FBhZBeCrARA0PjBggbz8f7rO3WEEpHgq80dhsGZCZBigtCBNbzcPisu64PxXuGSP4xZAoZAE3Du1a6FnJEZAJc6MR8ZCa4EpR2WF12FjZBM0tky54OG0HSoAhZBSKJONXphuTCgx5qIn0Pqb2gvS6HpVJkO7BiTMmc6hr4ApXgMwJ5404OS2ZClFtetKB82nHktobehR25sqNucasjJ2IvLcmSqJZCjdA8SBjywozbGoplKTBAt2EVLBJH7ZAEkMzY20mywZDZD";
const WHATSAPP_PHONE_NUMBER_ID = "892056613982326";
const WHATSAPP_API_URL = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

// Configurar o transporte do Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function getCurrentTime() {
  const now = new Date();
  return {
    hour: now.getHours(),
    minute: now.getMinutes(),
    second: now.getSeconds(),
  };
};

const createMessagandCode = async (to) => {
  const otp = generateOTP();

  const payload = {
    messaging_product: "whatsapp",
    to: to,
    type: "template",
    template: {
      name: "verifycode",
      language: {
        code: "en_US",
      },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: otp }],
        },
        {
          type: "button",
          sub_type: "url",
          index: 0,
          parameters: [
            {
              type: "text",
              text: otp,
            },
          ],
        },
      ],
    },
  };

  await armazenCodeOtp(to, otp);

  const fetchOptions = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };

  return fetchOptions;

};

export const sendOtpWhatzapp = async (number) => {

  if (!number) {
    throw new ValidationError("Número de telefone não fornecido.");
  }

  if (!WHATSAPP_TOKEN || !WHATSAPP_API_URL) {
    console.error("Variáveis de ambiente do WhatsApp não configuradas.");
    throw new Error(
      "A configuração do servidor para envio de mensagens está incompleta.",
    );
  }

  const fetchOptions = createMessagandCode(number);

  try {
    const response = await fetch(WHATSAPP_API_URL, fetchOptions);
    const data = await response.json();

    return data;

  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
    throw new Error("Erro ao enviar mensagem");
  }
};

export const sendOtpEmail = async (email) => {

  const otp = generateOTP();

  if (!email || !otp) {
    return { mensagem: "Email e OTP são obrigatórios." };
  };

  await armazenCodeOtp(email, otp);

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Seu código OTP",
    text: `Seu código OTP é: ${otp}`,
  };

  // Enviar o email;
  try {
    const emailsend = await transporter.sendMail(mailOptions);

    return { mensagem: "OTP enviado com sucesso!", emailsend };
  } catch (error) {
    console.error("Erro ao enviar OTP:", error);
    return { mensagem: "Erro ao enviar OTP." };
  }

};

export const postSendFeedBack = async (req, res) => {

  const { email, subject, message } = req.body;

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: subject,
    text: message
  };

  try {
    const emailSend = await transporter.sendMail(mailOptions);

    return res.status(200).json({ messagem: "feedback enviado com sucesso!", emailSend })
  } catch (error) {
    return res.status(500).json({ mensagem: "erro ao enviar email" })
  }

};