// Configuração do Vite (monta o site e roda o modo de desenvolvimento)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Regras de segurança do navegador (Content-Security-Policy), só no site publicado.
// O site só pode carregar arquivos dele mesmo e só pode conversar com o
// Supabase e com a ViaCEP. Isso bloqueia scripts de terceiros.
const SEGURANCA = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://viacep.com.br",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

function politicaDeSeguranca() {
  return {
    name: 'politica-de-seguranca',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${SEGURANCA}" />\n    <meta name="referrer" content="no-referrer" />`,
      ),
  };
}

export default defineConfig({
  plugins: [react(), politicaDeSeguranca()],
  // Caminhos relativos: funciona em https://usuario.github.io/qualquer-nome/
  base: './',
  server: {
    port: 5173,
    host: true,
  },
});
