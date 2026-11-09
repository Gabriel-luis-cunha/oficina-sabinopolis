// =============================================================
// Galeria de fotos em miniatura. Clicar abre a foto ampliada
// (lightbox), com setas para navegar entre as fotos.
//
// Props:
//   fotos:     [{ id, url, nome_original }]
//   onRemover: função opcional. Se existir, cada foto ganha um botão de remover.
// =============================================================
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { travarRolagem } from '../utils/rolagem.js';

function Ampliada({ fotos, indice, onMudar, onFechar }) {
  const foto = fotos[indice];
  const total = fotos.length;
  const anterior = () => onMudar((indice - 1 + total) % total);
  const proxima = () => onMudar((indice + 1) % total);

  // Guarda as funções mais recentes para o atalho de teclado usar
  const acoesRef = useRef({});
  acoesRef.current = { anterior, proxima, onFechar };

  // Atalhos de teclado: Esc fecha, setas navegam.
  // "capture: true" no window faz este atalho rodar ANTES do Esc de um
  // modal que esteja por baixo. O stopPropagation impede que o modal feche junto.
  useEffect(() => {
    function aoTeclar(evento) {
      const acoes = { Escape: 'onFechar', ArrowLeft: 'anterior', ArrowRight: 'proxima' };
      const acao = acoes[evento.key];
      if (!acao) return;
      evento.stopPropagation();
      evento.preventDefault();
      acoesRef.current[acao]();
    }
    window.addEventListener('keydown', aoTeclar, { capture: true });
    const destravar = travarRolagem();
    return () => {
      window.removeEventListener('keydown', aoTeclar, { capture: true });
      destravar();
    };
  }, []);

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Foto ampliada" onClick={onFechar}>
      <button type="button" className="lightbox-fechar" onClick={onFechar} aria-label="Fechar foto" autoFocus>
        <X size={22} />
      </button>

      {total > 1 && (
        <button
          type="button"
          className="lightbox-seta lightbox-anterior"
          onClick={(e) => { e.stopPropagation(); anterior(); }}
          aria-label="Foto anterior"
        >
          <ChevronLeft size={28} />
        </button>
      )}

      <figure className="lightbox-figura" onClick={(e) => e.stopPropagation()}>
        <img src={foto.url} alt={foto.nome_original ?? 'Foto'} />
        <figcaption>
          <span>{foto.nome_original}</span>
          {total > 1 && <span className="lightbox-contador">{indice + 1} / {total}</span>}
        </figcaption>
      </figure>

      {total > 1 && (
        <button
          type="button"
          className="lightbox-seta lightbox-proxima"
          onClick={(e) => { e.stopPropagation(); proxima(); }}
          aria-label="Próxima foto"
        >
          <ChevronRight size={28} />
        </button>
      )}
    </div>,
    document.body,
  );
}

export default function Galeria({ fotos, onRemover, tamanho = 'normal' }) {
  const [indiceAberto, setIndiceAberto] = useState(null);

  // Se a foto aberta for removida, fecha a ampliação
  const indiceValido = indiceAberto !== null && indiceAberto < fotos.length ? indiceAberto : null;

  if (fotos.length === 0) return null;

  return (
    <>
      <ul className={`galeria galeria-${tamanho}`}>
        {fotos.map((foto, indice) => (
          <li key={foto.id} className="galeria-item">
            <button
              type="button"
              className="galeria-miniatura"
              onClick={() => setIndiceAberto(indice)}
              aria-label={`Ampliar foto ${indice + 1}`}
            >
              <img src={foto.url} alt="" loading="lazy" />
            </button>
            {onRemover && (
              <button
                type="button"
                className="galeria-remover"
                onClick={() => onRemover(foto)}
                aria-label={`Remover foto ${indice + 1}`}
                title="Remover foto"
              >
                <Trash2 size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {indiceValido !== null && (
        <Ampliada fotos={fotos} indice={indiceValido} onMudar={setIndiceAberto} onFechar={() => setIndiceAberto(null)} />
      )}
    </>
  );
}
