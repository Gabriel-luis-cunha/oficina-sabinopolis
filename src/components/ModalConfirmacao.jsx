// =============================================================
// Pergunta "Tem certeza?" antes de uma ação perigosa (excluir).
// onConfirmar pode ser assíncrona: o botão mostra "Excluindo…"
// até ela terminar.
// =============================================================
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from './Modal.jsx';

export default function ModalConfirmacao({
  aberto,
  titulo,
  mensagem,
  textoConfirmar = 'Excluir',
  textoProcessando = 'Excluindo…',
  onConfirmar,
  onCancelar,
}) {
  const [processando, setProcessando] = useState(false);

  async function confirmar() {
    setProcessando(true);
    try {
      await onConfirmar();
    } finally {
      setProcessando(false);
    }
  }

  return (
    <Modal aberto={aberto} titulo={titulo} onFechar={onCancelar} largura="pequena" bloqueado={processando}>
      <div className="modal-corpo">
        <div className="confirmacao-texto">{mensagem}</div>
      </div>
      <div className="modal-rodape">
        <button type="button" className="btn btn-secundario" onClick={onCancelar} disabled={processando}>
          Cancelar
        </button>
        <button type="button" className="btn btn-perigo" onClick={confirmar} disabled={processando}>
          {processando && <Loader2 size={16} className="girando" aria-hidden="true" />}
          {processando ? textoProcessando : textoConfirmar}
        </button>
      </div>
    </Modal>
  );
}
