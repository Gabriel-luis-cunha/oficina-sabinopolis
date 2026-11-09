// =============================================================
// Página de detalhes do cliente:
// - dados e fotos do cliente
// - veículos com suas fotos
// - notas de manutenção, da mais recente para a mais antiga
// =============================================================
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ArrowLeft, Camera, Car, ClipboardList, MapPin, MessageCircle, Pencil, Phone, Plus, Trash2,
} from 'lucide-react';
import {
  buscarCliente, enviarFotosCliente, enviarFotosVeiculo, excluirCliente,
  excluirFotoCliente, excluirFotoVeiculo, excluirNota, excluirVeiculo,
} from '../api/servidor.js';
import { useAviso } from '../components/Aviso.jsx';
import { Carregando, ErroCarregar, EstadoVazio } from '../components/Estados.jsx';
import Galeria from '../components/Galeria.jsx';
import { BotaoEnviarFotos } from '../components/UploadFotos.jsx';
import Modal from '../components/Modal.jsx';
import ModalConfirmacao from '../components/ModalConfirmacao.jsx';
import FormVeiculo from '../components/FormVeiculo.jsx';
import FormNota from '../components/FormNota.jsx';
import CartaoNota from '../components/CartaoNota.jsx';
import Placa from '../components/Placa.jsx';
import {
  formatarData, formatarDocumento, formatarMoeda, formatarPlaca, iniciais, mascaraCep, mascaraTelefone, somenteDigitos,
} from '../utils/mascaras.js';

/** Junta as partes do endereço numa linha só, ignorando as vazias */
function enderecoEmLinha(c) {
  const ruaNumero = [c.rua, c.numero].filter(Boolean).join(', ');
  const primeira = [ruaNumero, c.complemento].filter(Boolean).join(' – ');
  const cidadeUf = [c.cidade, c.estado].filter(Boolean).join('/');
  return [primeira, c.bairro, cidadeUf, c.cep && `CEP ${mascaraCep(c.cep)}`].filter(Boolean).join(' · ');
}

/** Plural simples: plural(2, 'nota', 'notas') => "2 notas" */
function plural(n, singular, varios) {
  return `${n} ${n === 1 ? singular : varios}`;
}

function CartaoVeiculo({ veiculo, totalNotas, onEditar, onExcluir, onEnviarFotos, onRemoverFoto }) {
  const detalhes = [veiculo.ano, veiculo.cor].filter(Boolean).join(' · ');
  return (
    <article className="veiculo">
      <div className="veiculo-topo">
        <Placa placa={veiculo.placa} />
        <div className="veiculo-acoes">
          <button type="button" className="btn-icone" onClick={onEditar} aria-label={`Editar veículo ${veiculo.placa}`} title="Editar veículo">
            <Pencil size={16} />
          </button>
          <button type="button" className="btn-icone btn-icone-perigo" onClick={onExcluir} aria-label={`Excluir veículo ${veiculo.placa}`} title="Excluir veículo">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <h3 className="veiculo-nome">{veiculo.marca} {veiculo.modelo}</h3>
      <p className="veiculo-detalhes">
        {detalhes && <span>{detalhes}</span>}
        <span>{plural(totalNotas, 'manutenção', 'manutenções')}</span>
      </p>

      <Galeria fotos={veiculo.fotos} onRemover={onRemoverFoto} tamanho="pequena" />
      <BotaoEnviarFotos onEnviar={onEnviarFotos} rotulo={veiculo.fotos.length ? 'Mais fotos' : 'Adicionar fotos'} className="btn btn-fantasma btn-pequeno" />
    </article>
  );
}

export default function DetalhesCliente() {
  const { id } = useParams();
  const navegar = useNavigate();
  const aviso = useAviso();

  const [cliente, setCliente] = useState(null);
  const [erro, setErro] = useState('');
  const [filtroVeiculo, setFiltroVeiculo] = useState('');
  // Formulários abertos em modal: null = fechado
  const [formVeiculo, setFormVeiculo] = useState(null); // { veiculo?: {...} }
  const [formNota, setFormNota] = useState(null); // { nota?: {...} }
  const [modalOcupado, setModalOcupado] = useState(false);
  // O que está esperando confirmação de exclusão: { tipo, item }
  const [confirmar, setConfirmar] = useState(null);

  // Busca os dados do cliente no servidor. É chamada de novo depois de cada alteração.
  const recarregar = useCallback(async () => {
    try {
      setCliente(await buscarCliente(id));
      setErro('');
    } catch (falha) {
      setErro(falha.message);
    }
  }, [id]);

  useEffect(() => {
    setCliente(null);
    recarregar();
  }, [recarregar]);

  if (erro && !cliente) return <ErroCarregar mensagem={erro} onTentarDeNovo={recarregar} />;
  if (!cliente) return <Carregando texto="Carregando cliente…" />;

  const notasFiltradas = filtroVeiculo
    ? cliente.notas.filter((n) => n.veiculo_id === Number(filtroVeiculo))
    : cliente.notas;
  const totalGasto = notasFiltradas.reduce((soma, n) => soma + n.valor_centavos, 0);
  const notasPorVeiculo = (veiculoId) => cliente.notas.filter((n) => n.veiculo_id === veiculoId).length;
  const telefone = somenteDigitos(cliente.telefone);
  const endereco = enderecoEmLinha(cliente);

  /** Atualiza uma nota na tela sem buscar tudo de novo (usado ao renomear) */
  function trocarNota(notaAtualizada) {
    setCliente((atual) => ({
      ...atual,
      notas: atual.notas.map((n) => (n.id === notaAtualizada.id ? notaAtualizada : n)),
    }));
  }

  /** Executa uma ação, mostra o aviso e recarrega os dados */
  async function executar(acao, mensagemSucesso) {
    try {
      await acao();
      aviso.sucesso(mensagemSucesso);
      await recarregar();
      return true;
    } catch (falha) {
      aviso.erro(falha.message);
      return false;
    }
  }

  // Textos e ações de cada tipo de exclusão
  const exclusoes = {
    cliente: {
      titulo: 'Excluir cliente?',
      mensagem: () => (
        <>
          <p><strong>{cliente.nome}</strong> será excluído com todos os veículos, fotos e notas de manutenção.</p>
          <p className="texto-apagado">Essa ação não pode ser desfeita.</p>
        </>
      ),
      botao: 'Excluir cliente',
      acao: async () => {
        try {
          await excluirCliente(cliente.id);
          aviso.sucesso(`${cliente.nome} foi excluído.`);
          navegar('/');
        } catch (falha) {
          aviso.erro(falha.message);
        }
      },
    },
    veiculo: {
      titulo: 'Excluir veículo?',
      mensagem: (v) => {
        const n = notasPorVeiculo(v.id);
        return (
          <>
            <p>
              O veículo <strong>{formatarPlaca(v.placa)} · {v.marca} {v.modelo}</strong> será excluído com as fotos
              {n > 0 && <> e <strong>{plural(n, 'nota de manutenção', 'notas de manutenção')}</strong></>}.
            </p>
            <p className="texto-apagado">Essa ação não pode ser desfeita.</p>
          </>
        );
      },
      botao: 'Excluir veículo',
      acao: (v) => executar(() => excluirVeiculo(v.id), 'Veículo excluído.'),
    },
    nota: {
      titulo: 'Excluir nota?',
      mensagem: (n) => (
        <p>A nota <strong>{n.titulo}</strong>{n.arquivo_nome && ' e o arquivo anexado'} serão excluídos definitivamente.</p>
      ),
      botao: 'Excluir nota',
      acao: (n) => executar(() => excluirNota(n.id), 'Nota excluída.'),
    },
    fotoCliente: {
      titulo: 'Remover foto?',
      mensagem: () => <p>A foto será apagada definitivamente.</p>,
      botao: 'Remover foto',
      acao: (f) => executar(() => excluirFotoCliente(f.id), 'Foto removida.'),
    },
    fotoVeiculo: {
      titulo: 'Remover foto?',
      mensagem: () => <p>A foto do veículo será apagada definitivamente.</p>,
      botao: 'Remover foto',
      acao: (f) => executar(() => excluirFotoVeiculo(f.id), 'Foto removida.'),
    },
  };
  const exclusao = confirmar ? exclusoes[confirmar.tipo] : null;

  return (
    <>
      <Link to="/" className="link-voltar">
        <ArrowLeft size={16} aria-hidden="true" /> Clientes
      </Link>

      {/* ---------- Ficha do cliente ---------- */}
      <section className="ficha">
        {cliente.fotos[0] ? (
          <img src={cliente.fotos[0].url} alt="" className="avatar avatar-grande" />
        ) : (
          <span className="avatar avatar-grande avatar-iniciais" aria-hidden="true">{iniciais(cliente.nome)}</span>
        )}

        <div className="ficha-dados">
          <h1 className="ficha-nome">{cliente.nome}</h1>
          {formatarDocumento(cliente) && <p className="ficha-cpf mono">{formatarDocumento(cliente)}</p>}

          <div className="ficha-contatos">
            {telefone && (
              <>
                <a href={`tel:+55${telefone}`} className="chip">
                  <Phone size={14} aria-hidden="true" /> {mascaraTelefone(telefone)}
                </a>
                {telefone.length === 11 && (
                  <a href={`https://wa.me/55${telefone}`} target="_blank" rel="noreferrer" className="chip">
                    <MessageCircle size={14} aria-hidden="true" /> WhatsApp
                  </a>
                )}
              </>
            )}
            {endereco && (
              <span className="chip chip-texto">
                <MapPin size={14} aria-hidden="true" /> {endereco}
              </span>
            )}
          </div>
        </div>

        <div className="ficha-acoes">
          <Link to={`/clientes/${cliente.id}/editar`} className="btn btn-secundario">
            <Pencil size={16} aria-hidden="true" /> Editar
          </Link>
          <button type="button" className="btn btn-fantasma-perigo" onClick={() => setConfirmar({ tipo: 'cliente', item: cliente })}>
            <Trash2 size={16} aria-hidden="true" /> Excluir
          </button>
        </div>
      </section>

      <div className="detalhes-colunas">
        {/* ---------- Coluna da esquerda: veículos e fotos ---------- */}
        <div className="detalhes-lateral">
          <section className="painel">
            <header className="painel-cabecalho">
              <h2 className="secao-titulo">
                <Car size={18} aria-hidden="true" /> Veículos
                <span className="contagem">{cliente.veiculos.length}</span>
              </h2>
              <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => setFormVeiculo({})}>
                <Plus size={15} aria-hidden="true" /> Adicionar
              </button>
            </header>

            {cliente.veiculos.length === 0 ? (
              <EstadoVazio compacto icone={Car} titulo="Nenhum veículo" texto="Cadastre o veículo para registrar as manutenções." />
            ) : (
              <div className="lista-veiculos">
                {cliente.veiculos.map((veiculo) => (
                  <CartaoVeiculo
                    key={veiculo.id}
                    veiculo={veiculo}
                    totalNotas={notasPorVeiculo(veiculo.id)}
                    onEditar={() => setFormVeiculo({ veiculo })}
                    onExcluir={() => setConfirmar({ tipo: 'veiculo', item: veiculo })}
                    onEnviarFotos={(arquivos) => executar(() => enviarFotosVeiculo(veiculo.id, arquivos), 'Fotos enviadas.')}
                    onRemoverFoto={(foto) => setConfirmar({ tipo: 'fotoVeiculo', item: foto })}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="painel">
            <header className="painel-cabecalho">
              <h2 className="secao-titulo">
                <Camera size={18} aria-hidden="true" /> Fotos do cliente
                <span className="contagem">{cliente.fotos.length}</span>
              </h2>
              <BotaoEnviarFotos
                rotulo="Adicionar"
                onEnviar={(arquivos) => executar(() => enviarFotosCliente(cliente.id, arquivos), 'Fotos enviadas.')}
              />
            </header>
            {cliente.fotos.length === 0 ? (
              <EstadoVazio compacto icone={Camera} titulo="Nenhuma foto" />
            ) : (
              <Galeria fotos={cliente.fotos} onRemover={(foto) => setConfirmar({ tipo: 'fotoCliente', item: foto })} />
            )}
          </section>
        </div>

        {/* ---------- Coluna principal: notas de manutenção ---------- */}
        <section className="painel painel-notas">
          <header className="painel-cabecalho">
            <div>
              <h2 className="secao-titulo">
                <ClipboardList size={18} aria-hidden="true" /> Notas de manutenção
                <span className="contagem">{cliente.notas.length}</span>
              </h2>
              {notasFiltradas.length > 0 && (
                <p className="painel-resumo">
                  Total <strong className="mono">{formatarMoeda(totalGasto)}</strong>
                  {' · '}último serviço em {formatarData(notasFiltradas[0].data)}
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn btn-primario btn-pequeno"
              onClick={() => setFormNota({})}
              disabled={cliente.veiculos.length === 0}
              title={cliente.veiculos.length === 0 ? 'Cadastre um veículo primeiro' : undefined}
            >
              <Plus size={15} aria-hidden="true" /> Nova nota
            </button>
          </header>

          {cliente.veiculos.length > 1 && cliente.notas.length > 0 && (
            <div className="filtro-veiculos" role="group" aria-label="Filtrar notas por veículo">
              <button type="button" className={`filtro ${filtroVeiculo === '' ? 'filtro-ativo' : ''}`} onClick={() => setFiltroVeiculo('')}>
                Todos
              </button>
              {cliente.veiculos.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`filtro ${filtroVeiculo === String(v.id) ? 'filtro-ativo' : ''}`}
                  onClick={() => setFiltroVeiculo(String(v.id))}
                >
                  {formatarPlaca(v.placa)}
                </button>
              ))}
            </div>
          )}

          {cliente.veiculos.length === 0 ? (
            <EstadoVazio icone={ClipboardList} titulo="Ainda não há notas" texto="Cadastre um veículo para poder registrar as manutenções." />
          ) : notasFiltradas.length === 0 ? (
            <EstadoVazio
              icone={ClipboardList}
              titulo={filtroVeiculo ? 'Nenhuma nota para este veículo' : 'Ainda não há notas'}
              texto="Registre cada serviço feito, com valor e o orçamento em Word."
              acao={
                <button type="button" className="btn btn-primario" onClick={() => setFormNota({})}>
                  <Plus size={16} aria-hidden="true" /> Registrar a primeira nota
                </button>
              }
            />
          ) : (
            <div className="lista-notas">
              {notasFiltradas.map((nota) => (
                <CartaoNota
                  key={nota.id}
                  nota={nota}
                  onAtualizada={trocarNota}
                  onEditar={(n) => setFormNota({ nota: n })}
                  onExcluir={(n) => setConfirmar({ tipo: 'nota', item: n })}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ---------- Modais ---------- */}
      <Modal
        aberto={Boolean(formVeiculo)}
        titulo={formVeiculo?.veiculo ? 'Editar veículo' : 'Novo veículo'}
        descricao={cliente.nome}
        onFechar={() => setFormVeiculo(null)}
        bloqueado={modalOcupado}
      >
        {formVeiculo && (
          <FormVeiculo
            clienteId={cliente.id}
            veiculo={formVeiculo.veiculo}
            onSalvandoMudou={setModalOcupado}
            onCancelar={() => setFormVeiculo(null)}
            onSalvo={() => {
              setFormVeiculo(null);
              recarregar();
            }}
          />
        )}
      </Modal>

      <Modal
        aberto={Boolean(formNota)}
        titulo={formNota?.nota ? 'Editar nota de manutenção' : 'Nova nota de manutenção'}
        descricao={cliente.nome}
        onFechar={() => setFormNota(null)}
        bloqueado={modalOcupado}
        largura="grande"
      >
        {formNota && (
          <FormNota
            clienteId={cliente.id}
            veiculos={cliente.veiculos}
            nota={formNota.nota}
            onSalvandoMudou={setModalOcupado}
            onCancelar={() => setFormNota(null)}
            onSalvo={() => {
              setFormNota(null);
              recarregar();
            }}
          />
        )}
      </Modal>

      <ModalConfirmacao
        aberto={Boolean(confirmar)}
        titulo={exclusao?.titulo}
        mensagem={exclusao?.mensagem(confirmar?.item)}
        textoConfirmar={exclusao?.botao}
        textoProcessando={confirmar?.tipo?.startsWith('foto') ? 'Removendo…' : 'Excluindo…'}
        onConfirmar={async () => {
          await exclusao.acao(confirmar.item);
          setConfirmar(null);
        }}
        onCancelar={() => setConfirmar(null)}
      />
    </>
  );
}
