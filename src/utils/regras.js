// =============================================================
// Regras de validação e limpeza dos dados antes de salvar.
// São as mesmas regras do antigo back-end. Como agora não existe
// servidor próprio (o banco só guarda dados criptografados),
// a conferência completa acontece aqui, logo antes de gravar.
// =============================================================
import { cpfValido } from './cpf.js';
import { cnpjValido, normalizarCnpj } from './cnpj.js';

export { normalizarCnpj };

// Siglas dos estados brasileiros
const ESTADOS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

/** Remove tudo que não for número: "(11) 98888-7777" => "11988887777" */
export function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

/** Remove espaços das pontas. Valores vazios viram null (assim o banco guarda NULL). */
export function texto(valor) {
  const limpo = String(valor ?? '').trim();
  return limpo === '' ? null : limpo;
}

/** "João Ávila" => "joao avila". Usado na busca. */
export function semAcento(valor) {
  return String(valor ?? '')
    .normalize('NFD') // separa a letra do acento: "ã" vira "a" + "~"
    .replace(/[̀-ͯ]/g, '') // remove os acentos soltos
    .toLowerCase();
}

/** "abc-1d23" => "ABC1D23" */
export function normalizarPlaca(valor) {
  return String(valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Placa válida no padrão antigo (ABC1234) ou Mercosul (ABC1D23).
 * Formato: 3 letras, 1 número, 1 letra OU número, 2 números.
 */
export function placaValida(placa) {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa);
}

/** Confere se a data está no formato AAAA-MM-DD e existe no calendário. */
export function dataValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor ?? '')) return false;
  const [ano, mes, dia] = valor.split('-').map(Number);
  const data = new Date(ano, mes - 1, dia);
  // Se a data "transbordar" (ex.: 31/02 vira 03/03), ela é inválida
  return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
}

/** Converte o id da URL em número. Retorna null se não for um id válido. */
export function lerId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// -------------------------------------------------------------
// Validações por "entidade". Cada uma devolve:
//   { valores: dados limpos prontos para o banco,
//     erros:   { campo: 'mensagem' } (vazio se estiver tudo certo) }
// -------------------------------------------------------------

export function validarCliente(dados = {}) {
  const erros = {};
  const valores = {
    nome: texto(dados.nome),
    // CPF e CNPJ são opcionais. Vazio vira null (o banco aceita vários clientes sem documento).
    cpf: somenteDigitos(dados.cpf) || null,
    cnpj: normalizarCnpj(dados.cnpj) || null,
    telefone: somenteDigitos(dados.telefone) || null,
    cep: somenteDigitos(dados.cep) || null,
    rua: texto(dados.rua),
    numero: texto(dados.numero),
    complemento: texto(dados.complemento),
    bairro: texto(dados.bairro),
    cidade: texto(dados.cidade),
    estado: texto(dados.estado)?.toUpperCase() ?? null,
  };

  if (!valores.nome) {
    erros.nome = 'Informe o nome completo.';
  } else if (valores.nome.length < 3) {
    erros.nome = 'O nome precisa ter pelo menos 3 letras.';
  } else if (valores.nome.length > 120) {
    erros.nome = 'O nome pode ter no máximo 120 caracteres.';
  }

  // Documento: o cliente pode ter CPF (pessoa física), CNPJ (empresa) ou nenhum dos dois.
  // Só o que foi preenchido é conferido.
  if (valores.cpf && valores.cnpj) {
    erros.cpf = 'Informe só um documento: CPF ou CNPJ.';
  } else if (valores.cpf && !cpfValido(valores.cpf)) {
    erros.cpf = 'CPF inválido. Confira os números digitados.';
  } else if (valores.cnpj && !cnpjValido(valores.cnpj)) {
    erros.cnpj = 'CNPJ inválido. Confira o que foi digitado.';
  }

  if (valores.telefone && ![10, 11].includes(valores.telefone.length)) {
    erros.telefone = 'Telefone incompleto. Use o formato (00) 00000-0000.';
  }

  if (valores.cep && valores.cep.length !== 8) {
    erros.cep = 'CEP incompleto. Use o formato 00000-000.';
  }

  if (valores.estado && !ESTADOS.includes(valores.estado)) {
    erros.estado = 'Estado inválido. Use a sigla, por exemplo SP.';
  }

  // Limite de tamanho para os campos de endereço
  for (const campo of ['rua', 'numero', 'complemento', 'bairro', 'cidade']) {
    if (valores[campo] && valores[campo].length > 150) {
      erros[campo] = 'Texto muito longo (máximo de 150 caracteres).';
    }
  }

  return { valores, erros };
}

export function validarVeiculo(dados = {}) {
  const erros = {};
  const anoTexto = texto(dados.ano);
  const valores = {
    marca: texto(dados.marca),
    modelo: texto(dados.modelo),
    ano: anoTexto === null ? null : Number(anoTexto),
    placa: normalizarPlaca(dados.placa),
    cor: texto(dados.cor),
  };

  if (!valores.marca) erros.marca = 'Informe a marca.';
  if (!valores.modelo) erros.modelo = 'Informe o modelo.';

  const anoMaximo = new Date().getFullYear() + 1; // carros "ano que vem" já são vendidos
  if (valores.ano !== null && (!Number.isInteger(valores.ano) || valores.ano < 1900 || valores.ano > anoMaximo)) {
    erros.ano = `Ano inválido. Use um ano entre 1900 e ${anoMaximo}.`;
  }

  if (!valores.placa) {
    erros.placa = 'Informe a placa.';
  } else if (!placaValida(valores.placa)) {
    erros.placa = 'Placa inválida. Use ABC-1234 ou o padrão Mercosul ABC1D23.';
  }

  for (const campo of ['marca', 'modelo', 'cor']) {
    if (valores[campo] && valores[campo].length > 60) {
      erros[campo] = 'Texto muito longo (máximo de 60 caracteres).';
    }
  }

  return { valores, erros };
}

export function validarNota(dados = {}) {
  const erros = {};
  const valorTexto = String(dados.valor_centavos ?? '').trim();
  const valores = {
    veiculo_id: lerId(dados.veiculo_id),
    titulo: texto(dados.titulo),
    data: texto(dados.data),
    descricao: texto(dados.descricao),
    valor_centavos: valorTexto === '' ? null : Number(valorTexto),
  };

  if (!valores.veiculo_id) erros.veiculo_id = 'Escolha o veículo.';

  if (!valores.titulo) {
    erros.titulo = 'Dê um nome para a nota.';
  } else if (valores.titulo.length > 120) {
    erros.titulo = 'O nome pode ter no máximo 120 caracteres.';
  }

  if (!valores.data) {
    erros.data = 'Informe a data do serviço.';
  } else if (!dataValida(valores.data)) {
    erros.data = 'Data inválida.';
  }

  if (!valores.descricao) {
    erros.descricao = 'Descreva o serviço realizado.';
  } else if (valores.descricao.length > 5000) {
    erros.descricao = 'Descrição muito longa (máximo de 5000 caracteres).';
  }

  if (valores.valor_centavos === null) {
    erros.valor_centavos = 'Informe o valor do serviço.';
  } else if (!Number.isInteger(valores.valor_centavos) || valores.valor_centavos < 0) {
    erros.valor_centavos = 'Valor inválido.';
  } else if (valores.valor_centavos > 100_000_000_00) {
    erros.valor_centavos = 'Valor alto demais.';
  }

  return { valores, erros };
}

/** true se o objeto de erros tiver pelo menos um campo */
export function temErros(erros) {
  return Object.keys(erros).length > 0;
}
