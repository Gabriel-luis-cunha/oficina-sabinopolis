// =============================================================
// Formulário de veículo (usado dentro de um Modal).
// Sem "veiculo": cadastra um novo (e permite já anexar fotos).
// Com "veiculo": edita os dados (fotos são geridas no cartão do veículo).
// =============================================================
import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { atualizarVeiculo, criarVeiculo, enviarFotosVeiculo } from '../api/servidor.js';
import Campo from './Campo.jsx';
import UploadFotos from './UploadFotos.jsx';
import { useAviso } from './Aviso.jsx';
import { mascaraPlaca } from '../utils/mascaras.js';
import { focarPrimeiroErro, validarVeiculo } from '../utils/validacoes.js';

// Sugestões que aparecem enquanto o usuário digita (o campo continua livre)
const MARCAS = [
  'BYD', 'Caoa Chery', 'Chevrolet', 'Citroën', 'Fiat', 'Ford', 'Honda', 'Hyundai', 'Jeep', 'Kia',
  'Mitsubishi', 'Nissan', 'Peugeot', 'Renault', 'Toyota', 'Volkswagen',
];
const CORES = ['Branco', 'Preto', 'Prata', 'Cinza', 'Vermelho', 'Azul', 'Verde', 'Amarelo', 'Marrom', 'Bege', 'Vinho'];

export default function FormVeiculo({ clienteId, veiculo, onSalvo, onCancelar, onSalvandoMudou }) {
  const editando = Boolean(veiculo);
  const aviso = useAviso();
  const [form, setForm] = useState({
    placa: veiculo?.placa ?? '',
    marca: veiculo?.marca ?? '',
    modelo: veiculo?.modelo ?? '',
    ano: veiculo?.ano ? String(veiculo.ano) : '',
    cor: veiculo?.cor ?? '',
  });
  const [erros, setErros] = useState({});
  const [fotos, setFotos] = useState([]);
  const [salvando, setSalvando] = useState(false);

  function mudarSalvando(valor) {
    setSalvando(valor);
    onSalvandoMudou?.(valor); // avisa o Modal para não fechar no meio do envio
  }

  function alterar(campo, valor) {
    const novo = { ...form, [campo]: valor };
    setForm(novo);
    if (erros[campo]) {
      const { [campo]: _removido, ...resto } = erros;
      const mensagem = validarVeiculo(novo)[campo];
      setErros(mensagem ? { ...resto, [campo]: mensagem } : resto);
    }
  }

  async function salvar(evento) {
    evento.preventDefault();
    const encontrados = validarVeiculo(form);
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) {
      focarPrimeiroErro(encontrados);
      return;
    }

    mudarSalvando(true);
    try {
      const salvo = editando ? await atualizarVeiculo(veiculo.id, form) : await criarVeiculo(clienteId, form);
      if (fotos.length > 0) {
        try {
          await enviarFotosVeiculo(salvo.id, fotos);
        } catch (falha) {
          aviso.erro(`O veículo foi salvo, mas as fotos não: ${falha.message}`);
        }
      }
      aviso.sucesso(editando ? 'Veículo atualizado.' : 'Veículo cadastrado.');
      mudarSalvando(false);
      onSalvo(salvo);
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

  const ligar = (campo) => ({
    nome: campo,
    value: form[campo],
    erro: erros[campo],
    onChange: (e) => alterar(campo, e.target.value),
  });

  return (
    <form onSubmit={salvar} noValidate>
      <div className="modal-corpo">
        <div className="grade">
          <Campo
            {...ligar('placa')}
            onChange={(e) => alterar('placa', mascaraPlaca(e.target.value))}
            rotulo="Placa"
            obrigatorio
            className="col-2 m-meia campo-placa"
            placeholder="ABC1D23"
            autoComplete="off"
            autoFocus
          />
          <Campo {...ligar('ano')} onChange={(e) => alterar('ano', e.target.value.replace(/\D/g, '').slice(0, 4))}
            rotulo="Ano" className="col-1 m-meia" inputMode="numeric" placeholder="2020" />
          <Campo {...ligar('cor')} rotulo="Cor" className="col-3" list="lista-cores" maxLength={60} />
          <Campo {...ligar('marca')} rotulo="Marca" obrigatorio className="col-3" list="lista-marcas" maxLength={60} />
          <Campo {...ligar('modelo')} rotulo="Modelo" obrigatorio className="col-3" placeholder="Ex.: Onix 1.0" maxLength={60} />
        </div>

        <datalist id="lista-marcas">
          {MARCAS.map((marca) => <option key={marca} value={marca} />)}
        </datalist>
        <datalist id="lista-cores">
          {CORES.map((cor) => <option key={cor} value={cor} />)}
        </datalist>

        {!editando && (
          <div className="campo">
            <span className="campo-rotulo">Fotos do veículo</span>
            <UploadFotos arquivos={fotos} onChange={setFotos} nome="fotos-veiculo" />
          </div>
        )}
      </div>

      <div className="modal-rodape">
        <button type="button" className="btn btn-secundario" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primario" disabled={salvando}>
          {salvando ? <Loader2 size={16} className="girando" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {salvando ? 'Salvando…' : editando ? 'Salvar veículo' : 'Cadastrar veículo'}
        </button>
      </div>
    </form>
  );
}
