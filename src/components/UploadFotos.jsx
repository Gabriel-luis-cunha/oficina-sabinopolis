// =============================================================
// Dois jeitos de enviar fotos:
//
// 1) <UploadFotos>: usado DENTRO de formulários. O usuário escolhe
//    ou arrasta as fotos, vê a pré-visualização e pode tirar alguma.
//    As fotos só são enviadas quando o formulário é salvo.
//
// 2) <BotaoEnviarFotos>: um botão que envia na hora
//    (usado na página de detalhes).
// =============================================================
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { LIMITES } from '../config.js';
import { filtrarImagens } from '../utils/validacoes.js';
import { useAviso } from './Aviso.jsx';

const TIPOS_ACEITOS = 'image/jpeg,image/png,image/webp';

export default function UploadFotos({ arquivos, onChange, nome = 'fotos' }) {
  const [erro, setErro] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const [previas, setPrevias] = useState([]);
  const entradaRef = useRef(null);

  // Cria um endereço temporário (blob:) para mostrar cada foto antes do envio.
  // Ao trocar a lista, os endereços antigos são liberados da memória.
  useEffect(() => {
    const lista = arquivos.map((arquivo) => ({ arquivo, url: URL.createObjectURL(arquivo) }));
    setPrevias(lista);
    return () => lista.forEach((previa) => URL.revokeObjectURL(previa.url));
  }, [arquivos]);

  function adicionar(novos) {
    const { validas, erro: erroArquivos } = filtrarImagens(novos);
    const juntas = [...arquivos, ...validas];
    const mensagens = [erroArquivos];
    if (juntas.length > LIMITES.quantidadeImagens) {
      mensagens.push(`Máximo de ${LIMITES.quantidadeImagens} fotos por vez.`);
    }
    setErro(mensagens.filter(Boolean).join(' '));
    onChange(juntas.slice(0, LIMITES.quantidadeImagens));
  }

  function remover(indice) {
    onChange(arquivos.filter((_, i) => i !== indice));
  }

  return (
    <div className="upload">
      <label
        htmlFor={'campo-' + nome}
        className={`upload-area ${arrastando ? 'upload-area-ativa' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          adicionar([...e.dataTransfer.files]);
        }}
      >
        <ImagePlus size={22} aria-hidden="true" />
        <span className="upload-titulo">
          <strong>Escolher fotos</strong> <span className="so-desktop">ou arraste aqui</span>
        </span>
        <span className="upload-dica">
          JPG, PNG ou WEBP · até {LIMITES.tamanhoImagemMB} MB cada · no máximo {LIMITES.quantidadeImagens}
        </span>
      </label>
      <input
        ref={entradaRef}
        id={'campo-' + nome}
        type="file"
        accept={TIPOS_ACEITOS}
        multiple
        className="visualmente-oculto"
        onChange={(e) => {
          adicionar([...e.target.files]);
          e.target.value = ''; // permite escolher o mesmo arquivo de novo
        }}
      />

      {erro && <p className="campo-erro upload-erro">{erro}</p>}

      {previas.length > 0 && (
        <ul className="galeria galeria-pequena upload-previas">
          {previas.map((previa, indice) => (
            <li key={previa.url} className="galeria-item">
              <div className="galeria-miniatura">
                <img src={previa.url} alt={`Pré-visualização de ${previa.arquivo.name}`} />
              </div>
              <button
                type="button"
                className="galeria-remover"
                onClick={() => remover(indice)}
                aria-label={`Tirar ${previa.arquivo.name}`}
                title="Tirar foto"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BotaoEnviarFotos({ onEnviar, rotulo = 'Adicionar fotos', className = 'btn btn-secundario btn-pequeno' }) {
  const [enviando, setEnviando] = useState(false);
  const entradaRef = useRef(null);
  const aviso = useAviso();

  async function aoEscolher(evento) {
    const { validas, erro } = filtrarImagens([...evento.target.files]);
    evento.target.value = '';
    if (erro) aviso.erro(erro);
    if (validas.length === 0) return;
    if (validas.length > LIMITES.quantidadeImagens) {
      aviso.erro(`Envie no máximo ${LIMITES.quantidadeImagens} fotos por vez.`);
      return;
    }

    setEnviando(true);
    try {
      await onEnviar(validas);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => entradaRef.current.click()} disabled={enviando}>
        {enviando ? <Loader2 size={16} className="girando" aria-hidden="true" /> : <ImagePlus size={16} aria-hidden="true" />}
        <span>{enviando ? 'Enviando…' : rotulo}</span>
      </button>
      <input
        ref={entradaRef}
        type="file"
        accept={TIPOS_ACEITOS}
        multiple
        className="visualmente-oculto"
        tabIndex={-1}
        aria-hidden="true"
        onChange={aoEscolher}
      />
    </>
  );
}
