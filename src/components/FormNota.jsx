// =============================================================
// Formulário de nota de manutenção (usado dentro de um Modal).
// Sem "nota": cria uma nova, com anexo Word opcional.
// Com "nota": edita os dados (o arquivo é trocado no cartão da nota).
// =============================================================
import { useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, Save, X } from 'lucide-react';
import { atualizarNota, criarNota } from '../api/servidor.js';
import Campo from './Campo.jsx';
import { useAviso } from './Aviso.jsx';
import { centavosDoTexto, formatarMoeda, formatarPlaca, hojeISO } from '../utils/mascaras.js';
import { ACEITA_WORD, focarPrimeiroErro, validarArquivoWord, validarNota } from '../utils/validacoes.js';
import { LIMITES } from '../config.js';

export default function FormNota({ clienteId, veiculos, nota, onSalvo, onCancelar, onSalvandoMudou }) {
  const editando = Boolean(nota);
  const aviso = useAviso();
  const entradaArquivoRef = useRef(null);
  const [form, setForm] = useState({
    // Se o cliente tem só um veículo, ele já vem escolhido
    veiculo_id: nota?.veiculo_id ?? (veiculos.length === 1 ? veiculos[0].id : ''),
    titulo: nota?.titulo ?? '',
    data: nota?.data ?? hojeISO(),
    valor_centavos: nota?.valor_centavos ?? null,
    descricao: nota?.descricao ?? '',
  });
  const [arquivo, setArquivo] = useState(null);
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);

  function mudarSalvando(valor) {
    setSalvando(valor);
    onSalvandoMudou?.(valor);
  }

  function alterar(campo, valor) {
    const novo = { ...form, [campo]: valor };
    setForm(novo);
    if (erros[campo]) {
      const { [campo]: _removido, ...resto } = erros;
      const mensagem = validarNota(novo)[campo];
      setErros(mensagem ? { ...resto, [campo]: mensagem } : resto);
    }
  }

  function escolherArquivo(evento) {
    const escolhido = evento.target.files[0];
    evento.target.value = '';
    if (!escolhido) return;
    const erro = validarArquivoWord(escolhido);
    if (erro) {
      setErros((atuais) => ({ ...atuais, arquivo: erro }));
      return;
    }
    const { arquivo: _removido, ...resto } = erros;
    setErros(resto);
    setArquivo(escolhido);
  }

  async function salvar(evento) {
    evento.preventDefault();
    const encontrados = validarNota(form);
    if (erros.arquivo) encontrados.arquivo = erros.arquivo;
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) {
      focarPrimeiroErro(encontrados);
      return;
    }

    mudarSalvando(true);
    try {
      const salva = editando ? await atualizarNota(nota.id, form) : await criarNota(clienteId, form, arquivo);
      aviso.sucesso(editando ? 'Nota atualizada.' : 'Nota de manutenção registrada.');
      mudarSalvando(false);
      onSalvo(salva);
    } catch (falha) {
      mudarSalvando(false);
      if (Object.keys(falha.erros ?? {}).length > 0) {
        setErros(falha.erros);
        focarPrimeiroErro(falha.erros);
      } else {
        aviso.erro(falha.message);
      }
    }
  }

  return (
    <form onSubmit={salvar} noValidate>
      <div className="modal-corpo">
        <div className="grade">
          <Campo
            nome="titulo"
            rotulo="Nome da nota"
            obrigatorio
            className="col-6"
            value={form.titulo}
            erro={erros.titulo}
            onChange={(e) => alterar('titulo', e.target.value)}
            placeholder="Ex.: Troca de pastilhas de freio"
            maxLength={120}
            autoFocus
          />
          <Campo
            nome="veiculo_id"
            rotulo="Veículo"
            obrigatorio
            como="select"
            className="col-6"
            value={form.veiculo_id}
            erro={erros.veiculo_id}
            onChange={(e) => alterar('veiculo_id', e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Escolha o veículo</option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {formatarPlaca(v.placa)} · {v.marca} {v.modelo}
              </option>
            ))}
          </Campo>
          <Campo
            nome="data"
            rotulo="Data do serviço"
            obrigatorio
            type="date"
            className="col-3 m-meia"
            value={form.data}
            erro={erros.data}
            onChange={(e) => alterar('data', e.target.value)}
          />
          <Campo
            nome="valor_centavos"
            rotulo="Valor"
            obrigatorio
            className="col-3 m-meia"
            inputMode="numeric"
            placeholder="R$ 0,00"
            value={formatarMoeda(form.valor_centavos)}
            erro={erros.valor_centavos}
            onChange={(e) => alterar('valor_centavos', centavosDoTexto(e.target.value))}
          />
          <Campo
            nome="descricao"
            rotulo="Descrição do serviço"
            obrigatorio
            como="textarea"
            rows={5}
            className="col-6"
            value={form.descricao}
            erro={erros.descricao}
            onChange={(e) => alterar('descricao', e.target.value)}
            placeholder="Peças trocadas, mão de obra, observações…"
            maxLength={5000}
          />
        </div>

        {!editando && (
          <div className={`campo ${erros.arquivo ? 'campo-com-erro' : ''}`}>
            <span className="campo-rotulo">Arquivo Word (opcional)</span>
            {arquivo ? (
              <div className="anexo anexo-escolhido">
                <FileText size={18} aria-hidden="true" />
                <span className="anexo-nome">{arquivo.name}</span>
                <button type="button" className="btn-icone btn-icone-pequeno" onClick={() => setArquivo(null)} aria-label="Tirar arquivo">
                  <X size={15} />
                </button>
              </div>
            ) : (
              <button
                id="campo-arquivo"
                type="button"
                className="upload-area upload-area-linha"
                onClick={() => entradaArquivoRef.current.click()}
              >
                <Paperclip size={18} aria-hidden="true" />
                <span className="upload-titulo"><strong>Anexar arquivo</strong></span>
                <span className="upload-dica">Somente .doc ou .docx · até {LIMITES.tamanhoWordMB} MB</span>
              </button>
            )}
            <input
              ref={entradaArquivoRef}
              type="file"
              accept={ACEITA_WORD}
              className="visualmente-oculto"
              tabIndex={-1}
              aria-hidden="true"
              onChange={escolherArquivo}
            />
            {erros.arquivo && <p className="campo-erro">{erros.arquivo}</p>}
          </div>
        )}
      </div>

      <div className="modal-rodape">
        <button type="button" className="btn btn-secundario" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primario" disabled={salvando}>
          {salvando ? <Loader2 size={16} className="girando" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {salvando ? 'Salvando…' : editando ? 'Salvar nota' : 'Registrar nota'}
        </button>
      </div>
    </form>
  );
}
