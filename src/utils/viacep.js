// =============================================================
// Consulta de endereço pelo CEP usando a API gratuita ViaCEP.
// Documentação: https://viacep.com.br
// =============================================================
import { somenteDigitos } from './mascaras.js';

/** Erro com uma mensagem pronta para mostrar ao usuário */
export class ErroCep extends Error {}

/**
 * Busca o endereço de um CEP.
 * @returns {{ rua, bairro, cidade, estado }}
 */
export async function buscarEnderecoPorCep(cep) {
  const digitos = somenteDigitos(cep);
  if (digitos.length !== 8) throw new ErroCep('CEP incompleto.');

  // Se a ViaCEP demorar mais de 8 segundos, desiste
  const controle = new AbortController();
  const temporizador = setTimeout(() => controle.abort(), 8000);

  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`, { signal: controle.signal });
    if (!resposta.ok) throw new ErroCep('CEP inválido.');

    const dados = await resposta.json();
    // Quando o CEP não existe, a ViaCEP responde { "erro": true }
    if (dados.erro) throw new ErroCep('CEP não encontrado. Confira os números ou preencha o endereço.');

    return {
      rua: dados.logradouro ?? '',
      bairro: dados.bairro ?? '',
      cidade: dados.localidade ?? '',
      estado: dados.uf ?? '',
    };
  } catch (erro) {
    if (erro instanceof ErroCep) throw erro;
    // Sem internet, ViaCEP fora do ar ou tempo esgotado
    throw new ErroCep('Não foi possível consultar o CEP agora. Preencha o endereço manualmente.');
  } finally {
    clearTimeout(temporizador);
  }
}
