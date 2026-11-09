// =============================================================
// Validação de CPF pelos dígitos verificadores.
// É a mesma regra do back-end (backend/src/utils/cpf.js).
// Validar aqui também dá uma resposta instantânea ao usuário.
// =============================================================

/** Calcula um dígito verificador a partir dos dígitos da "base" */
function calcularDigito(base) {
  const pesoInicial = base.length + 1; // 10 para o 1º dígito, 11 para o 2º
  let soma = 0;
  for (let i = 0; i < base.length; i++) {
    soma += Number(base[i]) * (pesoInicial - i);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

/** true se o CPF for válido. Aceita com ou sem máscara. */
export function cpfValido(valor) {
  const cpf = String(valor ?? '').replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos os dígitos iguais
  return (
    calcularDigito(cpf.slice(0, 9)) === Number(cpf[9]) &&
    calcularDigito(cpf.slice(0, 10)) === Number(cpf[10])
  );
}
