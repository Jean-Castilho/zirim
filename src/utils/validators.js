import { ObjectId } from "mongodb";
import { ValidationError } from "./handleResponse.js";

/**
 * Utilitários e regras de validação padronizados
 */
export const rules = {
  objectId: (field = "ID") => (val) => {
    if (!val || !ObjectId.isValid(val)) {
      return `${field} é inválido ou ausente.`;
    }
    return null;
  },

  email: (val) => {
    const clean = String(val || "").trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      return "Informe um endereço de e-mail válido.";
    }
    return null;
  },

  phone: (val) => {
    const digits = String(val || "").replace(/\D/g, "");
    if (!digits || digits.length < 10 || digits.length > 13) {
      return "O telefone deve conter 10 ou 11 dígitos numéricos com DDD.";
    }
    return null;
  },

  password: (val) => {
    if (!val || typeof val !== "string" || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(val)) {
      return "A senha deve ter no mínimo 8 caracteres, com letra maiúscula, minúscula e número.";
    }
    return null;
  },

  pinCode: (val) => {
    const clean = String(val || "").trim();
    if (!clean || !/^[0-9]{4,6}$/.test(clean)) {
      return "Código PIN deve conter de 4 a 6 dígitos numéricos.";
    }
    return null;
  },

  string: (min = 1, max = 255, fieldName = "Campo") => (val) => {
    const clean = typeof val === "string" ? val.trim() : "";
    if (clean.length < min) {
      return `${fieldName} precisa ter no mínimo ${min} caractere(s).`;
    }
    if (clean.length > max) {
      return `${fieldName} deve ter no máximo ${max} caracteres.`;
    }
    return null;
  },

  oneOf: (allowedValues, fieldName = "Campo") => (val) => {
    if (!allowedValues.includes(val)) {
      return `${fieldName} deve ser um dos seguintes valores: ${allowedValues.join(", ")}.`;
    }
    return null;
  }
};

/**
 * Middleware Express para validação declarativa de req.body.
 * Elimina blocos repetitivos de checagem manual nos controllers.
 */
export const validateBody = (schema) => (req, res, next) => {
  const errors = [];
  const cleanData = {};

  for (const [field, rule] of Object.entries(schema)) {
    const rawValue = req.body?.[field];
    const errorMsg = rule(rawValue);

    if (errorMsg) {
      errors.push({ field, message: errorMsg });
    } else {
      if (typeof rawValue === "string") {
        cleanData[field] = rawValue.trim();
      } else {
        cleanData[field] = rawValue;
      }
    }
  }

  if (errors.length > 0) {
    return next(new ValidationError(errors[0].message, errors));
  }

  req.validated = cleanData;
  next();
};
