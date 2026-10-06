-- ============================================================================
-- Migration 005 — CRM Fase 1 (contatos + timeline + notas + follow-ups)
-- ============================================================================
-- Pré-requisitos: migration 004 criou public.is_admin(uuid), public.is_gestor(uuid),
-- public.gestor_group_id(uuid), e as tabelas profiles + groups.
--
-- Modelo:
--   crm_contacts     — lead/cliente do consultor (RLS por owner_id ou grupo)
--   crm_interactions — timeline append-only (cotação, whatsapp, ligação, etc)
--   crm_notes        — notas livres editáveis
--   crm_followups    — agenda de retornos (data futura + feito/não feito)
-- ============================================================================

-- ───────────────────── extensões ────────────────────────────────────────────
create extension if not exists pg_trgm;

-- ───────────────────── enums ────────────────────────────────────────────────
do $$ begin
  create type public.crm_temperatura as enum ('quente', 'morno', 'frio');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.crm_status_ciclo as enum ('ativo', 'cliente', 'perdido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.crm_interacao_tipo as enum (
    'cotacao_rapida', 'cotacao_completa',
    'whatsapp', 'ligacao', 'reuniao', 'email',
    'nota_sistema', 'outro'
  );
exception when duplicate_object then null; end $$;

-- ───────────────────── crm_contacts ─────────────────────────────────────────
create table if not exists public.crm_contacts (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  group_id       uuid references public.groups(id) on delete set null, -- denormalized p/ RLS performática
  nome           text not null,
  telefone       text,
  telefone_norm  text generated always as (regexp_replace(coalesce(telefone,''), '\D', '', 'g')) stored,
  email          text,
  cidade         text,
  origem         text,                                      -- 'cotacao_rapida' | 'cotacao_completa' | 'manual' | 'importado'
  temperatura    public.crm_temperatura not null default 'morno',
  status_ciclo   public.crm_status_ciclo not null default 'ativo',
  last_touch_at  timestamptz,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- dedup por (owner, telefone_norm) quando houver telefone — índice parcial
create unique index if not exists crm_contacts_owner_telefone_uniq
  on public.crm_contacts (owner_id, telefone_norm)
  where telefone_norm <> '';

create index if not exists crm_contacts_owner_idx on public.crm_contacts (owner_id);
create index if not exists crm_contacts_group_idx on public.crm_contacts (group_id);
create index if not exists crm_contacts_last_touch_idx on public.crm_contacts (owner_id, last_touch_at desc nulls last);
create index if not exists crm_contacts_temp_idx on public.crm_contacts (owner_id, temperatura);
create index if not exists crm_contacts_status_idx on public.crm_contacts (owner_id, status_ciclo);
create index if not exists crm_contacts_nome_trgm on public.crm_contacts using gin (nome gin_trgm_ops);

-- trigger updated_at
create or replace function public.crm_touch_updated_at() returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

drop trigger if exists crm_contacts_touch on public.crm_contacts;
create trigger crm_contacts_touch before update on public.crm_contacts
  for each row execute function public.crm_touch_updated_at();

-- ───────────────────── crm_interactions (append-only) ───────────────────────
create table if not exists public.crm_interactions (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.crm_contacts(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade, -- denormalized
  tipo        public.crm_interacao_tipo not null,
  descricao   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists crm_interactions_contact_created_idx
  on public.crm_interactions (contact_id, created_at desc);
create index if not exists crm_interactions_owner_created_idx
  on public.crm_interactions (owner_id, created_at desc);

-- toda interação toca o last_touch_at do contato
create or replace function public.crm_bump_contact_touch() returns trigger as $$
begin
  update public.crm_contacts
    set last_touch_at = greatest(coalesce(last_touch_at, 'epoch'::timestamptz), new.created_at)
    where id = new.contact_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists crm_interactions_bump on public.crm_interactions;
create trigger crm_interactions_bump after insert on public.crm_interactions
  for each row execute function public.crm_bump_contact_touch();

-- ───────────────────── crm_notes (editáveis) ────────────────────────────────
create table if not exists public.crm_notes (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.crm_contacts(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  texto       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists crm_notes_contact_created_idx
  on public.crm_notes (contact_id, created_at desc);

drop trigger if exists crm_notes_touch on public.crm_notes;
create trigger crm_notes_touch before update on public.crm_notes
  for each row execute function public.crm_touch_updated_at();

-- ───────────────────── crm_followups (agenda) ───────────────────────────────
create table if not exists public.crm_followups (
  id              uuid primary key default gen_random_uuid(),
  contact_id      uuid not null references public.crm_contacts(id) on delete cascade,
  owner_id        uuid not null references auth.users(id) on delete cascade,
  data_followup   timestamptz not null,
  descricao       text,
  done            boolean not null default false,
  done_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists crm_followups_owner_pending_idx
  on public.crm_followups (owner_id, data_followup asc)
  where done = false;
create index if not exists crm_followups_contact_idx
  on public.crm_followups (contact_id, data_followup desc);

drop trigger if exists crm_followups_touch on public.crm_followups;
create trigger crm_followups_touch before update on public.crm_followups
  for each row execute function public.crm_touch_updated_at();

-- ───────────────────── RLS ──────────────────────────────────────────────────
alter table public.crm_contacts     enable row level security;
alter table public.crm_interactions enable row level security;
alter table public.crm_notes        enable row level security;
alter table public.crm_followups    enable row level security;

-- SELECT: owner OR admin OR (gestor E mesmo grupo do contato)
create policy crm_contacts_select on public.crm_contacts for select
  using (
    owner_id = auth.uid()
    or public.is_admin(auth.uid())
    or (public.is_gestor(auth.uid()) and group_id = public.gestor_group_id(auth.uid()))
  );

-- INSERT: só pelo próprio owner
create policy crm_contacts_insert on public.crm_contacts for insert
  with check (owner_id = auth.uid());

-- UPDATE: owner OU admin OU gestor-do-grupo
create policy crm_contacts_update on public.crm_contacts for update
  using (
    owner_id = auth.uid()
    or public.is_admin(auth.uid())
    or (public.is_gestor(auth.uid()) and group_id = public.gestor_group_id(auth.uid()))
  )
  with check (
    owner_id = auth.uid()
    or public.is_admin(auth.uid())
    or (public.is_gestor(auth.uid()) and group_id = public.gestor_group_id(auth.uid()))
  );

-- DELETE: só owner OU admin (gestor NÃO deleta)
create policy crm_contacts_delete on public.crm_contacts for delete
  using (owner_id = auth.uid() or public.is_admin(auth.uid()));

-- interactions, notes, followups: mesmo padrão simplificado (owner_id denormalizado)
create policy crm_interactions_select on public.crm_interactions for select
  using (
    owner_id = auth.uid()
    or public.is_admin(auth.uid())
    or (public.is_gestor(auth.uid()) and exists (
          select 1 from public.crm_contacts c
          where c.id = crm_interactions.contact_id
            and c.group_id = public.gestor_group_id(auth.uid())))
  );
create policy crm_interactions_insert on public.crm_interactions for insert
  with check (owner_id = auth.uid());
-- interações são append-only: não há UPDATE nem DELETE (nenhuma policy = negado por padrão)

create policy crm_notes_select on public.crm_notes for select
  using (
    owner_id = auth.uid()
    or public.is_admin(auth.uid())
    or (public.is_gestor(auth.uid()) and exists (
          select 1 from public.crm_contacts c
          where c.id = crm_notes.contact_id
            and c.group_id = public.gestor_group_id(auth.uid())))
  );
create policy crm_notes_insert on public.crm_notes for insert
  with check (owner_id = auth.uid());
create policy crm_notes_update on public.crm_notes for update
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));
create policy crm_notes_delete on public.crm_notes for delete
  using (owner_id = auth.uid() or public.is_admin(auth.uid()));

create policy crm_followups_select on public.crm_followups for select
  using (
    owner_id = auth.uid()
    or public.is_admin(auth.uid())
    or (public.is_gestor(auth.uid()) and exists (
          select 1 from public.crm_contacts c
          where c.id = crm_followups.contact_id
            and c.group_id = public.gestor_group_id(auth.uid())))
  );
create policy crm_followups_insert on public.crm_followups for insert
  with check (owner_id = auth.uid());
create policy crm_followups_update on public.crm_followups for update
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));
create policy crm_followups_delete on public.crm_followups for delete
  using (owner_id = auth.uid() or public.is_admin(auth.uid()));
