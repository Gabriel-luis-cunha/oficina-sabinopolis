// =============================================================
// Texto que pode ser renomeado direto na tela.
// Clica no lápis -> vira um campo -> Enter salva, Esc cancela.
//
// Props:
//   valor:    texto atual
//   onSalvar: função assíncrona que recebe o novo texto
//   rotulo:   o que está sendo renomeado (para leitores de tela)
//   sufixo:   texto fixo depois do campo (ex.: ".docx")
// =============================================================
import { useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';

export default function TextoEditavel({ valor, onSalvar, rotulo, sufixo, className = '', maxLength = 120 }) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  function comecar() {
    setRascunho(valor);
    setErro('');
    setEditando(true);
  }

  async function salvar(evento) {
    evento.preventDefault();
    const novo = rascunho.trim();
    if (!novo) {
      setErro('O nome não pode ficar vazio.');
      return;
    }
    if (novo === valor) {
      setEditando(false);
      return;
    }
    setSalvando(true);
    try {
      await onSalvar(novo);
      setEditando(false);
    } catch (falha) {
      // Mostra o erro do campo, se a API mandou um, ou a mensagem geral
      const doCampo = falha.erros ? Object.values(falha.erros)[0] : null;
      setErro(doCampo ?? falha.message);
    } finally {
      setSalvando(false);
    }
  }

  if (!editando) {
    return (
      <span className={`editavel ${className}`}>
        <span className="editavel-texto">
          {valor}
          {sufixo && <span className="editavel-sufixo">{sufixo}</span>}
        </span>
        <button type="button" className="btn-icone btn-icone-pequeno" onClick={comecar} aria-label={`Renomear ${rotulo}`} title="Renomear">
          <Pencil size={14} />
        </button>
      </span>
    );
  }

  return (
    <form className={`editavel-form ${className}`} onSubmit={salvar}>
      <div className={`editavel-linha ${erro ? 'campo-com-erro' : ''}`}>
        <input
          className="campo-entrada"
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setEditando(false);
            }
          }}
          onFocus={(e) => e.target.select()}
          aria-label={`Novo nome para ${rotulo}`}
          aria-invalid={erro ? 'true' : undefined}
          maxLength={maxLength}
          disabled={salvando}
          autoFocus
        />
        {sufixo && <span className="editavel-sufixo">{sufixo}</span>}
        <button type="submit" className="btn-icone btn-icone-ok" disabled={salvando} aria-label="Salvar novo nome" title="Salvar">
          {salvando ? <Loader2 size={16} className="girando" /> : <Check size={16} />}
        </button>
        <button type="button" className="btn-icone" onClick={() => setEditando(false)} disabled={salvando} aria-label="Cancelar" title="Cancelar">
          <X size={16} />
        </button>
      </div>
      {erro && <p className="campo-erro">{erro}</p>}
    </form>
  );
}
