-- =============================================================================
-- Migration 002: templates no Supabase + pastas em artes prontas
-- =============================================================================
-- Objetivos:
--   1) Mover templates do filesystem pro Supabase (habilita CRUD via UI em serverless)
--   2) Adicionar pastas/álbuns em ready_arts (agrupamento pra consultor navegar)
-- Idempotente.
-- =============================================================================

-- 1) Tabela templates ---------------------------------------------------------
create table if not exists public.templates (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  category      art_category not null default 'feed',
  format        art_format   not null default 'feed-4x5',
  width         int  not null,
  height        int  not null,
  thumbnail_url text not null,
  active        boolean not null default true,
  layers        jsonb not null default '[]'::jsonb,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists templates_active_idx  on public.templates (active);
create index if not exists templates_created_idx on public.templates (created_at desc);

drop trigger if exists templates_updated_at on public.templates;
create trigger templates_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

alter table public.templates enable row level security;

drop policy if exists "templates read approved" on public.templates;
drop policy if exists "templates admin all"     on public.templates;

create policy "templates read approved"
  on public.templates for select
  using (active = true and public.is_approved(auth.uid()));

create policy "templates admin all"
  on public.templates for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));


-- 2) Pastas de artes prontas --------------------------------------------------
create table if not exists public.art_folders (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  cover_url    text,
  position     int not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists art_folders_position_idx on public.art_folders (position, created_at);

drop trigger if exists art_folders_updated_at on public.art_folders;
create trigger art_folders_updated_at
  before update on public.art_folders
  for each row execute function public.set_updated_at();

alter table public.art_folders enable row level security;

drop policy if exists "art_folders read approved" on public.art_folders;
drop policy if exists "art_folders admin all"     on public.art_folders;

create policy "art_folders read approved"
  on public.art_folders for select
  using (public.is_approved(auth.uid()));

create policy "art_folders admin all"
  on public.art_folders for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));


-- 3) Coluna folder_id em ready_arts -------------------------------------------
alter table public.ready_arts
  add column if not exists folder_id uuid references public.art_folders(id) on delete set null;

create index if not exists ready_arts_folder_idx on public.ready_arts (folder_id);


-- 4) Bucket templates (público) -----------------------------------------------
insert into storage.buckets (id, name, public)
values ('templates', 'templates', true)
on conflict (id) do nothing;

drop policy if exists "templates public read"   on storage.objects;
drop policy if exists "templates admin write"   on storage.objects;
drop policy if exists "templates admin update"  on storage.objects;
drop policy if exists "templates admin delete"  on storage.objects;

create policy "templates public read"
  on storage.objects for select
  using (bucket_id = 'templates');

create policy "templates admin write"
  on storage.objects for insert
  with check (bucket_id = 'templates' and public.is_admin(auth.uid()));

create policy "templates admin update"
  on storage.objects for update
  using (bucket_id = 'templates' and public.is_admin(auth.uid()))
  with check (bucket_id = 'templates' and public.is_admin(auth.uid()));

create policy "templates admin delete"
  on storage.objects for delete
  using (bucket_id = 'templates' and public.is_admin(auth.uid()));
