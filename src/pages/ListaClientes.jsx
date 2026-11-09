// =============================================================
// Página inicial: lista de clientes com busca.
// O texto da busca fica na URL (?busca=...). Assim, ao abrir um
// cliente e voltar, a busca continua lá.
// =============================================================
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { listarClientes, excluirCliente } from '../api/servidor.js';
import { useAviso } from '../components/Aviso.jsx';
import { ErroCarregar, EstadoVazio } from '../components/Estados.jsx';
import ModalConfirmacao from '../components/ModalConfirmacao.jsx';
import Placa from '../components/Placa.jsx';
import { formatarDocumento, iniciais, mascaraTelefone } from '../utils/mascaras.js';

/** Esqueleto cinza mostrado enquanto a lista carrega */
function LinhasCarregando() {
  return (
    <div className="lista-clientes" aria-hidden="true">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="cliente-linha cliente-linha-esqueleto">
          <span className="esqueleto esqueleto-avatar" />
          <span className="esqueleto esqueleto-texto" />
          <span className="esqueleto esqueleto-texto curto" />
        </div>
      ))}
    </div>
  );
}

/** Monta a frase "os 2 veículos, as fotos e as 5 notas" para a confirmação */
function oQueSaiJunto(cliente) {
  const partes = [];
  const veiculos = cliente.placas.length;
  if (veiculos === 1) partes.push('o veículo');
  if (veiculos > 1) partes.push(`os ${veiculos} veículos`);
  partes.push('as fotos');
  if (cliente.total_notas === 1) partes.push('a nota de manutenção');
  if (cliente.total_notas > 1) partes.push(`as ${cliente.total_notas} notas de manutenção`);
  return partes.length === 1 ? partes[0] : partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1];
}

export default function ListaClientes() {
  const [parametros, setParametros] = useSearchParams();
  const busca = parametros.get('busca') ?? '';
  const [texto, setTexto] = useState(busca);
  const [clientes, setClientes] = useState(null); // null = ainda carregando
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [paraExcluir, setParaExcluir] = useState(null);
  const aviso = useAviso();
  const navegar = useNavigate();

  // Espera o usuário parar de digitar por 300 ms antes de buscar ("debounce").
  // Isso evita uma consulta ao servidor a cada letra.
  useEffect(() => {
    if (texto.trim() === busca) return undefined;
    const temporizador = setTimeout(() => {
      setParametros(texto.trim() ? { busca: texto.trim() } : {}, { replace: true });
    }, 300);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  // Busca os clientes sempre que o termo da URL mudar
  useEffect(() => {
    let ativo = true; // evita atualizar a tela com uma resposta antiga
    setErro('');
    listarClientes(busca)
      .then((lista) => ativo && setClientes(lista))
      .catch((falha) => ativo && setErro(falha.message));
    return () => {
      ativo = false;
    };
  }, [busca, tentativa]);

  async function confirmarExclusao() {
    try {
      await excluirCliente(paraExcluir.id);
      setClientes((lista) => lista.filter((c) => c.id !== paraExcluir.id));
      aviso.sucesso(`${paraExcluir.nome} foi excluído.`);
      setParaExcluir(null);
    } catch (falha) {
      aviso.erro(falha.message);
    }
  }

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <p className="sobretitulo">Cadastro</p>
          <h1 className="titulo-pagina">Clientes</h1>
        </div>
        {clientes && clientes.length > 0 && (
          <p className="contador">
            {clientes.length} {clientes.length === 1 ? 'cliente' : 'clientes'}
            {busca && ' encontrados'}
          </p>
        )}
      </div>

      <div className="busca">
        <Search size={18} className="busca-icone" aria-hidden="true" />
        <input
          type="search"
          className="busca-entrada"
          placeholder="Buscar por nome, CPF, CNPJ ou placa"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          aria-label="Buscar clientes por nome, CPF, CNPJ ou placa"
        />
        {texto && (
          <button type="button" className="btn-icone busca-limpar" onClick={() => setTexto('')} aria-label="Limpar busca">
            <X size={16} />
          </button>
        )}
      </div>

      {erro ? (
        <ErroCarregar mensagem={erro} onTentarDeNovo={() => setTentativa((n) => n + 1)} />
      ) : clientes === null ? (
        <LinhasCarregando />
      ) : clientes.length === 0 ? (
        busca ? (
          <EstadoVazio
            icone={Search}
            titulo={`Nenhum resultado para “${busca}”`}
            texto="Confira se o nome, CPF, CNPJ ou placa foi digitado corretamente."
          />
        ) : (
          <EstadoVazio
            icone={Users}
            titulo="Nenhum cliente cadastrado ainda"
            texto="Cadastre o primeiro cliente para começar a registrar veículos e manutenções."
            acao={
              <Link to="/clientes/novo" className="btn btn-primario">
                <Plus size={16} aria-hidden="true" /> Cadastrar cliente
              </Link>
            }
          />
        )
      ) : (
        <>
          {/* Cabeçalho das colunas: só aparece no computador */}
          <div className="lista-cabecalho" aria-hidden="true">
            <span>Cliente</span>
            <span>Telefone</span>
            <span>Veículos</span>
            <span />
          </div>

          <ul className="lista-clientes">
            {clientes.map((cliente) => (
              <li key={cliente.id} className="cliente-linha">
                <div className="cliente-identidade">
                  {cliente.foto ? (
                    <img src={cliente.foto} alt="" className="avatar" />
                  ) : (
                    <span className="avatar avatar-iniciais" aria-hidden="true">{iniciais(cliente.nome)}</span>
                  )}
                  <div className="cliente-nomes">
                    {/* O link "estica" por cima da linha inteira (veja .link-esticado no CSS) */}
                    <Link to={`/clientes/${cliente.id}`} className="cliente-nome link-esticado">
                      {cliente.nome}
                    </Link>
                    {formatarDocumento(cliente) && <span className="cliente-cpf mono">{formatarDocumento(cliente)}</span>}
                  </div>
                </div>

                <span className="cliente-telefone">
                  {cliente.telefone ? mascaraTelefone(cliente.telefone) : <span className="texto-apagado">Sem telefone</span>}
                </span>

                <span className="cliente-placas">
                  {cliente.placas.length ? (
                    cliente.placas.map((placa) => <Placa key={placa} placa={placa} tamanho="mini" />)
                  ) : (
                    <span className="texto-apagado">Nenhum veículo</span>
                  )}
                </span>

                <span className="cliente-acoes">
                  <button
                    type="button"
                    className="btn-icone"
                    onClick={() => navegar(`/clientes/${cliente.id}/editar`)}
                    aria-label={`Editar ${cliente.nome}`}
                    title="Editar"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn-icone btn-icone-perigo"
                    onClick={() => setParaExcluir(cliente)}
                    aria-label={`Excluir ${cliente.nome}`}
                    title="Excluir"
                  >
                    <Trash2 size={16} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <ModalConfirmacao
        aberto={Boolean(paraExcluir)}
        titulo="Excluir cliente?"
        mensagem={
          paraExcluir && (
            <>
              <p>
                <strong>{paraExcluir.nome}</strong> será excluído junto com {oQueSaiJunto(paraExcluir)}.
              </p>
              <p className="texto-apagado">Essa ação não pode ser desfeita.</p>
            </>
          )
        }
        textoConfirmar="Excluir cliente"
        onConfirmar={confirmarExclusao}
        onCancelar={() => setParaExcluir(null)}
      />
    </>
  );
}
