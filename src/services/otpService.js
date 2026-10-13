import { randomInt } from "crypto";
import OtpRepository from "../repository/OtpRepository.js";

const OTP_LIFETIME_MINUTES = 15;
const otpRepository = new OtpRepository();

/** Gera um código OTP numérico de 6 dígitos seguro. */
export const generateOtpCode = () => randomInt(100000, 1000000).toString();

/**
 * Armazena um OTP com expiração, substituindo qualquer OTP anterior do identificador.
 */
export const storeOtpCode = async (identifier, otp) => {
  const expiresAt = new Date(Date.now() + OTP_LIFETIME_MINUTES * 60 * 1000);
  await otpRepository.upsertCode(identifier, otp, expiresAt);
};

/**
 * Verifica o OTP e, se válido, o invalida. Retorna o documento ou null.
 */
export const verifyOtpCode = async (identifier, otp) =>
  otpRepository.consumeValidCode(identifier, otp);
