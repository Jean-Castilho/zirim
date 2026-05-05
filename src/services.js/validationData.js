import dotenv from "dotenv";

// Regex aprimorada para nomes, aceitando acentos, apóstrofos e hífens (suporte Unicode)
const nameRegex = /^[\p{L}\p{M}'\s-]+$/u;
// Regex padrão para e-mail
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Regex flexível para números de telefone: aceita +, espaços, parênteses e hífens
const phoneRegex = /^\+?[\d\s()-]+$/;
// Regex para senhas (mantida como no original para robustez)// Exige minúscula, maiúscula E número, mas sem símbolos.
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

dotenv.config();

export const validationUser = (data) => {
  const errors = [];

  if (!data.name || data.name.length < 3) {
    errors.push({
      field: "name",
      message: "O nome é obrigatório e precisa ter no mínimo 3 caracteres.",
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!data.email || !emailRegex.test(data.email)) {
    errors.push({
      field: "email",
      message: "O email é obrigatório e precisa ser um endereço válido.",
    });
  }
  const phoneRegex = /^\+?[\d\s()-]+$/;
  if (!data.phone || !phoneRegex.test(data.phone)) {
    errors.push({
      field: "phone",
      message:
        "O telefone é obrigatório e deve conter 10 ou 11 dígitos numéricos.",
    });
  }

  if (!data.password || data.password.length < 8) {
    errors.push({
      field: "password",
      message: "A senha é obrigatória e precisa ter no mínimo 8 caracteres.",
    });
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
  };
};