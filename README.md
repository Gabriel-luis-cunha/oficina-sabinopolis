# Oficina: site no GitHub Pages com dados criptografados

Sistema de clientes, veículos e notas de manutenção da oficina.

- **Site:** GitHub Pages (grátis). O GitHub monta e publica sozinho a cada envio para a branch `main`.
- **Dados:** Supabase (banco + arquivos). Funciona com o computador desligado, no PC e no celular.
- **Criptografia:** tudo é criptografado **no navegador**, antes de sair do aparelho (AES-256-GCM).
  O Supabase só guarda dados embaralhados. Sem a senha ou o código de recuperação, ninguém lê nada.

## Como a segurança funciona

| Proteção | O que faz |
|---|---|
| Login do Supabase | Só entra quem tem o e-mail e a senha da oficina. O cadastro de contas novas fica desligado. |
| Regras do banco (RLS) | Cada tabela e cada arquivo só respondem ao e-mail `mecsabinopolis@hotmail.com`. |
| Criptografia no navegador | Nome, CPF/CNPJ, telefone, endereço, veículos, notas, fotos e documentos Word vão embaralhados. |
| Chave mestra | Fica no banco trancada pela senha (PBKDF2 com 600 mil rodadas) e pelo código de recuperação. |
| CPF, CNPJ e placa repetidos | O banco recebe só uma "impressão digital" (HMAC), que impede duplicados sem revelar o número. |
| Política de segurança do site | O site só conversa com o Supabase e com a ViaCEP e não carrega scripts de terceiros. |

### ⚠️ Código de recuperação

No **primeiro login**, o sistema mostra um código como `K7M2Q-9XPRT-...`. **Anote no papel e guarde.**

- Se a senha for trocada no Supabase, no próximo login o sistema pede esse código **uma vez** e passa a aceitar a senha nova.
- **Se a senha for esquecida E o código for perdido, os dados não podem ser recuperados.** Nem o Supabase consegue abrir.

## Configuração (uma vez só)

### 1. Supabase
1. Crie o projeto em <https://supabase.com>. Região sugerida: South America (São Paulo).
2. **SQL Editor → New query**: cole todo o arquivo `supabase/configurar-banco.sql` e clique em **Run**.
3. **Authentication → Users → Add user → Create new user**: e-mail `mecsabinopolis@hotmail.com`, a senha da oficina e **Auto Confirm User** marcado.
4. **Authentication → Sign In / Providers**: desligue **Allow new users to sign up**.
5. Copie a **Project URL** e a **Publishable key** (`sb_publishable_...`) para o arquivo `src/config.js`.
   Nunca coloque a *secret key* no código.

### 2. GitHub Pages
1. Envie esta pasta para o repositório (branch `main`).
2. No repositório, abra **Settings → Pages** e, em **Source**, escolha **GitHub Actions**.
3. Abra a aba **Actions** e espere o "Publicar no GitHub Pages" ficar verde.
   O endereço fica assim: `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## Usar no celular
Abra o endereço no navegador do celular e use **Adicionar à tela inicial**.

## Testar no computador (opcional)
```powershell
npm install
npm run dev
```
Depois abra <http://localhost:5173>. Os dados são os mesmos do site publicado.

## Trocar o e-mail de login
1. Supabase → Authentication → Users: crie o usuário novo.
2. Troque o e-mail na função `usuario_da_oficina()` do `supabase/configurar-banco.sql` e rode o arquivo de novo.
3. No primeiro login com o e-mail novo, use a senha antiga. Se ela for diferente, o sistema pede o código de recuperação.

## Estrutura
```
├── .github/workflows/publicar.yml   monta e publica no GitHub Pages
├── supabase/configurar-banco.sql    tabelas, regras de acesso e espaço de arquivos
└── src/
    ├── config.js                    nome da oficina e ligação com o Supabase
    ├── api/cripto.js                criptografia (Web Crypto do navegador)
    ├── api/supabase.js              login, banco e arquivos
    ├── api/servidor.js              operações de clientes, veículos, fotos e notas
    ├── utils/regras.js              validações (as mesmas do sistema antigo)
    ├── pages/                       telas
    └── components/                  partes reaproveitadas das telas
```
