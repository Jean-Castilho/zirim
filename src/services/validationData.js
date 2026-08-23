import dotenv from "dotenv";

const nameRegex = /^[\p{L}\p{M}'\s-]+$/u;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^\+?[\d\s()-]+$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

dotenv.config();

export const validateUser = (data) => {
  const errors = [];

  if (!data.name || !nameRegex.test(data.name) || data.name.length < 3) {
    errors.push({
      field: "name",
      message: "O nome é obrigatório e precisa ter no mínimo 3 caracteres.",
    });
  }

  if (!data.email || !emailRegex.test(data.email)) {
    errors.push({
      field: "email",
      message: "O email é obrigatório e precisa ser um endereço válido.",
    });
  }

  if (!data.phone || !phoneRegex.test(data.phone)) {
    errors.push({
      field: "phone",
      message:
        "O telefone é obrigatório e deve conter 10 ou 11 dígitos numéricos.",
    });
  }

  if (!data.password || !passwordRegex.test(data.password)) {
    errors.push({
      field: "password",
      message: "A senha é obrigatória e precisa ter no mínimo 8 caracteres, com letra maiúscula, minúscula e número.",
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export const validationUser = validateUser;