import dotenv from "dotenv";

const nameRegex = /^[\p{L}\p{M}'\s-]+$/u;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^\+?[\d\s()-]+$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

dotenv.config();

export const validateUser = (data) => {
  const errors = [];
  const normalizedData = {
    ...data,
    name: data.name ? String(data.name).trim() : data.name,
    email: data.email ? String(data.email).trim().toLowerCase() : data.email,
    phone: data.phone ? String(data.phone).trim() : data.phone,
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

  if (!normalizedData.phone || !phoneRegex.test(normalizedData.phone)) {
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