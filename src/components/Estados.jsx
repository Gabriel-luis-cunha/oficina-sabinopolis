// =============================================================
// Telas de "estado": carregando, vazio e erro.
// Usar sempre os mesmos componentes deixa o sistema consistente.
// =============================================================
import { Loader2, Inbox, WifiOff } from 'lucide-react';

export function Carregando({ texto = 'Carregando…' }) {
  return (
    <div className="estado" role="status">
      <Loader2 className="girando" size={22} aria-hidden="true" />
      <p className="estado-texto">{texto}</p>
    </div>
  );
}

export function EstadoVazio({ icone: Icone = Inbox, titulo, texto, acao, compacto = false }) {
  return (
    <div className={`estado ${compacto ? 'estado-compacto' : ''}`}>
      <span className="estado-icone" aria-hidden="true">
        <Icone size={compacto ? 20 : 26} strokeWidth={1.75} />
      </span>
      <p className="estado-titulo">{titulo}</p>
      {texto && <p className="estado-texto">{texto}</p>}
      {acao && <div className="estado-acao">{acao}</div>}
    </div>
  );
}

export function ErroCarregar({ mensagem, onTentarDeNovo }) {
  return (
    <EstadoVazio
      icone={WifiOff}
      titulo="Não foi possível carregar"
      texto={mensagem}
      acao={
        onTentarDeNovo && (
          <button type="button" className="btn btn-secundario" onClick={onTentarDeNovo}>
            Tentar de novo
          </button>
        )
      }
    />
  );
}
