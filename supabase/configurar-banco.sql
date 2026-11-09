-- =============================================================
-- Banco da oficina no Supabase.
-- Cole TUDO no "SQL Editor" do Supabase e clique em "Run".
-- Pode rodar mais de uma vez sem perder dados.
--
-- IMPORTANTE: se o e-mail de login mudar, troque ele na função abaixo.
-- Só esse usuário consegue ler ou gravar qualquer coisa.
-- =============================================================

-- Quem pode acessar os dados da oficina
create or replace function public.usuario_da_oficina()
returns boolean
language sql
stable
as $$
  select coalesce(lower(auth.jwt() ->> 'email') in ('mecsabinopolis@hotmail.com'), false)
$$;

-- ---------- Cofre: a chave mestra, trancada pela senha e pelo código de recuperação ----------
create table if not exists public.cofre (
  id                    int primary key default 1 check (id = 1),
  sal                   text not null,
  iteracoes             int  not null,
  chave_senha           text not null,
  sal_recuperacao       text not null,
  iteracoes_recuperacao int  not null,
  chave_recuperacao     text not null,
  criado_em             timestamptz not null default now()
);

-- ---------- Clientes ----------
-- "dados" é o cliente inteiro criptografado (nome, CPF/CNPJ, telefone, endereço).
-- cpf_indice e cnpj_indice são "impressões digitais": impedem duplicados
-- sem revelar o número verdadeiro.
create table if not exists public.clientes (
  id            bigint generated always as identity primary key,
  dados         text not null,
  cpf_indice    text unique,
  cnpj_indice   text unique,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------- Veículos ----------
create table if not exists public.veiculos (
  id           bigint generated always as identity primary key,
  cliente_id   bigint not null references public.clientes(id) on delete cascade,
  dados        text not null,
  placa_indice text not null unique,
  criado_em    timestamptz not null default now()
);

-- ---------- Notas de manutenção ----------
create table if not exists public.notas (
  id              bigint generated always as identity primary key,
  cliente_id      bigint not null references public.clientes(id) on delete cascade,
  veiculo_id      bigint not null references public.veiculos(id) on delete cascade,
  dados           text not null,
  arquivo_caminho text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- ---------- Fotos (de cliente OU de veículo) ----------
create table if not exists public.fotos (
  id         bigint generated always as identity primary key,
  cliente_id bigint references public.clientes(id) on delete cascade,
  veiculo_id bigint references public.veiculos(id) on delete cascade,
  caminho    text not null,
  dados      text not null,
  criado_em  timestamptz not null default now(),
  constraint foto_tem_um_dono check (num_nonnulls(cliente_id, veiculo_id) = 1)
);

create index if not exists idx_veiculos_cliente on public.veiculos(cliente_id);
create index if not exists idx_notas_cliente    on public.notas(cliente_id);
create index if not exists idx_notas_veiculo    on public.notas(veiculo_id);
create index if not exists idx_fotos_cliente    on public.fotos(cliente_id);
create index if not exists idx_fotos_veiculo    on public.fotos(veiculo_id);

-- ---------- Permissões ----------
-- Visitantes sem login (anon) não tocam em nada.
revoke all on public.cofre, public.clientes, public.veiculos, public.notas, public.fotos from anon;
grant select, insert, update, delete on public.clientes, public.veiculos, public.notas, public.fotos to authenticated;
-- O cofre pode ser lido, criado e atualizado, mas nunca apagado (apagar = perder tudo)
grant select, insert, update on public.cofre to authenticated;
revoke delete on public.cofre from authenticated;

-- Row Level Security: o banco confere o usuário em CADA linha
alter table public.cofre    enable row level security;
alter table public.clientes enable row level security;
alter table public.veiculos enable row level security;
alter table public.notas    enable row level security;
alter table public.fotos    enable row level security;

drop policy if exists "oficina" on public.cofre;
drop policy if exists "oficina_ler" on public.cofre;
drop policy if exists "oficina_criar" on public.cofre;
drop policy if exists "oficina_atualizar" on public.cofre;
create policy "oficina_ler"       on public.cofre for select to authenticated using (public.usuario_da_oficina());
create policy "oficina_criar"     on public.cofre for insert to authenticated with check (public.usuario_da_oficina());
create policy "oficina_atualizar" on public.cofre for update to authenticated
  using (public.usuario_da_oficina()) with check (public.usuario_da_oficina());

drop policy if exists "oficina" on public.clientes;
create policy "oficina" on public.clientes for all to authenticated
  using (public.usuario_da_oficina()) with check (public.usuario_da_oficina());

drop policy if exists "oficina" on public.veiculos;
create policy "oficina" on public.veiculos for all to authenticated
  using (public.usuario_da_oficina()) with check (public.usuario_da_oficina());

drop policy if exists "oficina" on public.notas;
create policy "oficina" on public.notas for all to authenticated
  using (public.usuario_da_oficina()) with check (public.usuario_da_oficina());

drop policy if exists "oficina" on public.fotos;
create policy "oficina" on public.fotos for all to authenticated
  using (public.usuario_da_oficina()) with check (public.usuario_da_oficina());

-- ---------- Arquivos (fotos e documentos Word, já criptografados) ----------
-- Balde PRIVADO: nada é público. Limite de 15 MB por arquivo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('arquivos', 'arquivos', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = 15728640;

drop policy if exists "oficina_arquivos_ler"    on storage.objects;
drop policy if exists "oficina_arquivos_enviar" on storage.objects;
drop policy if exists "oficina_arquivos_apagar" on storage.objects;

create policy "oficina_arquivos_ler" on storage.objects for select to authenticated
  using (bucket_id = 'arquivos' and public.usuario_da_oficina());
create policy "oficina_arquivos_enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'arquivos' and public.usuario_da_oficina());
create policy "oficina_arquivos_apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'arquivos' and public.usuario_da_oficina());
