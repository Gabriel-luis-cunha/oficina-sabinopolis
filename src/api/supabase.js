// =============================================================
// Conversa com o Supabase (login, banco e arquivos) usando fetch.
// Não usa a biblioteca oficial: são só três "portas" HTTP:
//   /auth/v1     login e renovação do login
//   /rest/v1     tabelas do banco
//   /storage/v1  arquivos (fotos e documentos Word, já criptografados)
// =============================================================
import { SUPABASE_CHAVE, SUPABASE_URL } from '../config.js';

/** Erro com a mensagem para mostrar, o código HTTP e os erros por campo */
export class ErroApi extends Error {
  constructor(mensagem, status = 0, erros = {}, codigo = '') {
    super(mensagem);
    this.status = status;
    this.erros = erros;
    this.codigo = codigo;
  }
}

/** Disparado quando o login expira; o App volta para a tela de login */
export const EVENTO_SESSAO_EXPIRADA = 'oficina:sessao-expirada';

const CHAVE_SESSAO = 'oficina-sessao';
// Igual ao sistema antigo: depois de 7 dias, pede a senha de novo
const DURACAO_MAXIMA_MS = 7 * 24 * 60 * 60 * 1000;

export const supabaseConfigurado = () =>
  /^https:\/\/.+/.test(SUPABASE_URL) && SUPABASE_CHAVE.startsWith('sb_publishable_');

// ---------- Sessão (tokens do login) ----------

function lerSessao() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_SESSAO) ?? 'null');
  } catch {
    return null;
  }
}

function gravarSessao(resposta, entrouEm) {
  const sessao = {
    access_token: resposta.access_token,
    refresh_token: resposta.refresh_token,
    expira_em: Date.now() + (resposta.expires_in ?? 3600) * 1000,
    usuario_id: resposta.user?.id,
    email: resposta.user?.email,
    entrou_em: entrouEm ?? Date.now(),
  };
  try {
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
  } catch {
    // Sem localStorage o login vale só enquanto a página estiver aberta
  }
  sessaoNaMemoria = sessao;
  return sessao;
}

let sessaoNaMemoria = null;
let renovando = null;

export function apagarSessao() {
  sessaoNaMemoria = null;
  try {
    localStorage.removeItem(CHAVE_SESSAO);
  } catch {
    // nada a fazer
  }
}

export function sessaoAtual() {
  const sessao = sessaoNaMemoria ?? lerSessao();
  if (!sessao) return null;
  if (Date.now() - sessao.entrou_em > DURACAO_MAXIMA_MS) {
    apagarSessao();
    return null;
  }
  sessaoNaMemoria = sessao;
  return sessao;
}

function expirou() {
  apagarSessao();
  window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA));
  return new ErroApi('Seu login expirou. Entre de novo.', 401);
}

/** Devolve um token válido, renovando quando está perto de vencer */
async function tokenValido() {
  const sessao = sessaoAtual();
  if (!sessao) throw expirou();
  if (sessao.expira_em - Date.now() > 60_000) return sessao.access_token;

  // Várias chamadas ao mesmo tempo esperam a mesma renovação
  renovando ??= (async () => {
    try {
      const resposta = await chamarAuth('token?grant_type=refresh_token', { refresh_token: sessao.refresh_token });
      return gravarSessao(resposta, sessao.entrou_em).access_token;
    } catch {
      throw expirou();
    } finally {
      renovando = null;
    }
  })();
  return renovando;
}

// ---------- Auth ----------

async function chamarAuth(caminho, corpo) {
  let resposta;
  try {
    resposta = await fetch(`${SUPABASE_URL}/auth/v1/${caminho}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_CHAVE, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
  } catch {
    throw new ErroApi('Sem conexão com a internet. Confira e tente de novo.', 0);
  }
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const codigo = dados.error_code ?? dados.error ?? '';
    const mensagem = /invalid/i.test(codigo + ' ' + (dados.msg ?? dados.error_description ?? ''))
      ? 'Usuário ou senha incorretos.'
      : 'Não foi possível entrar agora. Tente de novo em instantes.';
    throw new ErroApi(mensagem, resposta.status, {}, codigo);
  }
  return dados;
}

export async function loginSupabase(email, senha) {
  const resposta = await chamarAuth('token?grant_type=password', { email: email.trim().toLowerCase(), password: senha });
  return gravarSessao(resposta);
}

export async function logoutSupabase() {
  const sessao = sessaoAtual();
  apagarSessao();
  if (!sessao) return;
  await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: { apikey: SUPABASE_CHAVE, Authorization: `Bearer ${sessao.access_token}` },
  }).catch(() => {});
}

// ---------- Chamadas autenticadas ----------

async function chamar(url, opcoes = {}) {
  const token = await tokenValido();
  let resposta;
  try {
    resposta = await fetch(url, {
      ...opcoes,
      headers: { apikey: SUPABASE_CHAVE, Authorization: `Bearer ${token}`, ...opcoes.headers },
    });
  } catch {
    throw new ErroApi('Sem conexão com a internet. Confira e tente de novo.', 0);
  }
  if (resposta.status === 401) throw expirou();
  return resposta;
}

async function erroDaResposta(resposta) {
  const dados = await resposta.json().catch(() => ({}));
  const codigo = String(dados.code ?? dados.error ?? dados.statusCode ?? '');
  if (codigo === '23505') return new ErroApi('Já existe um cadastro com esses dados.', 409, {}, codigo);
  if (resposta.status === 403 || codigo === '42501') {
    return new ErroApi('Sem permissão. Confira se você entrou com o usuário da oficina.', 403, {}, codigo);
  }
  return new ErroApi('Algo deu errado ao falar com o banco. Tente novamente.', resposta.status, {}, codigo);
}

/**
 * Acesso às tabelas (PostgREST).
 * Ex.: tabela('clientes').listar('select=id,dados&order=id')
 */
export function tabela(nome) {
  const base = `${SUPABASE_URL}/rest/v1/${nome}`;
  const json = { 'Content-Type': 'application/json', Prefer: 'return=representation' };

  return {
    async listar(filtros = 'select=*') {
      const resposta = await chamar(`${base}?${filtros}`);
      if (!resposta.ok) throw await erroDaResposta(resposta);
      return resposta.json();
    },
    async inserir(linha) {
      const resposta = await chamar(base, { method: 'POST', headers: json, body: JSON.stringify(linha) });
      if (!resposta.ok) throw await erroDaResposta(resposta);
      return (await resposta.json())[0];
    },
    async inserirVarias(linhas) {
      const resposta = await chamar(base, { method: 'POST', headers: json, body: JSON.stringify(linhas) });
      if (!resposta.ok) throw await erroDaResposta(resposta);
      return resposta.json();
    },
    async atualizar(filtros, valores) {
      const resposta = await chamar(`${base}?${filtros}`, { method: 'PATCH', headers: json, body: JSON.stringify(valores) });
      if (!resposta.ok) throw await erroDaResposta(resposta);
      return (await resposta.json())[0] ?? null;
    },
    async excluir(filtros) {
      const resposta = await chamar(`${base}?${filtros}`, { method: 'DELETE' });
      if (!resposta.ok) throw await erroDaResposta(resposta);
    },
  };
}

// ---------- Arquivos (Storage) ----------
const BALDE = 'arquivos';

export async function enviarArquivo(caminho, bytes) {
  const resposta = await chamar(`${SUPABASE_URL}/storage/v1/object/${BALDE}/${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': 'false' },
    body: bytes,
  });
  if (!resposta.ok) throw await erroDaResposta(resposta);
}

export async function baixarArquivo(caminho) {
  const resposta = await chamar(`${SUPABASE_URL}/storage/v1/object/authenticated/${BALDE}/${caminho}`);
  if (!resposta.ok) throw new ErroApi('O arquivo não foi encontrado.', resposta.status);
  return new Uint8Array(await resposta.arrayBuffer());
}

export async function apagarArquivos(caminhos) {
  const lista = caminhos.filter(Boolean);
  if (lista.length === 0) return;
  // Se falhar, o arquivo fica "órfão" no Storage, mas continua ilegível (criptografado)
  await chamar(`${SUPABASE_URL}/storage/v1/object/${BALDE}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: lista }),
  }).catch(() => {});
}
