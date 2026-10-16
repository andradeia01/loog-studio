-- =============================================================================
-- Migration 011: Esqueleto associados LOOG — primeiro passo pra virar o novo SIVIS
-- =============================================================================
-- Adapta o schema Prisma do SOFTWARE legado (arquivado em Desktop/_arquivo-2026/)
-- pra PostgreSQL + Supabase RLS, com nomes consistentes com o padrão atual
-- (snake_case + prefixo de domínio).
--
-- Fase 1 (esta migration): members, vehicles, fipe_cache, plans
-- Fase 2 (futura): quotes, policies, claims, payments, dunning, commissions
--
-- Valores monetários: SEMPRE em cents (BIGINT pra FIPE que passa R$ 21M; INT
-- pra mensalidades e taxas). Nunca float. Nunca decimal.
-- =============================================================================

-- ─── ENUMs ─────────────────────────────────────────────────────────────────
do $$ begin
  create type member_status as enum ('ativo', 'inadimplente', 'suspenso', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vehicle_type as enum ('carro', 'moto', 'utilitario', 'eletrico', 'caminhao');
exception when duplicate_object then null; end $$;

do $$ begin
  create type plan_participation_type as enum ('fixed_cents', 'percent_bp');
exception when duplicate_object then null; end $$;

-- ─── TABELA: members (associados) ──────────────────────────────────────────
-- Associado = pessoa física/jurídica que contrata o plano LOOG.
-- NÃO é o mesmo que `profiles` (que são usuários do sistema — consultores,
-- gestores, admins). Um consultor pode gerenciar vários associados.
create table if not exists public.members (
  id                uuid primary key default gen_random_uuid(),
  matricula         text unique not null,  -- código interno LOOG (ex: "LG-0001234")
  nome              text not null,
  cpf_cnpj          text,
  rg                text,
  email             text,
  telefone          text,
  data_nascimento   date,
  cep               text,
  endereco          text,
  numero            text,
  complemento       text,
  bairro            text,
  cidade            text,
  uf                text,
  status            member_status not null default 'ativo',

  -- Quem gerencia esse associado (consultor que vendeu)
  owner_consultant_id uuid references public.profiles(id) on delete set null,
  group_id            uuid references public.groups(id) on delete set null,

  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists members_cpf_cnpj_idx on public.members (cpf_cnpj);
create index if not exists members_email_idx on public.members (email);
create index if not exists members_telefone_idx on public.members (telefone);
create index if not exists members_owner_consultant_idx on public.members (owner_consultant_id);
create index if not exists members_group_idx on public.members (group_id);
create index if not exists members_status_idx on public.members (status);

-- ─── TABELA: vehicles (veículos dos associados) ────────────────────────────
-- Um associado pode ter N veículos. Cada veículo tem UM proprietário (member)
-- e pode mudar de dono (criar novo registro com previous_vehicle_id).
create table if not exists public.vehicles (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references public.members(id) on delete cascade,

  placa             text not null,
  tipo              vehicle_type not null,
  marca             text not null,
  modelo            text not null,
  versao            text,
  ano_modelo        integer not null,
  ano_fabricacao    integer,
  cor               text,
  combustivel       text,
  renavam           text,
  chassi            text,

  -- Snapshot FIPE no momento do cadastro
  fipe_code         text,
  fipe_value_cents  bigint,
  fipe_reference    text,  -- ex: "setembro/2026"
  fipe_fetched_at   timestamptz,

  -- Histórico (quando o mesmo veículo troca de dono dentro da LOOG)
  previous_vehicle_id uuid references public.vehicles(id) on delete set null,

  active            boolean not null default true,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists vehicles_member_idx on public.vehicles (member_id);
create index if not exists vehicles_placa_idx on public.vehicles (placa);
create index if not exists vehicles_tipo_idx on public.vehicles (tipo);
create index if not exists vehicles_active_idx on public.vehicles (active);

-- ─── TABELA: fipe_cache (cache de consultas FIPE pra reduzir custo API) ────
-- Cache dura 1 mês (reference FIPE muda mensalmente). Dedup por tipo + código + ano.
create table if not exists public.fipe_cache (
  id             uuid primary key default gen_random_uuid(),
  vehicle_type   vehicle_type not null,
  fipe_code      text not null,
  year_id        text not null,  -- "2022-1" (ano-combustível)
  brand          text not null,
  model          text not null,
  fuel           text,
  value_cents    bigint not null,
  reference      text not null,
  reference_month integer not null,
  reference_year  integer not null,
  fetched_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  unique (vehicle_type, fipe_code, year_id)
);
create index if not exists fipe_cache_expires_idx on public.fipe_cache (expires_at);

-- ─── TABELA: plans (planos COTA LOOG) ──────────────────────────────────────
-- Baseado no Planos.xlsx oficial: 1 plano = 1 linha comercial (COTA 1.0,
-- COTA 2.5 MOTO, UTILITÁRIOS 3.0, etc.) com faixa FIPE + mensalidade + participação.
create table if not exists public.plans (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text unique not null,  -- "cota-1-0", "cota-2-5-moto"
  name                     text not null,          -- "COTA 1.0", "COTA 2.5 MOTO"
  group_name               text not null,          -- "CONTRATOS", "UTILITÁRIOS"
  vehicle_type             vehicle_type not null,
  vehicle_type_label       text not null,          -- "Carro", "Moto", "Utilitário"
  min_fipe_cents           bigint not null default 0,
  max_fipe_cents           bigint,                 -- null = sem teto
  monthly_cents            integer not null,       -- mensalidade base
  participation_type       plan_participation_type not null,
  participation_value      integer not null,       -- cents (FIXED) ou basis points (PERCENT)
  payment_options          text,                   -- "PIX - 34.90|BOL - 34.90|..."
  extras                   text,                   -- "Reboque, Assistência 24h..."
  adhesion_service         text,                   -- "TAXA DE ADESÃO"
  sell_on_site             boolean not null default true,
  favorite                 boolean not null default false,
  installments             boolean not null default true,
  year_limit               integer,                -- limite de anos do veículo
  monthly_includes_adhesion boolean not null default true,
  active                   boolean not null default true,
  display_order            integer not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists plans_active_type_idx on public.plans (active, vehicle_type);
create index if not exists plans_vehicle_fipe_idx on public.plans (vehicle_type, min_fipe_cents, max_fipe_cents);

-- ─── Trigger universal pra updated_at ──────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
do $$ begin
  create trigger members_set_updated_at before update on public.members
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger vehicles_set_updated_at before update on public.vehicles
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger plans_set_updated_at before update on public.plans
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ─── RLS: habilita e aplica políticas ──────────────────────────────────────
alter table public.members    enable row level security;
alter table public.vehicles   enable row level security;
alter table public.fipe_cache enable row level security;
alter table public.plans      enable row level security;

-- members: admin vê tudo; gestor vê do seu grupo; consultor vê os próprios
drop policy if exists "members read admin"       on public.members;
drop policy if exists "members read gestor"      on public.members;
drop policy if exists "members read owner"       on public.members;
drop policy if exists "members write admin"      on public.members;
drop policy if exists "members write owner"      on public.members;

create policy "members read admin"  on public.members for select using (public.is_admin(auth.uid()));
create policy "members read gestor" on public.members for select using (
  public.is_gestor(auth.uid()) and group_id = public.gestor_group_id(auth.uid())
);
create policy "members read owner"  on public.members for select using (
  public.is_approved(auth.uid()) and owner_consultant_id = auth.uid()
);
create policy "members write admin" on public.members for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "members write owner" on public.members for insert with check (
  public.is_approved(auth.uid()) and owner_consultant_id = auth.uid()
);

-- vehicles: segue a mesma lógica via member
drop policy if exists "vehicles read admin"     on public.vehicles;
drop policy if exists "vehicles read via member" on public.vehicles;
drop policy if exists "vehicles write admin"    on public.vehicles;
drop policy if exists "vehicles write via member" on public.vehicles;

create policy "vehicles read admin" on public.vehicles for select using (public.is_admin(auth.uid()));
create policy "vehicles read via member" on public.vehicles for select using (
  exists (
    select 1 from public.members m
    where m.id = vehicles.member_id
      and (
        public.is_admin(auth.uid()) or
        (public.is_gestor(auth.uid()) and m.group_id = public.gestor_group_id(auth.uid())) or
        (public.is_approved(auth.uid()) and m.owner_consultant_id = auth.uid())
      )
  )
);
create policy "vehicles write admin" on public.vehicles for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- fipe_cache: todos aprovados leem (cache compartilhado); só admin escreve manualmente
drop policy if exists "fipe_cache read approved" on public.fipe_cache;
drop policy if exists "fipe_cache admin all"     on public.fipe_cache;
create policy "fipe_cache read approved" on public.fipe_cache for select using (public.is_approved(auth.uid()));
create policy "fipe_cache admin all"     on public.fipe_cache for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
-- Nota: inserts/updates do cache vêm do backend com service_role, bypass RLS.

-- plans: todos aprovados leem ativos; admin faz CRUD
drop policy if exists "plans read approved" on public.plans;
drop policy if exists "plans admin all"     on public.plans;
create policy "plans read approved" on public.plans for select using (public.is_approved(auth.uid()) and active = true);
create policy "plans admin all"     on public.plans for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ─── Comentários pra documentação viva ─────────────────────────────────────
comment on table public.members    is 'Associados LOOG — pessoa física/jurídica contratante do plano. Diferente de profiles (usuários do sistema).';
comment on table public.vehicles   is 'Veículos vinculados aos associados. Pode mudar de dono via previous_vehicle_id.';
comment on table public.fipe_cache is 'Cache mensal de consultas FIPE pra reduzir custo com PlacaFIPE API.';
comment on table public.plans      is 'Catálogo de planos LOOG (COTA 1.0, 2.5, etc.) importado do Planos.xlsx oficial.';
