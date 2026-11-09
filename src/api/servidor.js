// =============================================================
// Todas as operações de dados ficam neste arquivo.
// As páginas só chamam estas funções (os nomes são os mesmos do
// sistema antigo, que tinha servidor próprio).
//
// Antes de enviar ao Supabase, tudo é CRIPTOGRAFADO aqui no navegador.
// Ao receber, é descriptografado aqui também. O banco só vê:
//   - números de identificação (id) e ligações (cliente_id, veiculo_id);
//   - os dados embaralhados (coluna "dados");
//   - "impressões digitais" de CPF, CNPJ e placa, para impedir duplicados.
// =============================================================
import {
  abrirCofreComCodigo, abrirCofreComSenha, apagarChavesGuardadas, cifrarBytes, cifrarObjeto, criarCofre,
  decifrarBytes, decifrarObjeto, guardarChaves, indice, lerChavesGuardadas,
} from './cripto.js';
import {
  ErroApi, EVENTO_SESSAO_EXPIRADA, apagarArquivos, apagarSessao, baixarArquivo, enviarArquivo, loginSupabase,
  logoutSupabase, sessaoAtual, supabaseConfigurado, tabela,
} from './supabase.js';
import {
  normalizarCnpj, normalizarPlaca, semAcento, somenteDigitos, temErros,
  validarCliente, validarNota, validarVeiculo,
} from '../utils/regras.js';
import { LIMITES } from '../config.js';

export { ErroApi, EVENTO_SESSAO_EXPIRADA };

const clientes = tabela('clientes');
const veiculos = tabela('veiculos');
const notas = tabela('notas');
const fotos = tabela('fotos');
const cofre = tabela('cofre');

// Chaves de criptografia em uso (só na memória desta aba)
let chaves = null;
// Guardado entre "senha não abriu o cofre" e "digitou o código de recuperação"
let recuperacaoPendente = null;

function exigirChaves() {
  if (!chaves) {
    window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA));
    throw new ErroApi('Entre de novo para continuar.', 401);
  }
  return chaves;
}

const erroValidacao = (erros) => new ErroApi('Confira os campos destacados.', 400, erros);
const naoEncontrado = (texto) => new ErroApi(texto, 404);
const agora = () => new Date().toISOString();
const idsEmLista = (ids) => `in.(${ids.join(',')})`;

// =============================================================
// Login
// =============================================================

async function ativar(novasChaves, sessao) {
  chaves = novasChaves;
  await guardarChaves(novasChaves, sessao.usuario_id).catch(() => {});
}

/**
 * Faz o login e abre o cofre de chaves.
 * Devolve:
 *   { estado: 'ok' }                      tudo certo
 *   { estado: 'novo-cofre', codigo }      primeiro acesso: mostrar o código de recuperação
 *   { estado: 'precisa-codigo' }          a senha mudou: pedir o código de recuperação
 */
export async function entrar(email, senha) {
  if (!supabaseConfigurado()) {
    throw new ErroApi('O sistema ainda não foi ligado ao Supabase. Preencha o arquivo src/config.js.', 0);
  }
  const sessao = await loginSupabase(email, senha);

  const [registro] = await cofre.listar('select=*&id=eq.1');
  if (!registro) {
    // Primeiro acesso de todos: cria a chave mestra
    const novo = await criarCofre(senha);
    try {
      await cofre.inserir({ id: 1, ...novo.registro });
    } catch (falha) {
      if (falha.status === 409) return entrar(email, senha); // outro aparelho criou ao mesmo tempo
      throw falha;
    }
    await ativar(novo.chaves, sessao);
    return { estado: 'novo-cofre', codigo: novo.codigo };
  }

  const abertas = await abrirCofreComSenha(registro, senha);
  if (!abertas) {
    recuperacaoPendente = { registro, senha, sessao };
    return { estado: 'precisa-codigo' };
  }
  await ativar(abertas, sessao);
  return { estado: 'ok' };
}

/** Usa o código de recuperação quando a senha não abre o cofre (senha trocada) */
export async function recuperarComCodigo(codigo) {
  if (!recuperacaoPendente) throw new ErroApi('Entre com o e-mail e a senha primeiro.', 400);
  const { registro, senha, sessao } = recuperacaoPendente;
  const resultado = await abrirCofreComCodigo(registro, codigo, senha);
  if (!resultado) {
    throw new ErroApi('Código de recuperação incorreto.', 400, { codigo: 'Código incorreto. Confira as letras e os números.' });
  }
  // A partir de agora a senha nova também abre o cofre
  await cofre.atualizar('id=eq.1', resultado.registro);
  recuperacaoPendente = null;
  await ativar(resultado.chaves, sessao);
  return { estado: 'ok' };
}

export async function sair() {
  chaves = null;
  recuperacaoPendente = null;
  limparFotosEmCache();
  await apagarChavesGuardadas();
  await logoutSupabase();
}

/** Ao abrir o site: confere se já há login e chaves guardadas neste navegador */
export async function verificarSessao() {
  const sessao = sessaoAtual();
  const guardadas = sessao ? await lerChavesGuardadas() : null;
  if (!sessao || !guardadas || guardadas.usuarioId !== sessao.usuario_id) {
    apagarSessao();
    await apagarChavesGuardadas();
    throw new ErroApi('Faça login para continuar.', 401);
  }
  chaves = { dados: guardadas.dados, indice: guardadas.indice };
  return { usuario: sessao.email };
}

// =============================================================
// Arquivos: conferência, preparo e cache das fotos
// =============================================================
const MB = 1024 * 1024;

const TIPOS_IMAGEM = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const TIPOS_WORD = {
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function extensao(nome) {
  const ponto = String(nome ?? '').lastIndexOf('.');
  return ponto === -1 ? '' : nome.slice(ponto).toLowerCase();
}

/** Confere os primeiros bytes: um .jpg precisa ser JPG de verdade (e não um programa renomeado) */
function assinaturaConfere(bytes, ext) {
  const comeca = (...valores) => valores.every((v, i) => bytes[i] === v);
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return comeca(0xff, 0xd8, 0xff);
    case '.png':
      return comeca(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case '.webp':
      return comeca(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    case '.docx':
      return comeca(0x50, 0x4b, 0x03, 0x04); // .docx é um ZIP por dentro
    case '.doc':
      return comeca(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    default:
      return false;
  }
}

/**
 * Fotos grandes são reduzidas (lado maior de até 1920 px) antes de criptografar.
 * Economiza espaço no Supabase e deixa o sistema rápido no celular.
 */
async function prepararImagem(arquivo, bytes) {
  const tipo = TIPOS_IMAGEM[extensao(arquivo.name)];
  if (typeof createImageBitmap !== 'function') return { bytes, tipo };
  try {
    const imagem = await createImageBitmap(new Blob([bytes], { type: tipo }));
    const maior = Math.max(imagem.width, imagem.height);
    if (maior <= 1920 && bytes.length <= 1.5 * MB) {
      imagem.close?.();
      return { bytes, tipo };
    }
    const escala = Math.min(1, 1920 / maior);
    const tela = document.createElement('canvas');
    tela.width = Math.round(imagem.width * escala);
    tela.height = Math.round(imagem.height * escala);
    tela.getContext('2d').drawImage(imagem, 0, 0, tela.width, tela.height);
    imagem.close?.();
    const blob = await new Promise((resolver) => tela.toBlob(resolver, 'image/jpeg', 0.85));
    if (!blob || blob.size >= bytes.length) return { bytes, tipo };
    return { bytes: new Uint8Array(await blob.arrayBuffer()), tipo: 'image/jpeg' };
  } catch {
    return { bytes, tipo };
  }
}

/** Lê, confere e criptografa uma foto. Devolve o que precisa ser enviado. */
async function lerFoto(arquivo) {
  const ext = extensao(arquivo.name);
  if (!TIPOS_IMAGEM[ext]) throw new ErroApi(`"${arquivo.name}" não é JPG, PNG ou WEBP.`, 400);
  if (arquivo.size > LIMITES.tamanhoImagemMB * MB) {
    throw new ErroApi(`"${arquivo.name}" passa de ${LIMITES.tamanhoImagemMB} MB.`, 400);
  }
  const original = new Uint8Array(await arquivo.arrayBuffer());
  if (!assinaturaConfere(original, ext)) throw new ErroApi(`"${arquivo.name}" não parece ser uma imagem válida.`, 400);
  return prepararImagem(arquivo, original);
}

const novoCaminho = (pasta) => `${pasta}/${crypto.randomUUID()}`;

// Fotos já descriptografadas, para não baixar de novo a cada tela
const fotosEmCache = new Map(); // caminho => url (blob:)

function limparFotosEmCache() {
  for (const url of fotosEmCache.values()) URL.revokeObjectURL(url);
  fotosEmCache.clear();
}

async function urlDaFoto(caminho, tipo) {
  if (fotosEmCache.has(caminho)) return fotosEmCache.get(caminho);
  const promessa = (async () => {
    const bytes = await decifrarBytes(exigirChaves(), await baixarArquivo(caminho), 'foto');
    return URL.createObjectURL(new Blob([bytes], { type: tipo || 'image/jpeg' }));
  })();
  fotosEmCache.set(caminho, promessa);
  try {
    const url = await promessa;
    fotosEmCache.set(caminho, url);
    return url;
  } catch {
    fotosEmCache.delete(caminho);
    return null; // a foto não abriu: a tela mostra as iniciais no lugar
  }
}

/**
 * Nome do arquivo para exibir e baixar.
 * Tira caracteres proibidos no Windows e garante a extensão certa.
 * Devolve null se não sobrar nenhum nome.
 */
function montarNomeArquivo(nome, ext) {
  let base = String(nome ?? '').trim();
  if (base.toLowerCase().endsWith(ext)) base = base.slice(0, -ext.length);
  base = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '');
  if (!base) return null;
  return base.slice(0, 150) + ext;
}

// =============================================================
// Abrir (descriptografar) as linhas do banco
// =============================================================

async function abrirCliente(linha) {
  const dados = await decifrarObjeto(exigirChaves(), linha.dados, 'cliente');
  return { id: linha.id, ...dados, criado_em: linha.criado_em, atualizado_em: linha.atualizado_em };
}

async function abrirVeiculo(linha) {
  const dados = await decifrarObjeto(exigirChaves(), linha.dados, 'veiculo');
  return { id: linha.id, cliente_id: linha.cliente_id, ...dados, criado_em: linha.criado_em };
}

async function abrirNota(linha) {
  const dados = await decifrarObjeto(exigirChaves(), linha.dados, 'nota');
  return {
    id: linha.id,
    cliente_id: linha.cliente_id,
    veiculo_id: linha.veiculo_id,
    ...dados,
    arquivo_nome: linha.arquivo_caminho ? dados.arquivo_nome : null,
    arquivo_caminho: linha.arquivo_caminho,
    criado_em: linha.criado_em,
    atualizado_em: linha.atualizado_em,
  };
}

async function abrirFoto(linha) {
  const dados = await decifrarObjeto(exigirChaves(), linha.dados, 'foto-info');
  return {
    id: linha.id,
    cliente_id: linha.cliente_id,
    veiculo_id: linha.veiculo_id,
    caminho: linha.caminho,
    nome_original: dados.nome_original,
    url: await urlDaFoto(linha.caminho, dados.tipo),
  };
}

const abrirTodos = (linhas, abrir) => Promise.all(linhas.map(abrir));

// =============================================================
// Clientes
// =============================================================

export async function listarClientes(busca = '') {
  const [linhasClientes, linhasVeiculos, linhasNotas, linhasFotos] = await Promise.all([
    clientes.listar('select=id,dados,criado_em,atualizado_em'),
    veiculos.listar('select=id,cliente_id,dados,criado_em'),
    notas.listar('select=cliente_id'),
    fotos.listar('select=id,cliente_id,caminho,dados&cliente_id=not.is.null&order=id'),
  ]);
  const [todos, todosVeiculos] = await Promise.all([
    abrirTodos(linhasClientes, abrirCliente),
    abrirTodos(linhasVeiculos, abrirVeiculo),
  ]);

  // Mesma busca do sistema antigo: nome (sem acento), CPF, CNPJ ou placa
  const termo = String(busca ?? '').trim();
  const digitos = somenteDigitos(termo);
  const pareceCpf = /^[\d.\-\s]+$/.test(termo) && digitos.length >= 3;
  const cnpjBusca = normalizarCnpj(termo);
  const pareceCnpj = /\d/.test(termo) && cnpjBusca.length >= 3;
  const placaBusca = normalizarPlaca(termo);
  const nomeBusca = semAcento(termo);

  const placasDe = (id) => todosVeiculos.filter((v) => v.cliente_id === id).map((v) => v.placa);
  const encontrados = todos.filter((c) => {
    if (!termo) return true;
    if (semAcento(c.nome).includes(nomeBusca)) return true;
    if (pareceCpf && c.cpf?.includes(digitos)) return true;
    if (pareceCnpj && c.cnpj?.includes(cnpjBusca)) return true;
    return Boolean(placaBusca) && placasDe(c.id).some((p) => p.includes(placaBusca));
  });

  encontrados.sort((a, b) => semAcento(a.nome).localeCompare(semAcento(b.nome), 'pt-BR'));

  return Promise.all(
    encontrados.map(async (c) => {
      const primeiraFoto = linhasFotos.find((f) => f.cliente_id === c.id);
      return {
        id: c.id,
        nome: c.nome,
        cpf: c.cpf,
        cnpj: c.cnpj,
        telefone: c.telefone,
        cidade: c.cidade,
        estado: c.estado,
        placas: placasDe(c.id),
        foto: primeiraFoto ? (await abrirFoto(primeiraFoto)).url : null,
        total_notas: linhasNotas.filter((n) => n.cliente_id === c.id).length,
      };
    }),
  );
}

async function buscarLinhaCliente(id) {
  const [linha] = await clientes.listar(`select=*&id=eq.${Number(id)}`);
  if (!linha) throw naoEncontrado('Cliente não encontrado.');
  return linha;
}

/** Cliente completo: dados, fotos, veículos (com fotos) e notas */
export async function buscarCliente(id) {
  const linha = await buscarLinhaCliente(id);
  const [linhasFotos, linhasVeiculos, linhasNotas] = await Promise.all([
    fotos.listar(`select=*&cliente_id=eq.${linha.id}&order=id`),
    veiculos.listar(`select=*&cliente_id=eq.${linha.id}&order=id`),
    notas.listar(`select=*&cliente_id=eq.${linha.id}`),
  ]);
  const idsVeiculos = linhasVeiculos.map((v) => v.id);
  const linhasFotosVeiculos = idsVeiculos.length
    ? await fotos.listar(`select=*&veiculo_id=${idsEmLista(idsVeiculos)}&order=id`)
    : [];

  const [cliente, fotosCliente, listaVeiculos, fotosVeiculos, listaNotas] = await Promise.all([
    abrirCliente(linha),
    abrirTodos(linhasFotos, abrirFoto),
    abrirTodos(linhasVeiculos, abrirVeiculo),
    abrirTodos(linhasFotosVeiculos, abrirFoto),
    abrirTodos(linhasNotas, abrirNota),
  ]);

  cliente.fotos = fotosCliente;
  cliente.veiculos = listaVeiculos.map((v) => ({ ...v, fotos: fotosVeiculos.filter((f) => f.veiculo_id === v.id) }));
  cliente.notas = listaNotas
    .map((n) => comVeiculo(n, listaVeiculos.find((v) => v.id === n.veiculo_id)))
    // Da mais recente para a mais antiga
    .sort((a, b) => (a.data === b.data ? b.id - a.id : a.data < b.data ? 1 : -1));
  return cliente;
}

/** Erro 409 se o CPF ou CNPJ já for de OUTRO cliente. Devolve as impressões digitais para gravar. */
async function conferirDocumento(valores, idAtual = 0) {
  const resultado = { cpf_indice: null, cnpj_indice: null };
  for (const tipo of ['cpf', 'cnpj']) {
    if (!valores[tipo]) continue;
    const digital = await indice(exigirChaves(), `${tipo}:${valores[tipo]}`);
    resultado[`${tipo}_indice`] = digital;
    const [existente] = await clientes.listar(`select=id,dados&${tipo}_indice=eq.${digital}&id=neq.${idAtual}`);
    if (existente) {
      const { nome } = await abrirCliente(existente);
      const rotulo = tipo.toUpperCase();
      throw new ErroApi(`Este ${rotulo} já está cadastrado.`, 409, { [tipo]: `${rotulo} já cadastrado para ${nome}.` });
    }
  }
  return resultado;
}

/** O banco recusou por duplicidade (dois aparelhos salvando ao mesmo tempo) */
function traduzirDuplicado(falha, campo, mensagem) {
  if (falha.status === 409) return new ErroApi(mensagem, 409, { [campo]: mensagem });
  return falha;
}

export async function criarCliente(dados) {
  const { valores, erros } = validarCliente(dados);
  if (temErros(erros)) throw erroValidacao(erros);
  const indices = await conferirDocumento(valores);
  try {
    const linha = await clientes.inserir({ dados: await cifrarObjeto(exigirChaves(), valores, 'cliente'), ...indices });
    return { id: linha.id, ...valores };
  } catch (falha) {
    throw traduzirDuplicado(falha, valores.cnpj ? 'cnpj' : 'cpf', 'Este documento já está cadastrado.');
  }
}

export async function atualizarCliente(id, dados) {
  const linha = await buscarLinhaCliente(id);
  const { valores, erros } = validarCliente(dados);
  if (temErros(erros)) throw erroValidacao(erros);
  const indices = await conferirDocumento(valores, linha.id);
  try {
    await clientes.atualizar(`id=eq.${linha.id}`, {
      dados: await cifrarObjeto(exigirChaves(), valores, 'cliente'),
      ...indices,
      atualizado_em: agora(),
    });
  } catch (falha) {
    throw traduzirDuplicado(falha, valores.cnpj ? 'cnpj' : 'cpf', 'Este documento já está cadastrado.');
  }
  return { id: linha.id, ...valores };
}

export async function excluirCliente(id) {
  const linha = await buscarLinhaCliente(id);
  // Anota os arquivos antes de apagar (o banco apaga veículos, fotos e notas junto)
  const idsVeiculos = (await veiculos.listar(`select=id&cliente_id=eq.${linha.id}`)).map((v) => v.id);
  const [fotosC, fotosV, notasC] = await Promise.all([
    fotos.listar(`select=caminho&cliente_id=eq.${linha.id}`),
    idsVeiculos.length ? fotos.listar(`select=caminho&veiculo_id=${idsEmLista(idsVeiculos)}`) : [],
    notas.listar(`select=arquivo_caminho&cliente_id=eq.${linha.id}`),
  ]);
  await clientes.excluir(`id=eq.${linha.id}`);
  await apagarArquivos([...fotosC.map((f) => f.caminho), ...fotosV.map((f) => f.caminho), ...notasC.map((n) => n.arquivo_caminho)]);
  return null;
}

// =============================================================
// Fotos (de cliente ou de veículo)
// =============================================================

async function enviarFotos(dono, idDono, arquivos) {
  const lista = Array.from(arquivos ?? []);
  if (lista.length === 0) throw new ErroApi('Selecione pelo menos uma foto.', 400);
  if (lista.length > LIMITES.quantidadeImagens) {
    throw new ErroApi(`Envie no máximo ${LIMITES.quantidadeImagens} fotos por vez.`, 400);
  }
  const preparadas = await Promise.all(lista.map(lerFoto));

  const enviadas = [];
  try {
    for (let i = 0; i < lista.length; i++) {
      const caminho = novoCaminho('fotos');
      await enviarArquivo(caminho, await cifrarBytes(exigirChaves(), preparadas[i].bytes, 'foto'));
      enviadas.push({
        caminho,
        [dono]: idDono,
        dados: await cifrarObjeto(exigirChaves(), { nome_original: lista[i].name, tipo: preparadas[i].tipo }, 'foto-info'),
      });
    }
    return await fotos.inserirVarias(enviadas);
  } catch (falha) {
    // Se algo falhou no meio, não deixa arquivos soltos no Storage
    await apagarArquivos(enviadas.map((f) => f.caminho));
    throw falha;
  }
}

async function excluirFoto(fotoId, dono) {
  const [linha] = await fotos.listar(`select=id,caminho&id=eq.${Number(fotoId)}&${dono}=not.is.null`);
  if (!linha) throw naoEncontrado('Foto não encontrada.');
  await fotos.excluir(`id=eq.${linha.id}`);
  await apagarArquivos([linha.caminho]);
  const url = fotosEmCache.get(linha.caminho);
  if (typeof url === 'string') URL.revokeObjectURL(url);
  fotosEmCache.delete(linha.caminho);
  return null;
}

export async function enviarFotosCliente(id, arquivos) {
  const linha = await buscarLinhaCliente(id);
  await enviarFotos('cliente_id', linha.id, arquivos);
  return (await buscarCliente(linha.id)).fotos;
}

export const excluirFotoCliente = (fotoId) => excluirFoto(fotoId, 'cliente_id');

// =============================================================
// Veículos
// =============================================================

async function buscarLinhaVeiculo(id) {
  const [linha] = await veiculos.listar(`select=*&id=eq.${Number(id)}`);
  if (!linha) throw naoEncontrado('Veículo não encontrado.');
  return linha;
}

/** A placa é única no sistema inteiro. Devolve a impressão digital da placa. */
async function conferirPlaca(placa, idAtual = 0) {
  const digital = await indice(exigirChaves(), `placa:${placa}`);
  const [existente] = await veiculos.listar(`select=id,cliente_id&placa_indice=eq.${digital}&id=neq.${idAtual}`);
  if (existente) {
    const dono = await abrirCliente(await buscarLinhaCliente(existente.cliente_id)).catch(() => null);
    throw new ErroApi('Esta placa já está cadastrada.', 409, {
      placa: dono ? `Placa já cadastrada no cliente ${dono.nome}.` : 'Placa já cadastrada.',
    });
  }
  return digital;
}

export async function criarVeiculo(clienteId, dados) {
  const cliente = await buscarLinhaCliente(clienteId);
  const { valores, erros } = validarVeiculo(dados);
  if (temErros(erros)) throw erroValidacao(erros);
  const placa_indice = await conferirPlaca(valores.placa);
  try {
    const linha = await veiculos.inserir({
      cliente_id: cliente.id,
      dados: await cifrarObjeto(exigirChaves(), valores, 'veiculo'),
      placa_indice,
    });
    return { id: linha.id, cliente_id: cliente.id, ...valores, fotos: [] };
  } catch (falha) {
    throw traduzirDuplicado(falha, 'placa', 'Placa já cadastrada.');
  }
}

export async function atualizarVeiculo(id, dados) {
  const linha = await buscarLinhaVeiculo(id);
  const { valores, erros } = validarVeiculo(dados);
  if (temErros(erros)) throw erroValidacao(erros);
  const placa_indice = await conferirPlaca(valores.placa, linha.id);
  try {
    await veiculos.atualizar(`id=eq.${linha.id}`, { dados: await cifrarObjeto(exigirChaves(), valores, 'veiculo'), placa_indice });
  } catch (falha) {
    throw traduzirDuplicado(falha, 'placa', 'Placa já cadastrada.');
  }
  return { id: linha.id, cliente_id: linha.cliente_id, ...valores };
}

export async function excluirVeiculo(id) {
  const linha = await buscarLinhaVeiculo(id);
  const [fotosV, notasV] = await Promise.all([
    fotos.listar(`select=caminho&veiculo_id=eq.${linha.id}`),
    notas.listar(`select=arquivo_caminho&veiculo_id=eq.${linha.id}`),
  ]);
  await veiculos.excluir(`id=eq.${linha.id}`);
  await apagarArquivos([...fotosV.map((f) => f.caminho), ...notasV.map((n) => n.arquivo_caminho)]);
  return null;
}

export async function enviarFotosVeiculo(id, arquivos) {
  const linha = await buscarLinhaVeiculo(id);
  await enviarFotos('veiculo_id', linha.id, arquivos);
  return { id: linha.id };
}

export const excluirFotoVeiculo = (fotoId) => excluirFoto(fotoId, 'veiculo_id');

// =============================================================
// Notas de manutenção
// =============================================================

function comVeiculo(nota, veiculo) {
  const { arquivo_caminho: _caminho, arquivo_ext: _ext, cliente_id: _cliente, ...resto } = nota;
  return { ...resto, placa: veiculo?.placa ?? '', marca: veiculo?.marca ?? '', modelo: veiculo?.modelo ?? '' };
}

async function buscarLinhaNota(id) {
  const [linha] = await notas.listar(`select=*&id=eq.${Number(id)}`);
  if (!linha) throw naoEncontrado('Nota não encontrada.');
  return linha;
}

/** O veículo escolhido precisa existir E pertencer ao cliente da nota */
async function conferirVeiculoDoCliente(veiculoId, clienteId) {
  const [veiculo] = await veiculos.listar(`select=*&id=eq.${Number(veiculoId)}&cliente_id=eq.${Number(clienteId)}`);
  if (!veiculo) throw erroValidacao({ veiculo_id: 'Este veículo não pertence ao cliente.' });
  return abrirVeiculo(veiculo);
}

/** Lê, confere e criptografa o arquivo Word. Devolve { caminho, nome, ext } já enviado. */
async function enviarWord(arquivo) {
  const ext = extensao(arquivo.name);
  if (!TIPOS_WORD[ext]) throw new ErroApi('Só são aceitos arquivos Word (.doc ou .docx).', 400, { arquivo: 'Só são aceitos arquivos Word (.doc ou .docx).' });
  if (arquivo.size > LIMITES.tamanhoWordMB * MB) {
    throw new ErroApi(`O arquivo passa de ${LIMITES.tamanhoWordMB} MB.`, 400, { arquivo: `O arquivo passa de ${LIMITES.tamanhoWordMB} MB.` });
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (!assinaturaConfere(bytes, ext)) {
    throw new ErroApi('Este arquivo não parece ser um Word válido.', 400, { arquivo: 'Este arquivo não parece ser um Word válido.' });
  }
  const caminho = novoCaminho('notas');
  await enviarArquivo(caminho, await cifrarBytes(exigirChaves(), bytes, 'arquivo'));
  return { caminho, nome: montarNomeArquivo(arquivo.name, ext) ?? 'documento' + ext, ext };
}

/** Separa o que vai criptografado da nota */
const conteudoDaNota = (valores, arquivoNome, arquivoExt) => ({
  titulo: valores.titulo,
  data: valores.data,
  descricao: valores.descricao,
  valor_centavos: valores.valor_centavos,
  arquivo_nome: arquivoNome ?? null,
  arquivo_ext: arquivoExt ?? null,
});

async function montarNota(id) {
  const nota = await abrirNota(await buscarLinhaNota(id));
  const veiculo = await abrirVeiculo(await buscarLinhaVeiculo(nota.veiculo_id));
  return comVeiculo(nota, veiculo);
}

/** Cria a nota. "arquivo" é opcional (File do Word). */
export async function criarNota(clienteId, dados, arquivo) {
  const cliente = await buscarLinhaCliente(clienteId);
  const { valores, erros } = validarNota(dados);
  if (temErros(erros)) throw erroValidacao(erros);
  await conferirVeiculoDoCliente(valores.veiculo_id, cliente.id);

  const anexo = arquivo ? await enviarWord(arquivo) : null;
  try {
    const linha = await notas.inserir({
      cliente_id: cliente.id,
      veiculo_id: valores.veiculo_id,
      dados: await cifrarObjeto(exigirChaves(), conteudoDaNota(valores, anexo?.nome, anexo?.ext), 'nota'),
      arquivo_caminho: anexo?.caminho ?? null,
    });
    return montarNota(linha.id);
  } catch (falha) {
    if (anexo) await apagarArquivos([anexo.caminho]);
    throw falha;
  }
}

/** Atualiza só os campos enviados. Ex.: atualizarNota(5, { titulo: 'Novo nome' }) */
export async function atualizarNota(id, dados = {}) {
  const linha = await buscarLinhaNota(id);
  const atual = await abrirNota(linha);
  const { valores, erros } = validarNota({ ...atual, ...dados });

  let arquivoNome = atual.arquivo_nome;
  if (dados.arquivo_nome !== undefined) {
    if (!linha.arquivo_caminho) {
      erros.arquivo_nome = 'Esta nota não tem arquivo anexado.';
    } else {
      const ext = atual.arquivo_ext ?? extensao(atual.arquivo_nome);
      arquivoNome = montarNomeArquivo(dados.arquivo_nome, ext);
      if (!arquivoNome) erros.arquivo_nome = 'Informe um nome válido para o arquivo.';
    }
  }
  if (temErros(erros)) throw erroValidacao(erros);
  const veiculo = await conferirVeiculoDoCliente(valores.veiculo_id, linha.cliente_id);

  await notas.atualizar(`id=eq.${linha.id}`, {
    veiculo_id: valores.veiculo_id,
    dados: await cifrarObjeto(exigirChaves(), conteudoDaNota(valores, arquivoNome, atual.arquivo_ext), 'nota'),
    atualizado_em: agora(),
  });
  return comVeiculo({ ...atual, ...valores, id: linha.id, arquivo_nome: arquivoNome, atualizado_em: agora() }, veiculo);
}

/** Substitui (ou adiciona) o arquivo Word da nota */
export async function substituirArquivoNota(id, arquivo) {
  if (!arquivo) throw new ErroApi('Selecione o novo arquivo Word.', 400);
  const linha = await buscarLinhaNota(id);
  const atual = await abrirNota(linha);
  const anexo = await enviarWord(arquivo);
  try {
    await notas.atualizar(`id=eq.${linha.id}`, {
      dados: await cifrarObjeto(exigirChaves(), conteudoDaNota(atual, anexo.nome, anexo.ext), 'nota'),
      arquivo_caminho: anexo.caminho,
      atualizado_em: agora(),
    });
  } catch (falha) {
    await apagarArquivos([anexo.caminho]);
    throw falha;
  }
  // Só apaga o arquivo antigo depois que o banco já aponta para o novo
  await apagarArquivos([linha.arquivo_caminho]);
  return montarNota(linha.id);
}

export async function excluirNota(id) {
  const linha = await buscarLinhaNota(id);
  await notas.excluir(`id=eq.${linha.id}`);
  await apagarArquivos([linha.arquivo_caminho]);
  return null;
}

/** Baixa o arquivo Word da nota, descriptografa e entrega ao navegador com o nome escolhido */
export async function baixarArquivoNota(id) {
  const linha = await buscarLinhaNota(id);
  if (!linha.arquivo_caminho) throw naoEncontrado('Esta nota não tem arquivo anexado.');
  const nota = await abrirNota(linha);
  const bytes = await decifrarBytes(exigirChaves(), await baixarArquivo(linha.arquivo_caminho), 'arquivo');
  const ext = nota.arquivo_ext ?? extensao(nota.arquivo_nome);
  const url = URL.createObjectURL(new Blob([bytes], { type: TIPOS_WORD[ext] ?? 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nota.arquivo_nome ?? 'documento' + ext;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
