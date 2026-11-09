// =============================================================
// Validação dos formulários no navegador.
// As regras são as mesmas do back-end. Cada função devolve um
// objeto { campo: 'mensagem de erro' }. Objeto vazio = tudo certo.
// =============================================================
import { cpfValido } from './cpf.js';
import { cnpjValido, normalizarCnpj } from './cnpj.js';
import { somenteDigitos } from './mascaras.js';
import { LIMITES } from '../config.js';

export const ESTADOS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export function validarCliente(form) {
  const erros = {};
  const nome = form.nome.trim();
  const cpf = somenteDigitos(form.cpf);
  const cnpj = normalizarCnpj(form.cnpj);
  const telefone = somenteDigitos(form.telefone);
  const cep = somenteDigitos(form.cep);

  if (!nome) erros.nome = 'Informe o nome completo.';
  else if (nome.length < 3) erros.nome = 'O nome precisa ter pelo menos 3 letras.';

  // CPF e CNPJ são opcionais. Só o documento escolhido é conferido, e só se foi preenchido.
  if (form.tipoDocumento === 'cnpj') {
    if (cnpj && cnpj.length < 14) erros.cnpj = 'CNPJ incompleto. Use o formato 00.000.000/0000-00.';
    else if (cnpj && !cnpjValido(cnpj)) erros.cnpj = 'CNPJ inválido. Confira o que foi digitado.';
  } else {
    if (cpf && cpf.length < 11) erros.cpf = 'CPF incompleto. Use o formato 000.000.000-00.';
    else if (cpf && !cpfValido(cpf)) erros.cpf = 'CPF inválido. Confira os números digitados.';
  }

  if (telefone && telefone.length < 10) erros.telefone = 'Telefone incompleto. Use o formato (00) 00000-0000.';
  if (cep && cep.length < 8) erros.cep = 'CEP incompleto. Use o formato 00000-000.';

  return erros;
}

export function validarVeiculo(form) {
  const erros = {};
  const anoMaximo = new Date().getFullYear() + 1;

  if (!form.marca.trim()) erros.marca = 'Informe a marca.';
  if (!form.modelo.trim()) erros.modelo = 'Informe o modelo.';

  if (form.ano !== '') {
    const ano = Number(form.ano);
    if (!Number.isInteger(ano) || ano < 1900 || ano > anoMaximo) {
      erros.ano = `Use um ano entre 1900 e ${anoMaximo}.`;
    }
  }

  if (!form.placa) erros.placa = 'Informe a placa.';
  else if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(form.placa)) {
    erros.placa = 'Placa inválida. Use ABC-1234 ou o padrão Mercosul ABC1D23.';
  }

  return erros;
}

export function validarNota(form) {
  const erros = {};
  if (!form.veiculo_id) erros.veiculo_id = 'Escolha o veículo.';
  if (!form.titulo.trim()) erros.titulo = 'Dê um nome para a nota.';
  if (!form.data) erros.data = 'Informe a data do serviço.';
  if (!form.descricao.trim()) erros.descricao = 'Descreva o serviço realizado.';
  if (form.valor_centavos === null) erros.valor_centavos = 'Informe o valor do serviço.';
  return erros;
}

// -------------------------------------------------------------
// Arquivos
// -------------------------------------------------------------
const MB = 1024 * 1024;

function extensao(nome) {
  const ponto = nome.lastIndexOf('.');
  return ponto === -1 ? '' : nome.slice(ponto).toLowerCase();
}

/**
 * Separa as imagens válidas das inválidas.
 * @returns {{ validas: File[], erro: string }}
 */
export function filtrarImagens(arquivos) {
  const validas = [];
  const problemas = [];
  for (const arquivo of arquivos) {
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extensao(arquivo.name))) {
      problemas.push(`"${arquivo.name}" não é JPG, PNG ou WEBP`);
    } else if (arquivo.size > LIMITES.tamanhoImagemMB * MB) {
      problemas.push(`"${arquivo.name}" passa de ${LIMITES.tamanhoImagemMB} MB`);
    } else {
      validas.push(arquivo);
    }
  }
  return { validas, erro: problemas.length ? `Fotos recusadas: ${problemas.join('; ')}.` : '' };
}

/** Tipos aceitos no seletor de arquivos do Word (atributo "accept" do input) */
export const ACEITA_WORD =
  '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Retorna a mensagem de erro, ou '' se o arquivo Word for aceito */
export function validarArquivoWord(arquivo) {
  if (!arquivo) return '';
  if (!['.doc', '.docx'].includes(extensao(arquivo.name))) {
    return 'Só são aceitos arquivos Word (.doc ou .docx).';
  }
  if (arquivo.size > LIMITES.tamanhoWordMB * MB) {
    return `O arquivo passa de ${LIMITES.tamanhoWordMB} MB.`;
  }
  return '';
}

/** "orcamento.docx" => { base: "orcamento", ext: ".docx" } */
export function separarExtensao(nome) {
  const ext = extensao(nome ?? '');
  return { base: ext ? nome.slice(0, -ext.length) : nome ?? '', ext };
}

/** Coloca o cursor no primeiro campo com erro, para o usuário ver o que corrigir */
export function focarPrimeiroErro(erros) {
  const primeiro = Object.keys(erros)[0];
  if (!primeiro) return;
  const campo = document.getElementById('campo-' + primeiro);
  if (campo) {
    campo.focus();
    campo.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
