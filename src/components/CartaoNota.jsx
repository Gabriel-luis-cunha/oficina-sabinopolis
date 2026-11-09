// =============================================================
// Cartão de uma nota de manutenção.
// Permite: renomear a nota, renomear o arquivo, baixar,
// substituir (ou anexar) o arquivo, editar e excluir.
// =============================================================
import { useRef, useState } from 'react';
import { Download, FileText, Loader2, Paperclip, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { atualizarNota, baixarArquivoNota, substituirArquivoNota } from '../api/servidor.js';
import TextoEditavel from './TextoEditavel.jsx';
import Placa from './Placa.jsx';
import { useAviso } from './Aviso.jsx';
import { formatarMoeda, partesDaData } from '../utils/mascaras.js';
import { ACEITA_WORD, separarExtensao, validarArquivoWord } from '../utils/validacoes.js';

const LIMITE_RESUMO = 260; // descrições maiores ganham o botão "Mostrar tudo"

export default function CartaoNota({ nota, onAtualizada, onEditar, onExcluir }) {
  const aviso = useAviso();
  const entradaRef = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [expandida, setExpandida] = useState(false);
  const data = partesDaData(nota.data);
  const { base, ext } = separarExtensao(nota.arquivo_nome);
  const descricaoLonga = nota.descricao.length > LIMITE_RESUMO;

  async function renomearNota(novoTitulo) {
    const atualizada = await atualizarNota(nota.id, { titulo: novoTitulo });
    onAtualizada(atualizada);
    aviso.sucesso('Nota renomeada.');
  }

  async function renomearArquivo(novoNome) {
    // A extensão não é editável: o servidor sempre mantém a extensão real do arquivo
    const atualizada = await atualizarNota(nota.id, { arquivo_nome: novoNome + ext });
    onAtualizada(atualizada);
    aviso.sucesso('Arquivo renomeado.');
  }

  async function aoEscolherArquivo(evento) {
    const arquivo = evento.target.files[0];
    evento.target.value = '';
    if (!arquivo) return;

    const erro = validarArquivoWord(arquivo);
    if (erro) {
      aviso.erro(erro);
      return;
    }

    setEnviando(true);
    try {
      const atualizada = await substituirArquivoNota(nota.id, arquivo);
      onAtualizada(atualizada);
      aviso.sucesso(nota.arquivo_nome ? 'Arquivo substituído.' : 'Arquivo anexado.');
    } catch (falha) {
      aviso.erro(falha.message);
    } finally {
      setEnviando(false);
    }
  }

  // O arquivo fica criptografado no Supabase: é baixado e aberto aqui antes de salvar no aparelho
  async function baixar() {
    setBaixando(true);
    try {
      await baixarArquivoNota(nota.id);
    } catch (falha) {
      aviso.erro(falha.message);
    } finally {
      setBaixando(false);
    }
  }

  return (
    <article className="nota">
      {/* Bloco da data, à esquerda */}
      <div className="nota-data" aria-label={`Data: ${data.dia} de ${data.mes} de ${data.ano}`}>
        <span className="nota-dia">{data.dia}</span>
        <span className="nota-mes">{data.mes}</span>
        <span className="nota-ano">{data.ano}</span>
      </div>

      <div className="nota-conteudo">
        <header className="nota-cabecalho">
          <h3 className="nota-titulo">
            <TextoEditavel valor={nota.titulo} onSalvar={renomearNota} rotulo="a nota" />
          </h3>
          <span className="nota-valor mono">{formatarMoeda(nota.valor_centavos)}</span>
        </header>

        <p className="nota-veiculo">
          <Placa placa={nota.placa} tamanho="mini" />
          <span>{nota.marca} {nota.modelo}</span>
        </p>

        <p className={`nota-descricao ${descricaoLonga && !expandida ? 'nota-descricao-cortada' : ''}`}>
          {nota.descricao}
        </p>
        {descricaoLonga && (
          <button type="button" className="link-botao" onClick={() => setExpandida((v) => !v)}>
            {expandida ? 'Mostrar menos' : 'Mostrar tudo'}
          </button>
        )}

        {/* Anexo Word */}
        {nota.arquivo_nome ? (
          <div className="anexo">
            <FileText size={18} className="anexo-icone" aria-hidden="true" />
            <TextoEditavel valor={base} sufixo={ext} onSalvar={renomearArquivo} rotulo="o arquivo" className="anexo-nome" maxLength={150} />
            <div className="anexo-acoes">
              <button type="button" className="btn btn-secundario btn-pequeno" onClick={baixar} disabled={baixando}>
                {baixando ? <Loader2 size={15} className="girando" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
                {baixando ? 'Baixando…' : 'Baixar'}
              </button>
              <button type="button" className="btn btn-fantasma btn-pequeno" onClick={() => entradaRef.current.click()} disabled={enviando}>
                {enviando ? <Loader2 size={15} className="girando" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
                {enviando ? 'Enviando…' : 'Substituir'}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-fantasma btn-pequeno anexo-adicionar" onClick={() => entradaRef.current.click()} disabled={enviando}>
            {enviando ? <Loader2 size={15} className="girando" aria-hidden="true" /> : <Paperclip size={15} aria-hidden="true" />}
            {enviando ? 'Enviando…' : 'Anexar arquivo Word'}
          </button>
        )}
        <input
          ref={entradaRef}
          type="file"
          accept={ACEITA_WORD}
          className="visualmente-oculto"
          tabIndex={-1}
          aria-hidden="true"
          onChange={aoEscolherArquivo}
        />
      </div>

      <div className="nota-acoes">
        <button type="button" className="btn-icone" onClick={() => onEditar(nota)} aria-label={`Editar nota ${nota.titulo}`} title="Editar nota">
          <Pencil size={16} />
        </button>
        <button type="button" className="btn-icone btn-icone-perigo" onClick={() => onExcluir(nota)} aria-label={`Excluir nota ${nota.titulo}`} title="Excluir nota">
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}
