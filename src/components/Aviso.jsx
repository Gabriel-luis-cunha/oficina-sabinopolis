// =============================================================
// Avisos rápidos ("toasts") que aparecem no canto da tela.
// Uso em qualquer componente:
//   const aviso = useAviso();
//   aviso.sucesso('Cliente salvo!');
//   aviso.erro('Não foi possível salvar.');
// =============================================================
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

const ContextoAvisos = createContext(null);

export function ProvedorAvisos({ children }) {
  const [avisos, setAvisos] = useState([]);

  const remover = useCallback((id) => {
    setAvisos((lista) => lista.filter((aviso) => aviso.id !== id));
  }, []);

  const mostrar = useCallback(
    (tipo, texto) => {
      const id = crypto.randomUUID();
      // Mantém no máximo 4 avisos na tela
      setAvisos((lista) => [...lista.slice(-3), { id, tipo, texto }]);
      // Erros ficam mais tempo, para dar tempo de ler
      setTimeout(() => remover(id), tipo === 'erro' ? 6500 : 3500);
    },
    [remover],
  );

  // useMemo evita recriar o objeto a cada renderização
  const api = useMemo(
    () => ({
      sucesso: (texto) => mostrar('sucesso', texto),
      erro: (texto) => mostrar('erro', texto),
    }),
    [mostrar],
  );

  return (
    <ContextoAvisos.Provider value={api}>
      {children}
      <div className="avisos" aria-live="polite">
        {avisos.map((aviso) => (
          <div key={aviso.id} className={`aviso aviso-${aviso.tipo}`} role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
            {aviso.tipo === 'erro' ? <AlertTriangle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
            <span>{aviso.texto}</span>
            <button type="button" className="aviso-fechar" onClick={() => remover(aviso.id)} aria-label="Fechar aviso">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ContextoAvisos.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAviso() {
  return useContext(ContextoAvisos);
}
