// =============================================================
// Janela modal genérica (abre por cima da página).
// - fecha com a tecla Esc ou clicando fora
// - trava a rolagem da página enquanto está aberta
// - no celular vira uma "gaveta" que sobe do rodapé
// =============================================================
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { travarRolagem } from '../utils/rolagem.js';

// Pilha de modais abertos. Assim o Esc fecha só o de cima
// (por exemplo, a confirmação aberta por cima de um formulário).
const pilha = [];

export default function Modal({ aberto, titulo, descricao, onFechar, children, largura = 'media', bloqueado = false }) {
  const id = useId();
  const caixaRef = useRef(null);

  // Guarda a função mais recente sem precisar refazer o efeito
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;
  const bloqueadoRef = useRef(bloqueado);
  bloqueadoRef.current = bloqueado;

  useEffect(() => {
    if (!aberto) return undefined;

    pilha.push(id);
    const destravar = travarRolagem();
    const focoAnterior = document.activeElement;

    // Se nenhum campo pediu foco (autoFocus), foca a própria janela
    requestAnimationFrame(() => {
      if (caixaRef.current && !caixaRef.current.contains(document.activeElement)) caixaRef.current.focus();
    });

    function aoTeclar(evento) {
      const estaNoTopo = pilha[pilha.length - 1] === id;
      if (evento.key === 'Escape' && estaNoTopo && !bloqueadoRef.current) {
        evento.stopPropagation();
        fecharRef.current();
      }
    }
    document.addEventListener('keydown', aoTeclar);

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      pilha.splice(pilha.indexOf(id), 1);
      destravar();
      // Devolve o foco para o botão que abriu o modal
      if (focoAnterior instanceof HTMLElement) focoAnterior.focus();
    };
  }, [aberto, id]);

  if (!aberto) return null;

  // createPortal desenha o modal direto no <body>, fora da página
  return createPortal(
    <div
      className="modal-fundo"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget && !bloqueado) onFechar();
      }}
    >
      <div
        ref={caixaRef}
        className={`modal modal-${largura}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id + '-titulo'}
        tabIndex={-1}
      >
        <div className="modal-cabecalho">
          <div>
            <h2 id={id + '-titulo'} className="modal-titulo">{titulo}</h2>
            {descricao && <p className="modal-descricao">{descricao}</p>}
          </div>
          <button type="button" className="btn-icone" onClick={onFechar} disabled={bloqueado} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
