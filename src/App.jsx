// =============================================================
// App: confere o login, monta o layout geral (barra do topo)
// e define as rotas (páginas)
// =============================================================
import { useEffect, useState } from 'react';
import { Routes, Route, Link, NavLink, Outlet } from 'react-router';
import { LogOut, Plus, Users, Wrench } from 'lucide-react';
import { NOME_OFICINA } from './config.js';
import { EVENTO_SESSAO_EXPIRADA, sair, verificarSessao } from './api/servidor.js';
import ListaClientes from './pages/ListaClientes.jsx';
import FormCliente from './pages/FormCliente.jsx';
import DetalhesCliente from './pages/DetalhesCliente.jsx';
import Login from './pages/Login.jsx';
import { Carregando, EstadoVazio } from './components/Estados.jsx';

/** Moldura comum a todas as páginas */
function Layout({ onSair }) {
  return (
    <>
      <header className="topo">
        <div className="topo-conteudo">
          <Link to="/" className="marca">
            <span className="marca-icone" aria-hidden="true">
              <Wrench size={18} strokeWidth={2.4} />
            </span>
            <span className="marca-nome">{NOME_OFICINA}</span>
          </Link>

          <nav className="topo-nav" aria-label="Menu principal">
            <NavLink to="/" end className="topo-link">
              <Users size={16} aria-hidden="true" />
              <span>Clientes</span>
            </NavLink>
            <Link to="/clientes/novo" className="btn btn-primario btn-pequeno">
              <Plus size={16} aria-hidden="true" />
              <span>Novo cliente</span>
            </Link>
            <button type="button" className="topo-link topo-sair" onClick={onSair} title="Sair do sistema">
              <LogOut size={16} aria-hidden="true" />
              <span>Sair</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="pagina">
        {/* O <Outlet> é onde a página da rota atual aparece */}
        <Outlet />
      </main>
    </>
  );
}

function PaginaNaoEncontrada() {
  return (
    <EstadoVazio
      titulo="Página não encontrada"
      texto="O endereço digitado não existe."
      acao={<Link to="/" className="btn btn-primario">Voltar para clientes</Link>}
    />
  );
}

export default function App() {
  // 'verificando' = perguntando ao servidor | 'entrar' = mostrar login | 'logado'
  const [sessao, setSessao] = useState('verificando');

  useEffect(() => {
    // Ao abrir o site, pergunta ao servidor se já existe login válido
    verificarSessao()
      .then(() => setSessao('logado'))
      .catch(() => setSessao('entrar'));

    // Se o login expirar enquanto a pessoa usa o sistema, volta para a tela de login
    const aoExpirar = () => setSessao('entrar');
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
  }, []);

  async function aoSair() {
    await sair().catch(() => {});
    setSessao('entrar');
  }

  if (sessao === 'verificando') return <Carregando texto="Abrindo o sistema…" />;
  if (sessao === 'entrar') return <Login onEntrou={() => setSessao('logado')} />;

  return (
    <Routes>
      <Route element={<Layout onSair={aoSair} />}>
        <Route index element={<ListaClientes />} />
        {/* As "key" diferentes fazem o formulário recomeçar do zero
            ao trocar entre "novo" e "editar" */}
        <Route path="clientes/novo" element={<FormCliente key="novo" />} />
        <Route path="clientes/:id" element={<DetalhesCliente />} />
        <Route path="clientes/:id/editar" element={<FormCliente key="editar" />} />
        <Route path="*" element={<PaginaNaoEncontrada />} />
      </Route>
    </Routes>
  );
}
