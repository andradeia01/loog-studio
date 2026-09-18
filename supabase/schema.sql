-- =============================================================================
-- LOOG Studio — schema Supabase
-- =============================================================================
-- Cole tudo isso no SQL Editor do Supabase e execute.
-- Cria: profiles (com aprovação), ready_arts, generated_arts, triggers,
--       RLS (isolamento entre consultores), buckets e políticas de storage.
-- Idempotente: pode rodar de novo sem quebrar (drops guardados).
-- =============================================================================

-- Extensions ------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Enums -----------------------------------------------------------------------
do $$ begin
  create type profile_role   as enum ('admin', 'consultant');
exception when duplicate_object then null; end $$;

do $$ begin
  create type profile_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type art_category   as enum ('institucional','vendas','protecao','recrutamento','stories','feed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type art_format     as enum ('feed-1x1','feed-4x5','story-9x16');
exception when duplicate_object then null; end $$;

-- profiles --------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text unique not null,
  full_name     text,
  phone         text,
  instagram     text,
  city          text,
  photo_url     text,
  role          profile_role   not null default 'consultant',
  status        profile_status not null default 'pending',
  rejected_reason text,
  approved_at   timestamptz,
  approved_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists profiles_role_idx   on public.profiles (role);

-- ready_arts (artes prontas pra baixar, sem personalização) -------------------
create table if not exists public.ready_arts (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  category        art_category not null default 'feed',
  format          art_format   not null default 'feed-4x5',
  image_url       text not null,        -- URL pública do arquivo em Storage
  thumbnail_url  text,                  -- opcional; se null, cliente usa image_url
  active          boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists ready_arts_active_idx  on public.ready_arts (active);
create index if not exists ready_arts_created_idx on public.ready_arts (created_at desc);

-- generated_arts (histórico opcional das artes personalizadas geradas) --------
create table if not exists public.generated_arts (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references public.profiles(id) on delete cascade,
  template_slug text not null,
  image_url     text,                   -- opcional (só se salvar em Storage)
  created_at    timestamptz not null default now()
);

create index if not exists generated_arts_profile_idx on public.generated_arts (profile_id, created_at desc);

-- Trigger: cria profile automaticamente quando auth.users é criado ------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, city, instagram)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'city', ''),
    coalesce(new.raw_user_meta_data->>'instagram', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger: updated_at -----------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists ready_arts_updated_at on public.ready_arts;
create trigger ready_arts_updated_at
  before update on public.ready_arts
  for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS (Row Level Security)
-- =============================================================================

alter table public.profiles       enable row level security;
alter table public.ready_arts     enable row level security;
alter table public.generated_arts enable row level security;

-- helper: is_admin(uid) -------------------------------------------------------
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' and status = 'approved' from public.profiles where id = uid), false);
$$;

-- helper: is_approved(uid) ----------------------------------------------------
create or replace function public.is_approved(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'approved' from public.profiles where id = uid), false);
$$;

-- profiles: cada um lê o seu; admin lê todos; admin edita todos --------------
drop policy if exists "profiles read own"     on public.profiles;
drop policy if exists "profiles read all admin" on public.profiles;
drop policy if exists "profiles update own"   on public.profiles;
drop policy if exists "profiles update admin" on public.profiles;
drop policy if exists "profiles insert self"  on public.profiles;

create policy "profiles read own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles read all admin"
  on public.profiles for select
  using (public.is_admin(auth.uid()));

create policy "profiles update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role   = (select role   from public.profiles where id = auth.uid())
    and status = (select status from public.profiles where id = auth.uid())
  );

create policy "profiles update admin"
  on public.profiles for update
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "profiles insert self"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ready_arts: aprovados leem os ativos; admin faz tudo ------------------------
drop policy if exists "ready_arts read approved" on public.ready_arts;
drop policy if exists "ready_arts admin all"     on public.ready_arts;

create policy "ready_arts read approved"
  on public.ready_arts for select
  using (active = true and public.is_approved(auth.uid()));

create policy "ready_arts admin all"
  on public.ready_arts for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- generated_arts: cada consultor vê o seu histórico; admin vê tudo ------------
drop policy if exists "generated_arts read own"   on public.generated_arts;
drop policy if exists "generated_arts insert own" on public.generated_arts;
drop policy if exists "generated_arts admin all"  on public.generated_arts;

create policy "generated_arts read own"
  on public.generated_arts for select
  using (auth.uid() = profile_id);

create policy "generated_arts insert own"
  on public.generated_arts for insert
  with check (auth.uid() = profile_id and public.is_approved(auth.uid()));

create policy "generated_arts admin all"
  on public.generated_arts for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- =============================================================================
-- Storage buckets
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('consultant-photos', 'consultant-photos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('ready-arts', 'ready-arts', true)
on conflict (id) do nothing;

-- policies storage: consultant-photos (cada um lê/grava sua pasta) ------------
drop policy if exists "photos read own"   on storage.objects;
drop policy if exists "photos write own"  on storage.objects;
drop policy if exists "photos delete own" on storage.objects;

create policy "photos read own"
  on storage.objects for select
  using (
    bucket_id = 'consultant-photos'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin(auth.uid()))
  );

create policy "photos write own"
  on storage.objects for insert
  with check (
    bucket_id = 'consultant-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "photos delete own"
  on storage.objects for delete
  using (
    bucket_id = 'consultant-photos'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin(auth.uid()))
  );

-- policies storage: ready-arts (público lê; admin escreve) --------------------
drop policy if exists "ready-arts public read" on storage.objects;
drop policy if exists "ready-arts admin write" on storage.objects;
drop policy if exists "ready-arts admin delete" on storage.objects;

create policy "ready-arts public read"
  on storage.objects for select
  using (bucket_id = 'ready-arts');

create policy "ready-arts admin write"
  on storage.objects for insert
  with check (bucket_id = 'ready-arts' and public.is_admin(auth.uid()));

create policy "ready-arts admin delete"
  on storage.objects for delete
  using (bucket_id = 'ready-arts' and public.is_admin(auth.uid()));

-- =============================================================================
-- Seed do primeiro admin
-- =============================================================================
-- 1) Cadastre um usuário via Auth → Users no dashboard Supabase (email+senha).
-- 2) Depois rode isto, trocando o email:
--
--    update public.profiles
--    set role = 'admin', status = 'approved', approved_at = now()
--    where email = 'seu-email-admin@loog.com.br';
-- =============================================================================
