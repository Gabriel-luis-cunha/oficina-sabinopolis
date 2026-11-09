// =============================================================
// Tela de login. Aparece antes de qualquer outra página.
//
// Três momentos possíveis:
//  - 'entrar':      e-mail e senha
//  - 'novo-cofre':  primeiro acesso de todos. Mostra o código de
//                   recuperação, que precisa ser anotado.
//  - 'recuperar':   a senha foi trocada no Supabase e não abre mais
//                   os dados. Pede o código de recuperação uma vez.
// =============================================================
import { useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, LogIn, ShieldCheck, Wrench } from 'lucide-react';
import { entrar, recuperarComCodigo } from '../api/servidor.js';
import { NOME_OFICINA } from '../config.js';
import Campo from '../components/Campo.jsx';

export default function Login({ onEntrou }) {
  const [etapa, setEtapa] = useState('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [codigoNovo, setCodigoNovo] = useState('');
  const [anotou, setAnotou] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function enviarLogin(evento) {
    evento.preventDefault();
    const encontrados = {};
    if (!email.trim()) encontrados.email = 'Informe o e-mail.';
    if (!senha) encontrados.senha = 'Informe a senha.';
    setErros(encontrados);
    setErroGeral('');
    if (Object.keys(encontrados).length > 0) {
      document.getElementById('campo-' + Object.keys(encontrados)[0])?.focus();
      return;
    }

    setOcupado(true);
    try {
      const resultado = await entrar(email, senha);
      if (resultado.estado === 'novo-cofre') {
        setCodigoNovo(resultado.codigo);
        setEtapa('novo-cofre');
      } else if (resultado.estado === 'precisa-codigo') {
        setEtapa('recuperar');
      } else {
        onEntrou();
      }
    } catch (falha) {
      setErroGeral(falha.message);
      setSenha('');
      document.getElementById('campo-senha')?.focus();
    } finally {
      setOcupado(false);
    }
  }

  async function enviarCodigo(evento) {
    evento.preventDefault();
    setErroGeral('');
    if (!codigo.trim()) {
      setErros({ codigo: 'Digite o código de recuperação.' });
      return;
    }
    setOcupado(true);
    try {
      await recuperarComCodigo(codigo);
      onEntrou();
    } catch (falha) {
      setErros(falha.erros ?? {});
      if (!falha.erros?.codigo) setErroGeral(falha.message);
    } finally {
      setOcupado(false);
    }
  }

  async function copiarCodigo() {
    try {
      await navigator.clipboard.writeText(codigoNovo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão para copiar: a pessoa anota à mão
    }
  }

  return (
    <main className="login">
      <div className="login-caixa">
        <div className="login-marca">
          <span className="marca-icone" aria-hidden="true">
            <Wrench size={18} strokeWidth={2.4} />
          </span>
          <span className="marca-nome">{NOME_OFICINA}</span>
        </div>

        {etapa === 'entrar' && (
          <form className="login-cartao" onSubmit={enviarLogin} noValidate>
            <div className="login-cabecalho">
              <span className="login-cadeado" aria-hidden="true">
                <LockKeyhole size={20} />
              </span>
              <h1 className="login-titulo">Acesso restrito</h1>
              <p className="login-texto">Entre com o e-mail e a senha da oficina.</p>
            </div>

            {erroGeral && <p className="login-erro" role="alert">{erroGeral}</p>}

            <Campo
              nome="email"
              rotulo="E-mail"
              type="email"
              value={email}
              erro={erros.email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              inputMode="email"
              autoFocus
            />

            <div className="campo-senha">
              <Campo
                nome="senha"
                rotulo="Senha"
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                erro={erros.senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="btn-icone campo-senha-olho"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-label={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}
                title={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}
              >
                {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button type="submit" className="btn btn-primario login-botao" disabled={ocupado}>
              {ocupado ? <Loader2 size={16} className="girando" aria-hidden="true" /> : <LogIn size={16} aria-hidden="true" />}
              {ocupado ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        )}

        {etapa === 'novo-cofre' && (
          <div className="login-cartao">
            <div className="login-cabecalho">
              <span className="login-cadeado" aria-hidden="true">
                <ShieldCheck size={20} />
              </span>
              <h1 className="login-titulo">Código de recuperação</h1>
              <p className="login-texto">
                Os dados da oficina são criptografados com a sua senha. Se a senha for esquecida ou trocada,
                <strong> só este código</strong> devolve o acesso. Sem ele, os dados ficam perdidos para sempre.
              </p>
            </div>

            <div className="codigo-recuperacao">
              <code className="mono">{codigoNovo}</code>
              <button type="button" className="btn btn-secundario btn-pequeno" onClick={copiarCodigo}>
                {copiado ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>

            <p className="login-texto">
              Anote no papel e guarde num lugar seguro, longe do computador. Não envie por WhatsApp nem e-mail.
            </p>

            <label className="caixa-marcar">
              <input type="checkbox" checked={anotou} onChange={(e) => setAnotou(e.target.checked)} />
              <span>Anotei o código e guardei em lugar seguro.</span>
            </label>

            <button type="button" className="btn btn-primario login-botao" disabled={!anotou} onClick={onEntrou}>
              <LogIn size={16} aria-hidden="true" /> Entrar no sistema
            </button>
          </div>
        )}

        {etapa === 'recuperar' && (
          <form className="login-cartao" onSubmit={enviarCodigo} noValidate>
            <div className="login-cabecalho">
              <span className="login-cadeado" aria-hidden="true">
                <KeyRound size={20} />
              </span>
              <h1 className="login-titulo">Senha nova detectada</h1>
              <p className="login-texto">
                A senha entrou, mas ainda não abre os dados criptografados (ela foi trocada).
                Digite o código de recuperação uma vez para liberar a senha nova.
              </p>
            </div>

            {erroGeral && <p className="login-erro" role="alert">{erroGeral}</p>}

            <Campo
              nome="codigo"
              rotulo="Código de recuperação"
              value={codigo}
              erro={erros.codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              className="mono"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
              autoFocus
            />

            <button type="submit" className="btn btn-primario login-botao" disabled={ocupado}>
              {ocupado ? <Loader2 size={16} className="girando" aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
              {ocupado ? 'Conferindo…' : 'Liberar acesso'}
            </button>
            <button type="button" className="link-botao" onClick={() => { setEtapa('entrar'); setErros({}); setErroGeral(''); }}>
              Voltar
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
