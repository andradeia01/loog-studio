-- ============================================================================
-- Migration 006 — CRM Fase 2: Pipeline (coluna pipeline_stage em crm_contacts)
-- ============================================================================
-- 6 fases bem definidas pro ciclo de vendas de proteção veicular LOOG:
--   novo        → acabou de cotar, SEM nenhum contato (consultor não ligou nem mandou wpp)
--   contato     → consultor já teve PELO MENOS 1 interação (whatsapp/ligação/reunião/email)
--   documentos  → cliente aceitou enviar CRLV/CNH/comprovante (cotação completa iniciada)
--   negociacao  → discutindo preço/cobertura, cliente ponderando
--   fechado     → cliente comprou (status_ciclo também vira "cliente")
--   perdido     → desistiu (status_ciclo também vira "perdido")
--
-- Transições são MANUAIS pelo consultor (drag no Kanban). Mas um TRIGGER
-- faz 2 automações:
--   1. ao inserir interação whatsapp/ligação/reuniao/email → se stage="novo", vira "contato"
--   2. ao inserir interação cotacao_completa              → se stage ∈ {novo,contato}, vira "documentos"
-- ============================================================================

do $$ begin
  create type public.crm_pipeline_stage as enum (
    'novo', 'contato', 'documentos', 'negociacao', 'fechado', 'perdido'
  );
exception when duplicate_object then null; end $$;

alter table public.crm_contacts
  add column if not exists pipeline_stage public.crm_pipeline_stage not null default 'novo';

alter table public.crm_contacts
  add column if not exists pipeline_moved_at timestamptz;

create index if not exists crm_contacts_pipeline_stage_idx
  on public.crm_contacts (owner_id, pipeline_stage, pipeline_moved_at desc nulls last);

-- backfill: contatos com status_ciclo="cliente" viram "fechado",
-- "perdido" vira "perdido", "ativo" fica no "novo" por default.
update public.crm_contacts
  set pipeline_stage = 'fechado'::public.crm_pipeline_stage,
      pipeline_moved_at = coalesce(last_touch_at, created_at)
  where status_ciclo = 'cliente' and pipeline_stage = 'novo';

update public.crm_contacts
  set pipeline_stage = 'perdido'::public.crm_pipeline_stage,
      pipeline_moved_at = coalesce(last_touch_at, created_at)
  where status_ciclo = 'perdido' and pipeline_stage = 'novo';

-- também pra 'ativos' que já tiveram interações além do sistema → mandar pra "contato"
update public.crm_contacts c
  set pipeline_stage = 'contato'::public.crm_pipeline_stage,
      pipeline_moved_at = coalesce(c.last_touch_at, c.created_at)
  where c.status_ciclo = 'ativo'
    and c.pipeline_stage = 'novo'
    and exists (
      select 1 from public.crm_interactions i
      where i.contact_id = c.id
        and i.tipo in ('whatsapp', 'ligacao', 'reuniao', 'email')
    );

-- ───────────────────── trigger de auto-progressão ───────────────────────────
create or replace function public.crm_auto_pipeline_progression() returns trigger as $$
declare
  curr public.crm_pipeline_stage;
begin
  select pipeline_stage into curr from public.crm_contacts where id = new.contact_id;

  if curr is null then return new; end if;

  -- Interação de cotação COMPLETA → avança pra "documentos" se ainda estiver antes
  if new.tipo = 'cotacao_completa' and curr in ('novo', 'contato') then
    update public.crm_contacts
      set pipeline_stage = 'documentos'::public.crm_pipeline_stage,
          pipeline_moved_at = now()
      where id = new.contact_id;
  -- Interação WhatsApp/ligação/reunião/email → avança pra "contato" se ainda estiver em "novo"
  elsif new.tipo in ('whatsapp', 'ligacao', 'reuniao', 'email') and curr = 'novo' then
    update public.crm_contacts
      set pipeline_stage = 'contato'::public.crm_pipeline_stage,
          pipeline_moved_at = now()
      where id = new.contact_id;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists crm_interactions_auto_pipeline on public.crm_interactions;
create trigger crm_interactions_auto_pipeline after insert on public.crm_interactions
  for each row execute function public.crm_auto_pipeline_progression();

-- ───────────────────── sync status_ciclo ↔ pipeline_stage ───────────────────
-- Quando status_ciclo muda via UI, mantém o pipeline em sincronia nos terminais
create or replace function public.crm_sync_pipeline_from_status() returns trigger as $$
begin
  if new.status_ciclo = 'cliente' and old.status_ciclo != 'cliente' then
    new.pipeline_stage := 'fechado'::public.crm_pipeline_stage;
    new.pipeline_moved_at := now();
  elsif new.status_ciclo = 'perdido' and old.status_ciclo != 'perdido' then
    new.pipeline_stage := 'perdido'::public.crm_pipeline_stage;
    new.pipeline_moved_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists crm_contacts_sync_pipeline on public.crm_contacts;
create trigger crm_contacts_sync_pipeline before update of status_ciclo on public.crm_contacts
  for each row execute function public.crm_sync_pipeline_from_status();
