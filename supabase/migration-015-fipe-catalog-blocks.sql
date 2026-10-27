-- Migration 015: Catalogo FIPE (marcas/modelos) + sistema de bloqueios
-- Fonte: API parallelum (https://parallelum.com.br/fipe/api/v1)
-- Permite: admin bloquear uma marca inteira OU um modelo especifico
-- (ex: "nao aceitar Tesla por preco", "nao aceitar Hilux ano >2024 por sinistro")

-- ============================================================
-- 1) Catalogo de MARCAS por tipo FIPE
-- ============================================================
create table if not exists public.fipe_catalog_marcas (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('carros', 'motos', 'caminhoes')),
  codigo          text not null,       -- codigo FIPE da marca (ex: "59" pra Volkswagen)
  nome            text not null,
  nome_norm       text generated always as (lower(regexp_replace(nome, '[^a-zA-Z0-9]', '', 'g'))) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tipo, codigo)
);
create index if not exists fipe_catalog_marcas_tipo_idx on public.fipe_catalog_marcas (tipo);
create index if not exists fipe_catalog_marcas_nome_norm_idx on public.fipe_catalog_marcas (nome_norm);

-- ============================================================
-- 2) Catalogo de MODELOS por tipo+marca
-- ============================================================
create table if not exists public.fipe_catalog_modelos (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('carros', 'motos', 'caminhoes')),
  marca_codigo    text not null,
  marca_nome      text not null,
  codigo          text not null,       -- codigo FIPE do modelo
  nome            text not null,
  nome_norm       text generated always as (lower(regexp_replace(nome, '[^a-zA-Z0-9]', '', 'g'))) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tipo, marca_codigo, codigo)
);
create index if not exists fipe_catalog_modelos_tipo_marca_idx on public.fipe_catalog_modelos (tipo, marca_codigo);
create index if not exists fipe_catalog_modelos_nome_norm_idx on public.fipe_catalog_modelos (nome_norm);

-- ============================================================
-- 3) BLOQUEIOS — admin configura o que nao aceitar cotar
-- ============================================================
create table if not exists public.vehicle_blocks (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('carros', 'motos', 'caminhoes')),
  marca_codigo    text not null,
  marca_nome      text not null,
  modelo_codigo   text,                -- null = bloqueia a marca inteira
  modelo_nome     text,                -- null = bloqueia a marca inteira
  motivo          text,                -- "preco alto", "sinistro frequente", etc
  ativo           boolean not null default true,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists vehicle_blocks_lookup_idx on public.vehicle_blocks (tipo, marca_codigo, modelo_codigo) where ativo;

-- Trigger updated_at
do $$ begin
  create trigger fipe_catalog_marcas_set_updated_at before update on public.fipe_catalog_marcas
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger fipe_catalog_modelos_set_updated_at before update on public.fipe_catalog_modelos
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger vehicle_blocks_set_updated_at before update on public.vehicle_blocks
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- RLS: todos leem catalogo, so admin bloqueia
alter table public.fipe_catalog_marcas enable row level security;
alter table public.fipe_catalog_modelos enable row level security;
alter table public.vehicle_blocks enable row level security;

drop policy if exists "fipe_marcas read all" on public.fipe_catalog_marcas;
create policy "fipe_marcas read all" on public.fipe_catalog_marcas for select using (true);

drop policy if exists "fipe_modelos read all" on public.fipe_catalog_modelos;
create policy "fipe_modelos read all" on public.fipe_catalog_modelos for select using (true);

drop policy if exists "blocks read all" on public.vehicle_blocks;
create policy "blocks read all" on public.vehicle_blocks for select using (true);
drop policy if exists "blocks write admin" on public.vehicle_blocks;
create policy "blocks write admin" on public.vehicle_blocks for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'gestor'))
);
