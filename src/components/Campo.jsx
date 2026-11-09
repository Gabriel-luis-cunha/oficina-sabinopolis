// =============================================================
// Campo de formulário com rótulo, dica e mensagem de erro.
// O id do campo é sempre "campo-" + nome. Isso permite colocar o
// cursor no primeiro campo com erro (veja focarPrimeiroErro).
//
// Exemplo:
//   <Campo nome="cpf" rotulo="CPF" obrigatorio erro={erros.cpf}
//          value={form.cpf} onChange={...} />
//
// "como" escolhe o elemento: 'input' (padrão), 'select' ou 'textarea'.
// =============================================================
import { AlertCircle } from 'lucide-react';

export default function Campo({
  nome,
  rotulo,
  erro,
  dica,
  obrigatorio = false,
  como: Elemento = 'input',
  carregando = false,
  className = '',
  children,
  ...propriedades
}) {
  const id = 'campo-' + nome;
  const idMensagem = id + '-mensagem';
  const temMensagem = Boolean(erro || dica);

  return (
    <div className={`campo ${erro ? 'campo-com-erro' : ''} ${className}`}>
      <label htmlFor={id} className="campo-rotulo">
        {rotulo}
        {obrigatorio && <span className="campo-obrigatorio" aria-hidden="true"> *</span>}
      </label>

      <div className="campo-controle">
        <Elemento
          id={id}
          name={nome}
          className="campo-entrada"
          aria-invalid={erro ? 'true' : undefined}
          aria-required={obrigatorio || undefined}
          aria-describedby={temMensagem ? idMensagem : undefined}
          {...propriedades}
        >
          {children}
        </Elemento>
        {carregando && <span className="campo-carregando" aria-hidden="true" />}
      </div>

      {erro ? (
        <p id={idMensagem} className="campo-erro">
          <AlertCircle size={14} aria-hidden="true" />
          <span>{erro}</span>
        </p>
      ) : dica ? (
        <p id={idMensagem} className="campo-dica">{dica}</p>
      ) : null}
    </div>
  );
}
