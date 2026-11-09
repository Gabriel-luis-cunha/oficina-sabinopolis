// =============================================================
// Máscaras e formatações.
// Uma "máscara" pega o que o usuário digitou, tira tudo que não
// for número e coloca de volta os pontos, traços e parênteses.
// =============================================================

/** Remove tudo que não for número */
export function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

/** 52998224725 => 529.982.247-25 (funciona também com o CPF pela metade) */
export function mascaraCpf(valor) {
  return somenteDigitos(valor)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2') // ponto depois dos 3 primeiros
    .replace(/(\d{3})(\d)/, '$1.$2') // ponto depois dos 6 primeiros
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2'); // traço antes dos 2 últimos
}

/**
 * 11222333000181 => 11.222.333/0001-81 (funciona também pela metade).
 * Aceita letras, por causa do CNPJ novo: 12ABC34501DE35 => 12.ABC.345/01DE-35
 */
export function mascaraCnpj(valor) {
  const c = String(valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
  let resultado = c.slice(0, 2);
  if (c.length > 2) resultado += '.' + c.slice(2, 5);
  if (c.length > 5) resultado += '.' + c.slice(5, 8);
  if (c.length > 8) resultado += '/' + c.slice(8, 12);
  if (c.length > 12) resultado += '-' + c.slice(12);
  return resultado;
}

/** Documento do cliente para exibir: "CPF 529.982.247-25", "CNPJ 11.222.333/0001-81" ou '' */
export function formatarDocumento(cliente) {
  if (cliente?.cnpj) return `CNPJ ${mascaraCnpj(cliente.cnpj)}`;
  if (cliente?.cpf) return `CPF ${mascaraCpf(cliente.cpf)}`;
  return '';
}

/** 11988887777 => (11) 98888-7777  |  1133334444 => (11) 3333-4444 */
export function mascaraTelefone(valor) {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** 01310100 => 01310-100 */
export function mascaraCep(valor) {
  const d = somenteDigitos(valor).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Placa: só letras maiúsculas e números, no máximo 7 caracteres */
export function mascaraPlaca(valor) {
  return String(valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

/** ABC1234 => ABC-1234 (padrão antigo). Placas Mercosul ficam sem traço. */
export function formatarPlaca(placa) {
  return /^[A-Z]{3}\d{4}$/.test(placa ?? '') ? `${placa.slice(0, 3)}-${placa.slice(3)}` : placa ?? '';
}

// -------------------------------------------------------------
// Dinheiro. O valor é guardado em CENTAVOS (número inteiro).
// -------------------------------------------------------------
const formatoReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 15090 => "R$ 150,90" */
export function formatarMoeda(centavos) {
  if (centavos === null || centavos === undefined || centavos === '') return '';
  return formatoReal.format(Number(centavos) / 100);
}

/** O que foi digitado no campo de valor => centavos. "R$ 150,90" => 15090 */
export function centavosDoTexto(texto) {
  const d = somenteDigitos(texto).slice(0, 11);
  return d === '' ? null : Number(d);
}

// -------------------------------------------------------------
// Datas. O banco usa AAAA-MM-DD; na tela mostramos DD/MM/AAAA.
// -------------------------------------------------------------

/** "2026-10-20" => "20/10/2026" */
export function formatarData(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/** "2026-10-20" => { dia: "20", mes: "out", ano: "2026" } (usado no cartão da nota) */
export function partesDaData(iso) {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  const data = new Date(ano, mes - 1, dia);
  return {
    dia: String(dia).padStart(2, '0'),
    mes: data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
    ano: String(ano),
  };
}

/** Data de hoje no formato AAAA-MM-DD (no fuso horário do computador) */
export function hojeISO() {
  const hoje = new Date();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${hoje.getFullYear()}-${mes}-${dia}`;
}

/** "Maria da Silva" => "MS" (usado quando o cliente não tem foto) */
export function iniciais(nome) {
  const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}
