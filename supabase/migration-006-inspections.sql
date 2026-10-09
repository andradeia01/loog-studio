-- ================================================================
-- Migration 006 — Vistoria em vídeo (apps/vistoria integrado)
-- ================================================================
-- Rode isso no Supabase SQL Editor como service_role (ou admin).
-- Idempotente: todos os CREATEs são "IF NOT EXISTS".

-- ============== Enums ==============
do $$ begin
  create type inspection_status as enum (
    'DRAFT',          -- esboço, consultor começou mas não gravou
    'RECORDING',      -- gravando no cliente (não persistido ainda)
    'UPLOADING',      -- subindo pro Storage
    'PROCESSING',     -- IA analisando
    'APPROVED',       -- IA aprovou
    'REJECTED',       -- IA reprovou (motivo detalhado)
    'NEEDS_REVIEW'    -- IA confuso, aguarda humano
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type inspection_mode as enum (
    'PRESENCIAL',     -- consultor fez junto do associado
    'REMOTE'          -- link JWT, associado fez sozinho
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type capture_kind as enum (
    'OPERATOR_SELFIE',   -- foto de quem está fazendo (anti-fraude)
    'VIDEO',             -- gravação principal 360º
    'FRAME',             -- frame extraído do vídeo
    'ODOMETER_PHOTO',    -- foto extra do painel ligado
    'CHASSIS_PHOTO',     -- foto do número do chassi (grav.ante-cabine ou motor)
    'ENGINE_PHOTO',      -- foto do cofre do motor (capô aberto)
    'DAMAGE_PHOTO'       -- foto extra de avaria apontada pela IA
  );
exception when duplicate_object then null; end $$;

-- Caso o enum já existisse sem ENGINE_PHOTO (migration rodada antes dessa alteração),
-- adiciona o valor idempotente:
alter type capture_kind add value if not exists 'ENGINE_PHOTO';

-- ============== Tabela principal ==============
create table if not exists public.inspections (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,

  -- Dados do veículo (preenchidos pelo PlacaStudio ou manual)
  placa           text not null,
  marca           text,
  modelo          text,
  ano             int,
  cor             text,
  fipe_valor      text,       -- "R$ 114.093,00" (string pra manter formato)
  fipe_codigo     text,

  -- Dados do associado (obrigatórios no insert via API)
  nome_associado  text,
  telefone_associado text,

  -- Tipo da vistoria: NOVA (primeira vez) ou MIGRACAO (vinha de outra proteção/seguradora)
  tipo_vistoria   text not null default 'NOVA' check (tipo_vistoria in ('NOVA','MIGRACAO')),
  -- Se MIGRACAO, qual seguradora/associação o lead está deixando
  migracao_origem text,

  -- Modo + status
  mode            inspection_mode not null default 'PRESENCIAL',
  status          inspection_status not null default 'DRAFT',

  -- Localização capturada
  gps_lat         double precision,
  gps_lng         double precision,
  gps_accuracy_m  double precision,
  gps_timestamp   timestamptz,

  -- Resultado da análise IA (JSON denso)
  ai_result       jsonb,
  ai_approved     boolean,
  ai_reason       text,       -- motivo da reprovação (se houver)
  ai_model_used   text,       -- "claude-sonnet-5-5" etc
  ai_processed_at timestamptz,

  -- Transcrição do áudio (Web Speech ou Whisper)
  audio_transcript text,

  -- Link remoto (se mode=REMOTE)
  remote_token    text unique,       -- JWT
  remote_token_expires_at timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists inspections_owner_idx on public.inspections(owner_id);
create index if not exists inspections_status_idx on public.inspections(status);
create index if not exists inspections_placa_idx on public.inspections(placa);
create index if not exists inspections_created_idx on public.inspections(created_at desc);
create index if not exists inspections_remote_token_idx on public.inspections(remote_token) where remote_token is not null;

-- Backfill idempotente pra quem rodou a versão anterior da migration (sem tipo_vistoria/migracao_origem):
alter table public.inspections add column if not exists tipo_vistoria text not null default 'NOVA';
alter table public.inspections add column if not exists migracao_origem text;
-- Garante o CHECK mesmo após o add column:
do $$ begin
  alter table public.inspections add constraint inspections_tipo_vistoria_check check (tipo_vistoria in ('NOVA','MIGRACAO'));
exception when duplicate_object then null; when others then null; end $$;

-- ============== Capturas (vídeo + fotos + frames) ==============
create table if not exists public.inspection_captures (
  id              uuid primary key default gen_random_uuid(),
  inspection_id   uuid not null references public.inspections(id) on delete cascade,
  kind            capture_kind not null,

  -- Arquivo no Storage
  storage_path    text not null,     -- "inspection-media/{inspection_id}/{filename}"
  mime_type       text not null,
  size_bytes      bigint,

  -- Metadata do capture
  -- (pra VIDEO: duração; pra FRAME: timestamp_ms + ângulo detectado; pra ODOMETER: km lido)
  metadata        jsonb,

  created_at      timestamptz not null default now()
);

create index if not exists inspection_captures_inspection_idx on public.inspection_captures(inspection_id);
create index if not exists inspection_captures_kind_idx on public.inspection_captures(kind);

-- ============== Trigger updated_at ==============
create or replace function public.inspections_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists inspections_updated_at on public.inspections;
create trigger inspections_updated_at
  before update on public.inspections
  for each row execute function public.inspections_set_updated_at();

-- ============== Row Level Security ==============
alter table public.inspections enable row level security;
alter table public.inspection_captures enable row level security;

-- Consultor vê e edita só as próprias vistorias.
-- Admin + consultant_sdr veem todas.
drop policy if exists inspections_select on public.inspections;
create policy inspections_select on public.inspections
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'consultant_sdr')
    )
  );

drop policy if exists inspections_insert on public.inspections;
create policy inspections_insert on public.inspections
  for insert with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'approved'
    )
  );

drop policy if exists inspections_update on public.inspections;
create policy inspections_update on public.inspections
  for update using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Captures seguem a vistoria dona
drop policy if exists inspection_captures_select on public.inspection_captures;
create policy inspection_captures_select on public.inspection_captures
  for select using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
      and (
        i.owner_id = auth.uid()
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role in ('admin', 'consultant_sdr')
        )
      )
    )
  );

drop policy if exists inspection_captures_insert on public.inspection_captures;
create policy inspection_captures_insert on public.inspection_captures
  for insert with check (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id and i.owner_id = auth.uid()
    )
  );

-- ============== Storage bucket inspection-media ==============
-- PRIVADO (vistoria contém dados sensíveis + biometria)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inspection-media',
  'inspection-media',
  false,
  104857600,  -- 100 MB max por arquivo (vídeos)
  array[
    'video/mp4','video/webm','video/quicktime',
    'image/jpeg','image/png','image/webp',
    'audio/webm','audio/ogg','audio/mpeg'
  ]
)
on conflict (id) do nothing;

-- Policies do bucket: consultor acessa só seus arquivos, admin acessa tudo
drop policy if exists inspection_media_select on storage.objects;
create policy inspection_media_select on storage.objects
  for select using (
    bucket_id = 'inspection-media'
    and (
      -- consultor dono (path começa com user_id/)
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('admin', 'consultant_sdr')
      )
    )
  );

drop policy if exists inspection_media_insert on storage.objects;
create policy inspection_media_insert on storage.objects
  for insert with check (
    bucket_id = 'inspection-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists inspection_media_delete on storage.objects;
create policy inspection_media_delete on storage.objects
  for delete using (
    bucket_id = 'inspection-media'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    )
  );

-- ============== Fim ==============
-- Confirma criação:
select
  (select count(*) from public.inspections) as inspections_count,
  (select count(*) from public.inspection_captures) as captures_count,
  (select count(*) from storage.buckets where id = 'inspection-media') as bucket_exists;
