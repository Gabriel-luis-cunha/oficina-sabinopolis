// =============================================================
// Formulário de cliente: serve para CADASTRAR (/clientes/novo)
// e para EDITAR (/clientes/:id/editar).
// =============================================================
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import {
  atualizarCliente,
  buscarCliente,
  criarCliente,
  enviarFotosCliente,
  excluirFotoCliente,
} from '../api/servidor.js';
import Campo from '../components/Campo.jsx';
import Galeria from '../components/Galeria.jsx';
import UploadFotos from '../components/UploadFotos.jsx';
import ModalConfirmacao from '../components/ModalConfirmacao.jsx';
import { Carregando, ErroCarregar } from '../components/Estados.jsx';
import { useAviso } from '../components/Aviso.jsx';
import { mascaraCep, mascaraCnpj, mascaraCpf, mascaraTelefone, somenteDigitos } from '../utils/mascaras.js';
import { buscarEnderecoPorCep } from '../utils/viacep.js';
import { ESTADOS, focarPrimeiroErro, validarCliente } from '../utils/validacoes.js';

// tipoDocumento diz qual campo aparece: 'cpf' (pessoa física) ou 'cnpj' (empresa)
const FORMULARIO_VAZIO = {
  nome: '', tipoDocumento: 'cpf', cpf: '', cnpj: '', telefone: '', cep: '', rua: '', numero: '',
  complemento: '', bairro: '', cidade: '', estado: '',
};

/** Devolve uma cópia dos erros com o campo atualizado (ou removido) */
function comErro(erros, campo, mensagem) {
  const copia = { ...erros };
  if (mensagem) copia[campo] = mensagem;
  else delete copia[campo];
  return copia;
}

export default function FormCliente() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navegar = useNavigate();
  const aviso = useAviso();

  const [form, setForm] = useState(FORMULARIO_VAZIO);
  const [erros, setErros] = useState({});
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const [fotosNovas, setFotosNovas] = useState([]);
  const [fotosAtuais, setFotosAtuais] = useState([]);
  const [fotoParaRemover, setFotoParaRemover] = useState(null);
  const [carregando, setCarregando] = useState(editando);
  const [erroCarregar, setErroCarregar] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [consultandoCep, setConsultandoCep] = useState(false);
  const ultimoCepConsultado = useRef('');

  // No modo edição, carrega os dados atuais do cliente
  useEffect(() => {
    if (!editando) return;
    setCarregando(true);
    buscarCliente(id)
      .then((cliente) => {
        setForm({
          nome: cliente.nome,
          tipoDocumento: cliente.cnpj ? 'cnpj' : 'cpf',
          cpf: mascaraCpf(cliente.cpf),
          cnpj: mascaraCnpj(cliente.cnpj),
          telefone: mascaraTelefone(cliente.telefone),
          cep: mascaraCep(cliente.cep),
          rua: cliente.rua ?? '',
          numero: cliente.numero ?? '',
          complemento: cliente.complemento ?? '',
          bairro: cliente.bairro ?? '',
          cidade: cliente.cidade ?? '',
          estado: cliente.estado ?? '',
        });
        setFotosAtuais(cliente.fotos);
        ultimoCepConsultado.current = cliente.cep ?? '';
      })
      .catch((falha) => setErroCarregar(falha.message))
      .finally(() => setCarregando(false));
  }, [editando, id]);

  /** Atualiza um campo. Se ele estava com erro, revalida enquanto o usuário corrige. */
  function alterar(campo, valor) {
    const novoForm = { ...form, [campo]: valor };
    setForm(novoForm);
    if (erros[campo]) setErros((atuais) => comErro(atuais, campo, validarCliente(novoForm)[campo]));
  }

  /** Ao sair do campo, mostra o erro (se houver algo digitado ou se já tentou salvar) */
  function aoSair(campo) {
    if (!form[campo] && !tentouSalvar) return;
    setErros((atuais) => comErro(atuais, campo, validarCliente(form)[campo]));
  }

  /** Troca entre CPF e CNPJ. O que já foi digitado fica guardado, mas só o escolhido é salvo. */
  function trocarTipoDocumento(tipo) {
    if (tipo === form.tipoDocumento) return;
    setForm((atual) => ({ ...atual, tipoDocumento: tipo }));
    setErros((atuais) => comErro(comErro(atuais, 'cpf', null), 'cnpj', null));
    // Leva o cursor para o campo que acabou de aparecer
    setTimeout(() => document.getElementById('campo-' + tipo)?.focus(), 0);
  }

  /** Quando o CEP fica completo, busca o endereço na ViaCEP */
  async function aoMudarCep(valorDigitado) {
    const cep = mascaraCep(valorDigitado);
    alterar('cep', cep);

    const digitos = somenteDigitos(cep);
    if (digitos.length !== 8 || digitos === ultimoCepConsultado.current) return;
    ultimoCepConsultado.current = digitos;

    setConsultandoCep(true);
    try {
      const endereco = await buscarEnderecoPorCep(digitos);
      // Só substitui o que a ViaCEP trouxe (alguns CEPs de cidade pequena não têm rua)
      setForm((atual) => ({
        ...atual,
        rua: endereco.rua || atual.rua,
        bairro: endereco.bairro || atual.bairro,
        cidade: endereco.cidade || atual.cidade,
        estado: endereco.estado || atual.estado,
      }));
      setErros((atuais) => comErro(atuais, 'cep', null));
      // Leva o cursor para o número, que a ViaCEP não tem como saber
      document.getElementById('campo-numero')?.focus();
    } catch (falha) {
      setErros((atuais) => comErro(atuais, 'cep', falha.message));
    } finally {
      setConsultandoCep(false);
    }
  }

  async function salvar(evento) {
    evento.preventDefault();
    setTentouSalvar(true);

    // 1) Valida no navegador
    const encontrados = validarCliente(form);
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) {
      focarPrimeiroErro(encontrados);
      aviso.erro('Confira os campos destacados em vermelho.');
      return;
    }

    // 2) Envia os dados. O servidor valida de novo (ex.: CPF repetido).
    //    Vai só o documento escolhido; o outro segue vazio (e é apagado, se existia).
    const { tipoDocumento, ...dados } = form;
    if (tipoDocumento === 'cnpj') dados.cpf = '';
    else dados.cnpj = '';

    setSalvando(true);
    let cliente;
    try {
      cliente = editando ? await atualizarCliente(id, dados) : await criarCliente(dados);
    } catch (falha) {
      setSalvando(false);
      if (Object.keys(falha.erros ?? {}).length > 0) {
        setErros(falha.erros);
        focarPrimeiroErro(falha.erros);
      }
      aviso.erro(falha.message);
      return;
    }

    // 3) Envia as fotos novas (se houver)
    if (fotosNovas.length > 0) {
      try {
        await enviarFotosCliente(cliente.id, fotosNovas);
      } catch (falha) {
        aviso.erro(`Os dados foram salvos, mas as fotos não: ${falha.message}`);
        navegar(`/clientes/${cliente.id}`);
        return;
      }
    }

    aviso.sucesso(editando ? 'Alterações salvas.' : 'Cliente cadastrado.');
    navegar(`/clientes/${cliente.id}`);
  }

  async function confirmarRemocaoFoto() {
    try {
      await excluirFotoCliente(fotoParaRemover.id);
      setFotosAtuais((lista) => lista.filter((f) => f.id !== fotoParaRemover.id));
      aviso.sucesso('Foto removida.');
      setFotoParaRemover(null);
    } catch (falha) {
      aviso.erro(falha.message);
    }
  }

  if (carregando) return <Carregando texto="Carregando cliente…" />;
  if (erroCarregar) return <ErroCarregar mensagem={erroCarregar} />;

  const voltarPara = editando ? `/clientes/${id}` : '/';

  // Atalho para não repetir as mesmas propriedades em todo campo
  const ligar = (campo) => ({
    nome: campo,
    value: form[campo],
    erro: erros[campo],
    onChange: (e) => alterar(campo, e.target.value),
    onBlur: () => aoSair(campo),
  });

  return (
    <form className="formulario" onSubmit={salvar} noValidate>
      <div className="cabecalho-pagina">
        <div>
          <Link to={voltarPara} className="link-voltar">
            <ArrowLeft size={16} aria-hidden="true" /> Voltar
          </Link>
          <h1 className="titulo-pagina">{editando ? 'Editar cliente' : 'Novo cliente'}</h1>
        </div>
      </div>

      <section className="secao-form">
        <div className="secao-form-info">
          <h2 className="secao-titulo">Dados pessoais</h2>
          <p>Campos com <span className="campo-obrigatorio">*</span> são obrigatórios.</p>
        </div>
        <div className="grade">
          <Campo {...ligar('nome')} rotulo="Nome completo" obrigatorio className="col-6" autoComplete="name" maxLength={120} />
          <div className="col-3 campo-documento">
            {/* Escolha entre CPF e CNPJ. Fica no canto direito, na altura do rótulo. */}
            <div className="seletor-documento" role="radiogroup" aria-label="Tipo de documento">
              {[
                ['cpf', 'CPF'],
                ['cnpj', 'CNPJ'],
              ].map(([tipo, texto]) => (
                <button
                  key={tipo}
                  type="button"
                  role="radio"
                  aria-checked={form.tipoDocumento === tipo}
                  className={form.tipoDocumento === tipo ? 'ativo' : ''}
                  onClick={() => trocarTipoDocumento(tipo)}
                >
                  {texto}
                </button>
              ))}
            </div>
            {form.tipoDocumento === 'cnpj' ? (
              <Campo
                key="cnpj"
                {...ligar('cnpj')}
                onChange={(e) => alterar('cnpj', mascaraCnpj(e.target.value))}
                rotulo="CNPJ"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="00.000.000/0000-00"
              />
            ) : (
              <Campo
                key="cpf"
                {...ligar('cpf')}
                onChange={(e) => alterar('cpf', mascaraCpf(e.target.value))}
                rotulo="CPF"
                inputMode="numeric"
                placeholder="000.000.000-00"
              />
            )}
          </div>
          <Campo
            {...ligar('telefone')}
            onChange={(e) => alterar('telefone', mascaraTelefone(e.target.value))}
            rotulo="Telefone"
            className="col-3"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(00) 00000-0000"
          />
        </div>
      </section>

      <section className="secao-form">
        <div className="secao-form-info">
          <h2 className="secao-titulo">Endereço</h2>
          <p>Digite o CEP e o endereço é preenchido sozinho.</p>
        </div>
        <div className="grade">
          <Campo
            {...ligar('cep')}
            onChange={(e) => aoMudarCep(e.target.value)}
            rotulo="CEP"
            className="col-2 m-meia"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            carregando={consultandoCep}
            dica={consultandoCep ? 'Buscando endereço…' : undefined}
          />
          <Campo {...ligar('rua')} rotulo="Rua" className="col-4" autoComplete="address-line1" />
          <Campo {...ligar('numero')} rotulo="Número" className="col-2 m-meia" />
          <Campo {...ligar('complemento')} rotulo="Complemento" className="col-4 m-meia" placeholder="Apto, bloco, fundos…" />
          <Campo {...ligar('bairro')} rotulo="Bairro" className="col-2" />
          <Campo {...ligar('cidade')} rotulo="Cidade" className="col-3" autoComplete="address-level2" />
          <Campo {...ligar('estado')} rotulo="Estado" como="select" className="col-1 m-meia">
            <option value="">UF</option>
            {ESTADOS.map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </Campo>
        </div>
      </section>

      <section className="secao-form">
        <div className="secao-form-info">
          <h2 className="secao-titulo">Fotos</h2>
          <p>Foto do cliente ou de documentos. Clique numa foto para ampliar.</p>
        </div>
        <div className="pilha">
          {fotosAtuais.length > 0 && <Galeria fotos={fotosAtuais} onRemover={setFotoParaRemover} tamanho="pequena" />}
          <UploadFotos arquivos={fotosNovas} onChange={setFotosNovas} />
        </div>
      </section>

      <div className="barra-acoes">
        <Link to={voltarPara} className="btn btn-secundario">Cancelar</Link>
        <button type="submit" className="btn btn-primario" disabled={salvando}>
          {salvando ? <Loader2 size={16} className="girando" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar cliente'}
        </button>
      </div>

      <ModalConfirmacao
        aberto={Boolean(fotoParaRemover)}
        titulo="Remover foto?"
        mensagem={<p>A foto será apagada definitivamente.</p>}
        textoConfirmar="Remover foto"
        textoProcessando="Removendo…"
        onConfirmar={confirmarRemocaoFoto}
        onCancelar={() => setFotoParaRemover(null)}
      />
    </form>
  );
}
