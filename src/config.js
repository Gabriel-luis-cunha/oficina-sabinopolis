// Configurações do sistema que você pode personalizar

// Nome que aparece no topo do sistema. Troque pelo nome da sua oficina.
export const NOME_OFICINA = 'Oficina Mecânica';

// ---------------------------------------------------------------
// Ligação com o Supabase (onde ficam os dados, já criptografados).
// Pegue os dois valores no painel do Supabase:
//   Project URL      -> botão "Connect" ou Project Settings > Data API
//   Publishable key  -> Project Settings > API Keys (começa com sb_publishable_)
// A publishable key pode ficar no código: ela sozinha não abre nada.
// NUNCA coloque aqui a "secret key".
// ---------------------------------------------------------------
export const SUPABASE_URL = 'COLE_AQUI_A_PROJECT_URL';
export const SUPABASE_CHAVE = 'COLE_AQUI_A_PUBLISHABLE_KEY';

// Limites de upload
export const LIMITES = {
  tamanhoImagemMB: 5,
  quantidadeImagens: 10,
  tamanhoWordMB: 10,
};
