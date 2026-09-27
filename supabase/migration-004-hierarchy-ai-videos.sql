-- =============================================================================
-- Migration 004: hierarquia (grupos + gestor) + IA config/tracking + vídeos prontos
-- =============================================================================
-- Idempotente.

-- 1) Enum role expandido pra 3 níveis --------------------------------------
do $$ begin
  -- adiciona valor 'gestor' se ainda não existir
  alter type profile_role add value if not exists 'gestor';
exception when duplicate_object then null; end $$;

-- 2) Tabela groups (regionais / equipes) -----------------------------------
create table if not exists public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  region       text,
  description  text,
  cover_url    text,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists groups_position_idx on public.groups (position, created_at);

drop trigger if exists groups_updated_at on public.groups;
create trigger groups_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

alter table public.groups enable row level security;

drop policy if exists "groups read approved" on public.groups;
drop policy if exists "groups admin all"     on public.groups;

create policy "groups read approved"
  on public.groups for select
  using (public.is_approved(auth.uid()));

create policy "groups admin all"
  on public.groups for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- 3) profiles ganha group_id -----------------------------------------------
alter table public.profiles
  add column if not exists group_id uuid references public.groups(id) on delete set null;

create index if not exists profiles_group_idx on public.profiles (group_id);

-- helper: is_gestor(uid) ---------------------------------------------------
create or replace function public.is_gestor(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'gestor' and status = 'approved' from public.profiles where id = uid), false);
$$;

-- helper: gestor_group(uid) → uuid dos grupos que o gestor gerencia --------
create or replace function public.gestor_group_id(uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select group_id from public.profiles where id = uid;
$$;

-- Policies profiles: gestor vê seus consultores + o próprio ---------------
drop policy if exists "profiles read gestor" on public.profiles;
create policy "profiles read gestor"
  on public.profiles for select
  using (
    public.is_gestor(auth.uid())
    and group_id is not null
    and group_id = public.gestor_group_id(auth.uid())
  );

-- Gestor pode atualizar consultores do seu grupo (aprovar, rejeitar, dados básicos)
drop policy if exists "profiles update gestor" on public.profiles;
create policy "profiles update gestor"
  on public.profiles for update
  using (
    public.is_gestor(auth.uid())
    and role = 'consultant'
    and group_id is not null
    and group_id = public.gestor_group_id(auth.uid())
  )
  with check (
    public.is_gestor(auth.uid())
    and role = 'consultant'
  );

-- 4) admin_settings — key/value jsonb (API keys, quotas, configs) ---------
create table if not exists public.admin_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);

drop trigger if exists admin_settings_updated_at on public.admin_settings;
create trigger admin_settings_updated_at
  before update on public.admin_settings
  for each row execute function public.set_updated_at();

alter table public.admin_settings enable row level security;

drop policy if exists "admin_settings admin all" on public.admin_settings;
create policy "admin_settings admin all"
  on public.admin_settings for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Seed padrão de quotas (admin edita depois)
insert into public.admin_settings (key, value, description) values
  ('api_keys', '{"openai": "", "elevenlabs": "", "fal": "", "replicate": ""}'::jsonb, 'API keys de providers externos'),
  ('quotas', '{"consultor": {"text": 30, "image": 10, "voice_chars": 10000, "transcribe_min": 20}, "gestor": {"text": 100, "image": 50, "voice_chars": 50000, "transcribe_min": 60}, "admin": {"text": -1, "image": -1, "voice_chars": -1, "transcribe_min": -1}}'::jsonb, 'Quotas mensais por role (-1 = ilimitado)'),
  ('brand_context', '{"company": "LOOG", "product": "proteção veicular", "tone": "confiante, próximo, direto", "values": "segurança, agilidade, confiança", "cta_default": "Fale comigo agora"}'::jsonb, 'Contexto da marca injetado nas gerações IA')
on conflict (key) do nothing;

-- 5) ai_generations — histórico + custos ----------------------------------
do $$ begin
  create type ai_gen_type as enum ('text', 'image', 'voice', 'transcribe');
exception when duplicate_object then null; end $$;

create table if not exists public.ai_generations (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  type         ai_gen_type not null,
  model        text,
  prompt       text,
  result       jsonb,
  tokens_in    int default 0,
  tokens_out   int default 0,
  cost_usd     numeric(10, 6) default 0,
  duration_ms  int,
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists ai_generations_profile_idx on public.ai_generations (profile_id, created_at desc);
create index if not exists ai_generations_type_idx on public.ai_generations (type, created_at desc);

alter table public.ai_generations enable row level security;

drop policy if exists "ai_generations read own"   on public.ai_generations;
drop policy if exists "ai_generations insert own" on public.ai_generations;
drop policy if exists "ai_generations admin all"  on public.ai_generations;

create policy "ai_generations read own"
  on public.ai_generations for select
  using (auth.uid() = profile_id);

create policy "ai_generations insert own"
  on public.ai_generations for insert
  with check (auth.uid() = profile_id);

create policy "ai_generations admin all"
  on public.ai_generations for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- 6) ready_video_folders + ready_videos ----------------------------------
create table if not exists public.ready_video_folders (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  cover_url    text,
  position     int not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists ready_video_folders_position_idx on public.ready_video_folders (position, created_at);

drop trigger if exists ready_video_folders_updated_at on public.ready_video_folders;
create trigger ready_video_folders_updated_at
  before update on public.ready_video_folders
  for each row execute function public.set_updated_at();

alter table public.ready_video_folders enable row level security;

drop policy if exists "ready_video_folders read approved" on public.ready_video_folders;
drop policy if exists "ready_video_folders admin all"     on public.ready_video_folders;

create policy "ready_video_folders read approved"
  on public.ready_video_folders for select
  using (public.is_approved(auth.uid()));

create policy "ready_video_folders admin all"
  on public.ready_video_folders for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

do $$ begin
  create type video_format as enum ('reel-9x16', 'square-1x1', 'landscape-16x9');
exception when duplicate_object then null; end $$;

create table if not exists public.ready_videos (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  category        art_category not null default 'feed',
  format          video_format not null default 'reel-9x16',
  folder_id       uuid references public.ready_video_folders(id) on delete set null,
  video_url       text not null,
  thumbnail_url   text,
  duration_sec    int,
  size_bytes      bigint,
  active          boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists ready_videos_active_idx  on public.ready_videos (active);
create index if not exists ready_videos_folder_idx  on public.ready_videos (folder_id);
create index if not exists ready_videos_created_idx on public.ready_videos (created_at desc);

drop trigger if exists ready_videos_updated_at on public.ready_videos;
create trigger ready_videos_updated_at
  before update on public.ready_videos
  for each row execute function public.set_updated_at();

alter table public.ready_videos enable row level security;

drop policy if exists "ready_videos read approved" on public.ready_videos;
drop policy if exists "ready_videos admin all"     on public.ready_videos;

create policy "ready_videos read approved"
  on public.ready_videos for select
  using (active = true and public.is_approved(auth.uid()));

create policy "ready_videos admin all"
  on public.ready_videos for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- 7) Bucket ready-videos (público) ----------------------------------------
insert into storage.buckets (id, name, public)
values ('ready-videos', 'ready-videos', true)
on conflict (id) do nothing;

drop policy if exists "ready-videos public read"   on storage.objects;
drop policy if exists "ready-videos admin write"   on storage.objects;
drop policy if exists "ready-videos admin update"  on storage.objects;
drop policy if exists "ready-videos admin delete"  on storage.objects;

create policy "ready-videos public read"
  on storage.objects for select
  using (bucket_id = 'ready-videos');

create policy "ready-videos admin write"
  on storage.objects for insert
  with check (bucket_id = 'ready-videos' and public.is_admin(auth.uid()));

create policy "ready-videos admin update"
  on storage.objects for update
  using (bucket_id = 'ready-videos' and public.is_admin(auth.uid()))
  with check (bucket_id = 'ready-videos' and public.is_admin(auth.uid()));

create policy "ready-videos admin delete"
  on storage.objects for delete
  using (bucket_id = 'ready-videos' and public.is_admin(auth.uid()));

-- 8) Helper: quota_used_this_month(profile_id, type) → int ---------------
create or replace function public.quota_used_this_month(p_profile_id uuid, p_type ai_gen_type)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(count(*)::int, 0)
    from public.ai_generations
   where profile_id = p_profile_id
     and type = p_type
     and error is null
     and created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo');
$$;
