import { ValidationError } from "../utils/errors.js";

const nameRegex = /^[\p{L}\p{M}'\s-]+$/u;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export const validateUser = (data) => {
  const errors = [];
  const normalizedData = {
    name: data.name ? String(data.name).trim() : data.name,
    email: data.email ? String(data.email).trim().toLowerCase() : data.email,
    phone: data.phone ? String(data.phone).trim() : data.phone,
    password: data.password,
  };

  if (!normalizedData.name || !nameRegex.test(normalizedData.name) || normalizedData.name.length < 3) {
    errors.push({
      field: "name",
      message: "O nome é obrigatório e precisa ter no mínimo 3 caracteres.",
    });
  }

  if (!normalizedData.email || !emailRegex.test(normalizedData.email)) {
    errors.push({
      field: "email",
      message: "O email é obrigatório e precisa ser um endereço válido.",
    });
  }

  // Remove caracteres não numéricos para validar a extensão real (DDD + Número)
  const digitsOnly = normalizedData.phone ? String(normalizedData.phone).replace(/\D/g, '') : '';
  
  if (!normalizedData.phone || digitsOnly.length < 10 || digitsOnly.length > 13) {
    errors.push({
      field: "phone",
      message:
        "O telefone é obrigatório e deve conter 10 ou 11 dígitos numéricos.",
    });
  }

  if (!normalizedData.password || !passwordRegex.test(normalizedData.password)) {
    errors.push({
      field: "password",
      message: "A senha é obrigatória e precisa ter no mínimo 8 caracteres, com letra maiúscula, minúscula e número.",
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: normalizedData,
  };
};

export const PASSWORD_POLICY_MESSAGE =
  "A senha precisa ter no mínimo 8 caracteres, com letra maiúscula, minúscula e número.";

export const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

/** Retorna o e-mail normalizado ou lança ValidationError. */
export const assertEmail = (email) => {
  const normalized = normalizeEmail(email);
  if (!emailRegex.test(normalized)) {
    throw new ValidationError("Informe um endereço de e-mail válido.");
  }
  return normalized;
};

/** Valida nova senha + confirmação (política única do sistema). */
export const assertNewPassword = (password, confirmPassword) => {
  if (!password || !confirmPassword) {
    throw new ValidationError("Preencha a nova senha e a confirmação.");
  }
  if (password !== confirmPassword) {
    throw new ValidationError("As senhas informadas não coincidem.");
  }
  if (!passwordRegex.test(password)) {
    throw new ValidationError(PASSWORD_POLICY_MESSAGE);
  }
};
