/**
 * Monta o objeto `payer` do PIX no Mercado Pago.
 *
 * O único CPF usado na aplicação é o da loja, lido de MERCADOPAGO_DEFAULT_CPF
 * e usado somente para criar o PIX. Nenhum fluxo exige ou coleta CPF do comprador.
 * Em produção, o servidor não sobe sem essa variável (ver index.js).
 */
const onlyDigits = (value) => String(value ?? "").replace(/\D/g, "");

export const buildPixPayer = (payer = {}, storeCpf = process.env.MERCADOPAGO_DEFAULT_CPF) => {
  const fullName = typeof payer.name === "string" && payer.name.trim() ? payer.name.trim() : "Cliente";
  const [firstName, ...lastNameParts] = fullName.split(/\s+/);
  const email = payer.email?.endereco || payer.email || "contato@zirim.com";
  const cpf = onlyDigits(storeCpf);

  return {
    email,
    first_name: firstName,
    last_name: lastNameParts.join(" ") || "Zirim",
    // Sem a variável (apenas em desenvolvimento), o bloco não é enviado.
    ...(cpf ? { identification: { type: "CPF", number: cpf } } : {}),
  };
};
