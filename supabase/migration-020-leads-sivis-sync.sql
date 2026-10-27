-- =============================================================================
-- Migration 020: LOOG Studio como sistema completo — pipeline de LEADS
-- =============================================================================
-- Luís 27/10/2026 — decisão arquitetural:
--   "LOOG Studio é o sistema completo. SIVIS vira sync invisível em background.
--    Consultor nunca sai do LOOG."
--
-- Essa migration cria a espinha dorsal:
--   leads                       — entrada no funil (contratante)
--   lead_vehicles               — veículo(s) vinculado(s) ao lead
--   lead_documents              — metadata dos docs (arquivo real em Storage)
--   lead_pendencias             — pendências do lead (CNH, CRLV, etc.)
--   lead_timeline               — histórico de eventos (auditoria)
--   consultor_sivis_credentials — credenciais SIVIS do consultor (AES-256-GCM)
--   sivis_sync_queue            — fila durável de sync pro SIVIS (retry policy)
--
-- Fluxo end-to-end desenhado:
--   Consultor opera 100% no LOOG → LOOG grava local (fonte de verdade) →
--   worker em background sincroniza invisivelmente pro SIVIS usando a
--   credencial criptografada do consultor → marca sivis_id no lead.
--
-- SIVIS continua funcionando normal durante os 6-9 meses de transição;
-- depois do desligamento, as tabelas acima continuam sendo a fonte de verdade.
-- =============================================================================

-- ─── 1. LEADS ──────────────────────────────────────────────────────────────────
create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  consultor_id    uuid not null references public.profiles(id) on delete restrict,
  group_id        uuid references public.groups(id) on delete set null,

  -- Status no funil LOOG. Mapeia pro SIVIS invisivelmente.
  status          text not null default 'lead'
                     check (status in ('lead','prospect','pendencia','cliente','perdido')),

  -- Contratante
  contratante_nome      text not null,
  contratante_email     text,
  contratante_cpf       text,          -- só dígitos
  contratante_telefone  text,          -- E.164 ou dígitos
  contratante_data_nasc date,
  contratante_cep       text,
  contratante_endereco  text,
  contratante_numero    text,
  contratante_bairro    text,
  contratante_cidade    text,
  contratante_uf        text,
  contratante_complemento text,

  -- Metadata CRM
  procedencia     text,                -- fonte (facebook, consultor, indicacao…)
  observacao      text,

  -- Sync com SIVIS (preenchido pelo worker)
  sivis_id             text,            -- ID do lead no SIVIS (ex: "661")
  sivis_sync_status    text default 'pending'
                           check (sivis_sync_status in ('pending','synced','failed','skipped','stale')),
  sivis_sync_error     text,
  sivis_last_sync_at   timestamptz,
  sivis_attempts       int not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists leads_consultor_status_idx on public.leads (consultor_id, status, created_at desc);
create index if not exists leads_group_status_idx on public.leads (group_id, status, created_at desc) where group_id is not null;
create index if not exists leads_sync_pending_idx on public.leads (sivis_sync_status, created_at) where sivis_sync_status = 'pending';
create unique index if not exists leads_sivis_id_uq on public.leads (sivis_id) where sivis_id is not null;
create index if not exists leads_cpf_idx on public.leads (contratante_cpf) where contratante_cpf is not null;

comment on table public.leads is
  'Pipeline de leads do LOOG Studio. Source of truth próprio, com sync invisível pro SIVIS.';
comment on column public.leads.sivis_id is
  'ID do lead no SIVIS, preenchido pelo worker após salvarLead. NULL = ainda não sincronizado.';
comment on column public.leads.sivis_sync_status is
  'Estado do espelho pro SIVIS. pending = fila ativa · synced = ok · failed = tentou max_attempts e desistiu · skipped = consultor pediu pular · stale = sivis apagou/alterou do lado deles.';


-- ─── 2. LEAD_VEHICLES ──────────────────────────────────────────────────────────
create table if not exists public.lead_vehicles (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,

  -- Identificação FIPE
  placa           text,                -- opcional (0km não tem)
  fipe_code       text,                -- ex: "003463-0"
  marca           text not null,
  modelo          text not null,
  ano_modelo      int,
  combustivel     text,
  sigla_combustivel text,
  mes_referencia_fipe text,
  tipo            text not null
                     check (tipo in ('carro','moto','caminhao','utilitario','eletrico')),
  consulta_fipe   int not null default 0,  -- 0=FIPE 2=Zerokm (match SIVIS)

  -- Valor
  valor_fipe_cents  bigint,
  valor_fipe_formatado text,

  -- Cotação feita no momento da criação (snapshot imutável — JSONB)
  cotacao_snapshot jsonb,

  -- Sync
  sivis_vehicle_id  text,

  created_at      timestamptz not null default now()
);
create index if not exists lead_vehicles_lead_idx on public.lead_vehicles (lead_id, created_at desc);
create index if not exists lead_vehicles_placa_idx on public.lead_vehicles (placa) where placa is not null;

comment on table public.lead_vehicles is
  'Veículos vinculados ao lead. Snapshot da cotação fica em cotacao_snapshot (imutável).';


-- ─── 3. LEAD_DOCUMENTS ─────────────────────────────────────────────────────────
create table if not exists public.lead_documents (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  uploaded_by     uuid not null references public.profiles(id) on delete restrict,

  tipo            text not null
                     check (tipo in ('cnh','crlv','comprovante_residencia','comprovante_renda','selfie','outros')),

  -- Arquivo em Supabase Storage (bucket 'lead-documents')
  storage_path    text not null,       -- ex: "<consultor_id>/<lead_id>/cnh-<uuid>.jpg"
  filename        text not null,       -- nome original
  mime_type       text,
  size_bytes      bigint,

  -- Sync
  sivis_doc_id    text,
  sivis_sync_status text default 'pending'
                       check (sivis_sync_status in ('pending','synced','failed','skipped')),
  sivis_sync_error  text,
  sivis_last_sync_at timestamptz,

  uploaded_at     timestamptz not null default now()
);
create index if not exists lead_documents_lead_idx on public.lead_documents (lead_id, uploaded_at desc);
create index if not exists lead_documents_sync_pending_idx on public.lead_documents (sivis_sync_status) where sivis_sync_status = 'pending';
create unique index if not exists lead_documents_sivis_uq on public.lead_documents (sivis_doc_id) where sivis_doc_id is not null;

comment on table public.lead_documents is
  'Metadados dos docs enviados. Arquivo real fica no bucket Storage ''lead-documents''.';


-- ─── 4. LEAD_PENDENCIAS ────────────────────────────────────────────────────────
create table if not exists public.lead_pendencias (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,

  tipo            text not null,       -- ex: "aguardando_cnh", "aguardando_assinatura", "aguardando_vistoria"
  descricao       text,
  status          text not null default 'aberta'
                     check (status in ('aberta','resolvida','cancelada')),
  auto_resolvida  boolean not null default false,
  document_id     uuid references public.lead_documents(id) on delete set null,

  -- Quem resolveu
  resolvida_por   uuid references public.profiles(id) on delete set null,
  resolvida_em    timestamptz,

  -- Sync
  sivis_pendencia_id text,

  created_at      timestamptz not null default now()
);
create index if not exists lead_pendencias_lead_idx on public.lead_pendencias (lead_id, status, created_at desc);
create index if not exists lead_pendencias_open_idx on public.lead_pendencias (lead_id) where status = 'aberta';

comment on table public.lead_pendencias is
  'Pendências do lead. auto_resolvida=true quando foi resolvida automaticamente por upload de doc.';


-- ─── 5. LEAD_TIMELINE ──────────────────────────────────────────────────────────
create table if not exists public.lead_timeline (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  actor_id        uuid references public.profiles(id) on delete set null,

  evento          text not null,       -- ex: "lead_criado", "doc_enviado", "status_mudou", "sivis_sync_ok", "sivis_sync_falhou"
  detalhes        jsonb,

  created_at      timestamptz not null default now()
);
create index if not exists lead_timeline_lead_idx on public.lead_timeline (lead_id, created_at desc);
create index if not exists lead_timeline_evento_idx on public.lead_timeline (evento, created_at desc);

comment on table public.lead_timeline is
  'Histórico append-only de tudo que aconteceu com o lead. Serve de auditoria + UI de timeline.';


-- ─── 6. CONSULTOR_SIVIS_CREDENTIALS ────────────────────────────────────────────
create table if not exists public.consultor_sivis_credentials (
  user_id         uuid primary key references public.profiles(id) on delete cascade,

  sivis_login     text not null,
  -- Senha criptografada com AES-256-GCM. Chave em env SIVIS_ENC_KEY (32 bytes).
  -- Formato: base64(iv || ciphertext || tag)
  sivis_password_encrypted text not null,

  -- Health check periódico
  last_login_test_at    timestamptz,
  last_login_test_ok    boolean,
  last_login_test_error text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.consultor_sivis_credentials is
  'Credenciais SIVIS por consultor. Senha criptografada AES-256-GCM (chave em env SIVIS_ENC_KEY). Decrypt só em memória no worker de sync.';


-- ─── 7. SIVIS_SYNC_QUEUE ───────────────────────────────────────────────────────
create table if not exists public.sivis_sync_queue (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  consultor_id    uuid not null references public.profiles(id) on delete restrict,

  action          text not null
                     check (action in (
                       'create_lead','update_lead','upload_doc','add_pendencia',
                       'resolve_pendencia','update_status','finalizar_adesao','cancelar_adesao'
                     )),
  payload         jsonb not null,

  status          text not null default 'pending'
                     check (status in ('pending','running','done','failed','retry')),
  attempts        int not null default 0,
  max_attempts    int not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_error      text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);
create index if not exists sivis_sync_queue_pending_idx on public.sivis_sync_queue (next_attempt_at)
  where status in ('pending','retry');
create index if not exists sivis_sync_queue_lead_idx on public.sivis_sync_queue (lead_id, created_at desc);

comment on table public.sivis_sync_queue is
  'Fila durável de jobs de sync pro SIVIS. Worker (Netlify Scheduled Function) consome ordenado por next_attempt_at com retry exponential backoff até max_attempts.';


-- ─── TRIGGER: updated_at automático ────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_touch_updated_at on public.leads;
create trigger leads_touch_updated_at
  before update on public.leads
  for each row execute function public.touch_updated_at();

drop trigger if exists sivis_creds_touch_updated_at on public.consultor_sivis_credentials;
create trigger sivis_creds_touch_updated_at
  before update on public.consultor_sivis_credentials
  for each row execute function public.touch_updated_at();

drop trigger if exists sivis_queue_touch_updated_at on public.sivis_sync_queue;
create trigger sivis_queue_touch_updated_at
  before update on public.sivis_sync_queue
  for each row execute function public.touch_updated_at();


-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Regra geral:
--   consultor: só vê os próprios leads
--   gestor:    vê leads do seu group_id
--   admin:     vê todos
-- Server-side (service_role) ignora RLS — worker usa isso.

alter table public.leads enable row level security;
alter table public.lead_vehicles enable row level security;
alter table public.lead_documents enable row level security;
alter table public.lead_pendencias enable row level security;
alter table public.lead_timeline enable row level security;
alter table public.consultor_sivis_credentials enable row level security;
alter table public.sivis_sync_queue enable row level security;

-- Helper: role e group do caller
create or replace function public.me_role() returns text as $$
  select role from public.profiles where id = auth.uid()
$$ language sql stable;

create or replace function public.me_group() returns uuid as $$
  select group_id from public.profiles where id = auth.uid()
$$ language sql stable;

-- LEADS policies
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select using (
  consultor_id = auth.uid()
  or (public.me_role() = 'gestor' and group_id is not null and group_id = public.me_group())
  or public.me_role() = 'admin'
);

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert with check (
  consultor_id = auth.uid()
);

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update using (
  consultor_id = auth.uid()
  or (public.me_role() = 'gestor' and group_id is not null and group_id = public.me_group())
  or public.me_role() = 'admin'
);

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete using (
  public.me_role() = 'admin'
);

-- Child tables: só mostra se o lead pai é visível (join implícito via policy)
drop policy if exists lv_all on public.lead_vehicles;
create policy lv_all on public.lead_vehicles for all using (
  exists (select 1 from public.leads l where l.id = lead_vehicles.lead_id
          and (l.consultor_id = auth.uid()
               or (public.me_role() = 'gestor' and l.group_id = public.me_group())
               or public.me_role() = 'admin'))
) with check (
  exists (select 1 from public.leads l where l.id = lead_vehicles.lead_id and l.consultor_id = auth.uid())
);

drop policy if exists ld_all on public.lead_documents;
create policy ld_all on public.lead_documents for all using (
  exists (select 1 from public.leads l where l.id = lead_documents.lead_id
          and (l.consultor_id = auth.uid()
               or (public.me_role() = 'gestor' and l.group_id = public.me_group())
               or public.me_role() = 'admin'))
) with check (
  exists (select 1 from public.leads l where l.id = lead_documents.lead_id and l.consultor_id = auth.uid())
);

drop policy if exists lp_all on public.lead_pendencias;
create policy lp_all on public.lead_pendencias for all using (
  exists (select 1 from public.leads l where l.id = lead_pendencias.lead_id
          and (l.consultor_id = auth.uid()
               or (public.me_role() = 'gestor' and l.group_id = public.me_group())
               or public.me_role() = 'admin'))
);

drop policy if exists lt_select on public.lead_timeline;
create policy lt_select on public.lead_timeline for select using (
  exists (select 1 from public.leads l where l.id = lead_timeline.lead_id
          and (l.consultor_id = auth.uid()
               or (public.me_role() = 'gestor' and l.group_id = public.me_group())
               or public.me_role() = 'admin'))
);
-- Insert do timeline sempre server-side (service_role bypassa RLS)

-- CREDENCIAIS SIVIS: só o próprio consultor acessa a sua. Admin lê metadata mas não a senha
-- (a senha vem criptografada mesmo; chave só o server tem).
drop policy if exists csc_select on public.consultor_sivis_credentials;
create policy csc_select on public.consultor_sivis_credentials for select using (
  user_id = auth.uid() or public.me_role() = 'admin'
);
drop policy if exists csc_insert on public.consultor_sivis_credentials;
create policy csc_insert on public.consultor_sivis_credentials for insert with check (
  user_id = auth.uid()
);
drop policy if exists csc_update on public.consultor_sivis_credentials;
create policy csc_update on public.consultor_sivis_credentials for update using (
  user_id = auth.uid()
);
drop policy if exists csc_delete on public.consultor_sivis_credentials;
create policy csc_delete on public.consultor_sivis_credentials for delete using (
  user_id = auth.uid() or public.me_role() = 'admin'
);

-- SYNC QUEUE: só service_role (worker) acessa normalmente. UI vê status via view.
drop policy if exists ssq_admin_read on public.sivis_sync_queue;
create policy ssq_admin_read on public.sivis_sync_queue for select using (
  public.me_role() = 'admin'
  or exists (select 1 from public.leads l where l.id = sivis_sync_queue.lead_id and l.consultor_id = auth.uid())
);


-- ─── GRANTS pro service_role (worker) ──────────────────────────────────────
-- Service role já bypassa RLS, mas garantimos os grants explicitamente.
grant all on public.leads, public.lead_vehicles, public.lead_documents,
             public.lead_pendencias, public.lead_timeline,
             public.consultor_sivis_credentials, public.sivis_sync_queue
          to service_role;


-- ─── STORAGE: bucket privado lead-documents ────────────────────────────────
-- Path pattern: "<consultor_id>/<lead_id>/<tipo>-<uuid>.<ext>"
-- (o primeiro segmento = owner, usado pelas policies pra scope por consultor)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lead-documents',
  'lead-documents',
  false,                       -- privado
  10485760,                    -- 10 MB max por doc
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Policies do bucket:
-- Primeiro segmento do path = consultor_id (uuid). Garante que consultor só
-- vê/edita seus próprios arquivos. Admin/gestor usam API server-side (service_role).

drop policy if exists "lead_docs_select" on storage.objects;
create policy "lead_docs_select" on storage.objects for select using (
  bucket_id = 'lead-documents'
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or public.me_role() in ('admin','gestor')
  )
);

drop policy if exists "lead_docs_insert" on storage.objects;
create policy "lead_docs_insert" on storage.objects for insert with check (
  bucket_id = 'lead-documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "lead_docs_update" on storage.objects;
create policy "lead_docs_update" on storage.objects for update using (
  bucket_id = 'lead-documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "lead_docs_delete" on storage.objects;
create policy "lead_docs_delete" on storage.objects for delete using (
  bucket_id = 'lead-documents'
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or public.me_role() = 'admin'
  )
);
