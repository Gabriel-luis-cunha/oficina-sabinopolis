// =============================================================
// Desenho de placa de carro.
// Mercosul (ABC1D23): fundo branco com faixa azul "BRASIL".
// Padrão antigo (ABC-1234): fundo cinza.
// =============================================================
import { formatarPlaca } from '../utils/mascaras.js';

export default function Placa({ placa, tamanho = 'normal' }) {
  const mercosul = /^[A-Z]{3}\d[A-Z]\d{2}$/.test(placa ?? '');
  const texto = formatarPlaca(placa);

  return (
    <span
      className={`placa placa-${tamanho} ${mercosul ? 'placa-mercosul' : 'placa-antiga'}`}
      title={`Placa ${texto}`}
    >
      {mercosul && (
        <span className="placa-faixa" aria-hidden="true">
          {tamanho !== 'mini' && 'BRASIL'}
        </span>
      )}
      <span className="placa-texto">{texto}</span>
    </span>
  );
}
