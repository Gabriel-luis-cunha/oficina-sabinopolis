// =============================================================
// Validação de CNPJ pelos dígitos verificadores.
// É a mesma regra do back-end (backend/src/utils/cnpj.js).
// Aceita o CNPJ só de números e o novo CNPJ com letras
// (emitido pela Receita desde julho de 2026, ex.: 12.ABC.345/01DE-35).
// =============================================================

/** Deixa só letras e números, em maiúsculas */
export function normalizarCnpj(valor) {
  return String(valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Calcula um dígito verificador (pesos de 2 a 9, da direita para a esquerda) */
function calcularDigito(base) {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += (base.charCodeAt(i) - 48) * peso; // "0" vale 0, "A" vale 17...
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** true se o CNPJ for válido. Aceita com ou sem máscara. */
export function cnpjValido(valor) {
  const cnpj = normalizarCnpj(valor);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return false;
  if (/^(.)\1{13}$/.test(cnpj)) return false; // todos os caracteres iguais
  return (
    calcularDigito(cnpj.slice(0, 12)) === Number(cnpj[12]) &&
    calcularDigito(cnpj.slice(0, 13)) === Number(cnpj[13])
  );
}
