// =============================================================
// Criptografia dos dados (feita no navegador, antes de enviar).
//
// O Supabase só recebe dados embaralhados. Sem a senha da oficina
// (ou o código de recuperação), ninguém consegue ler nada:
// nem quem invadir o banco, nem o próprio Supabase.
//
// Como funciona:
// 1. Existe uma "chave mestra" aleatória de 256 bits. É ela que
//    criptografa os clientes, veículos, notas, fotos e arquivos (AES-GCM).
// 2. A chave mestra é guardada no banco TRANCADA duas vezes:
//    - uma cópia trancada pela senha de login;
//    - outra cópia trancada pelo código de recuperação.
//    Para "destrancar", a senha passa pelo PBKDF2 (600 mil rodadas),
//    o que deixa tentativas de adivinhar a senha muito lentas.
// 3. Depois do login, as chaves ficam guardadas neste navegador
//    (IndexedDB) de um jeito que não pode ser copiado nem exportado.
//    Ao clicar em "Sair", elas são apagadas.
//
// Tudo usa a Web Crypto, que já vem no navegador.
// =============================================================

const ITERACOES = 600_000;
const sutil = globalThis.crypto.subtle;
const codificador = new TextEncoder();
const decodificador = new TextDecoder();

// ---------- Base64 ----------
export function paraBase64(bytes) {
  const dados = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let texto = '';
  for (let i = 0; i < dados.length; i += 0x8000) {
    texto += String.fromCharCode(...dados.subarray(i, i + 0x8000));
  }
  return btoa(texto);
}

export function deBase64(texto) {
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

const aleatorio = (tamanho) => globalThis.crypto.getRandomValues(new Uint8Array(tamanho));

// ---------- Chaves derivadas de senha ----------

/** Transforma uma senha (ou o código de recuperação) numa chave AES */
async function chaveDaSenha(senha, sal, iteracoes = ITERACOES) {
  const base = await sutil.importKey('raw', codificador.encode(senha), 'PBKDF2', false, ['deriveKey']);
  return sutil.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Tranca a chave mestra com uma senha. Devolve o que vai para o banco. */
async function trancar(mestra, senha) {
  const sal = aleatorio(16);
  const iv = aleatorio(12);
  const chave = await chaveDaSenha(senha, sal);
  const cifrado = await sutil.encrypt({ name: 'AES-GCM', iv }, chave, mestra);
  return { sal: paraBase64(sal), iteracoes: ITERACOES, chave: paraBase64(juntar(iv, cifrado)) };
}

/** Destranca a chave mestra. Lança erro se a senha estiver errada. */
async function destrancar(trancada, senha) {
  const chave = await chaveDaSenha(senha, deBase64(trancada.sal), trancada.iteracoes);
  const bytes = deBase64(trancada.chave);
  const mestra = await sutil.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, chave, bytes.subarray(12));
  return new Uint8Array(mestra);
}

function juntar(a, b) {
  const resultado = new Uint8Array(a.byteLength + b.byteLength);
  resultado.set(new Uint8Array(a), 0);
  resultado.set(new Uint8Array(b), a.byteLength);
  return resultado;
}

// ---------- Código de recuperação ----------
// 25 caracteres em 5 grupos (ex.: K7M2Q-9XPRT-...). Sem letras que confundem (O/0, I/1).
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function gerarCodigoRecuperacao() {
  const bytes = aleatorio(25);
  const letras = Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
  return letras.match(/.{5}/g).join('-');
}

/** Aceita o código com ou sem traços, maiúsculas ou minúsculas */
export function normalizarCodigo(codigo) {
  return String(codigo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ---------- Chaves de trabalho ----------

/**
 * A partir da chave mestra, cria as duas chaves usadas no dia a dia:
 *  - dados:  criptografa e descriptografa (AES-GCM)
 *  - indice: gera "impressões digitais" de CPF, CNPJ e placa (HMAC),
 *            para o banco impedir duplicados sem saber o número real.
 * As duas são "não exportáveis": nem um script consegue copiá-las.
 */
async function chavesDeTrabalho(mestra) {
  const base = await sutil.importKey('raw', mestra, 'HKDF', false, ['deriveKey']);
  const hkdf = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: codificador.encode(info) });
  const dados = await sutil.deriveKey(hkdf('oficina-dados-v1'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const indice = await sutil.deriveKey(hkdf('oficina-indice-v1'), base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
  return { dados, indice };
}

/** Cria o cofre na primeira vez: chave mestra nova, trancada pela senha e pelo código */
export async function criarCofre(senha) {
  const mestra = aleatorio(32);
  const codigo = gerarCodigoRecuperacao();
  const pelaSenha = await trancar(mestra, senha);
  const peloCodigo = await trancar(mestra, normalizarCodigo(codigo));
  const chaves = await chavesDeTrabalho(mestra);
  mestra.fill(0);
  return {
    codigo,
    chaves,
    registro: {
      sal: pelaSenha.sal,
      iteracoes: pelaSenha.iteracoes,
      chave_senha: pelaSenha.chave,
      sal_recuperacao: peloCodigo.sal,
      iteracoes_recuperacao: peloCodigo.iteracoes,
      chave_recuperacao: peloCodigo.chave,
    },
  };
}

/** Abre o cofre com a senha. Devolve null se a senha não abrir (ex.: senha trocada). */
export async function abrirCofreComSenha(registro, senha) {
  try {
    const mestra = await destrancar({ sal: registro.sal, iteracoes: registro.iteracoes, chave: registro.chave_senha }, senha);
    const chaves = await chavesDeTrabalho(mestra);
    mestra.fill(0);
    return chaves;
  } catch {
    return null;
  }
}

/**
 * Abre o cofre com o código de recuperação e tranca de novo com a senha atual.
 * Devolve { chaves, registro } (registro = campos novos para gravar no banco) ou null.
 */
export async function abrirCofreComCodigo(registro, codigo, senhaNova) {
  let mestra;
  try {
    mestra = await destrancar(
      { sal: registro.sal_recuperacao, iteracoes: registro.iteracoes_recuperacao, chave: registro.chave_recuperacao },
      normalizarCodigo(codigo),
    );
  } catch {
    return null;
  }
  const pelaSenha = await trancar(mestra, senhaNova);
  const chaves = await chavesDeTrabalho(mestra);
  mestra.fill(0);
  return { chaves, registro: { sal: pelaSenha.sal, iteracoes: pelaSenha.iteracoes, chave_senha: pelaSenha.chave } };
}

// ---------- Criptografar e descriptografar ----------
// O "tipo" (cliente, veiculo, nota...) entra como dado adicional autenticado:
// um dado de cliente não pode ser trocado de lugar com o de uma nota sem ser percebido.

export async function cifrarBytes(chaves, bytes, tipo) {
  const iv = aleatorio(12);
  const cifrado = await sutil.encrypt(
    { name: 'AES-GCM', iv, additionalData: codificador.encode(tipo) },
    chaves.dados,
    bytes,
  );
  return juntar(iv, cifrado);
}

export async function decifrarBytes(chaves, bytes, tipo) {
  const dados = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const aberto = await sutil.decrypt(
    { name: 'AES-GCM', iv: dados.subarray(0, 12), additionalData: codificador.encode(tipo) },
    chaves.dados,
    dados.subarray(12),
  );
  return new Uint8Array(aberto);
}

/** Objeto => texto criptografado (base64) */
export async function cifrarObjeto(chaves, objeto, tipo) {
  return paraBase64(await cifrarBytes(chaves, codificador.encode(JSON.stringify(objeto)), tipo));
}

/** Texto criptografado (base64) => objeto */
export async function decifrarObjeto(chaves, texto, tipo) {
  return JSON.parse(decodificador.decode(await decifrarBytes(chaves, deBase64(texto), tipo)));
}

/** "Impressão digital" de um valor (ex.: 'cpf:52998224725'). Mesmo valor = mesma impressão. */
export async function indice(chaves, valor) {
  const assinatura = await sutil.sign('HMAC', chaves.indice, codificador.encode(valor));
  return Array.from(new Uint8Array(assinatura), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Guardar as chaves neste navegador ----------
// O IndexedDB consegue guardar a chave "não exportável" como ela é,
// sem nunca transformar em texto. Assim, recarregar a página não pede a senha de novo.

const NOME_BANCO = 'oficina-cofre';

function abrirBanco() {
  return new Promise((resolver, rejeitar) => {
    const pedido = indexedDB.open(NOME_BANCO, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore('chaves');
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
  });
}

async function operar(modo, acao) {
  const banco = await abrirBanco();
  try {
    return await new Promise((resolver, rejeitar) => {
      const transacao = banco.transaction('chaves', modo);
      const pedido = acao(transacao.objectStore('chaves'));
      transacao.oncomplete = () => resolver(pedido?.result);
      transacao.onerror = () => rejeitar(transacao.error);
    });
  } finally {
    banco.close();
  }
}

export async function guardarChaves(chaves, usuarioId) {
  await operar('readwrite', (loja) => loja.put({ ...chaves, usuarioId }, 'atual'));
}

export async function lerChavesGuardadas() {
  try {
    return (await operar('readonly', (loja) => loja.get('atual'))) ?? null;
  } catch {
    return null;
  }
}

export async function apagarChavesGuardadas() {
  try {
    await operar('readwrite', (loja) => loja.delete('atual'));
  } catch {
    // Se o navegador bloquear o IndexedDB, não há nada guardado
  }
}
