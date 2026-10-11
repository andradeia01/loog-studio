-- ============================================================================
-- Migration 008 — Tracking de fonte de tráfego nos leads do CRM
-- ============================================================================
-- Captura UTM params + Facebook click id + Google click id em cada contato
-- do CRM. Permite relatórios de "quantos leads/fechamentos vieram de qual
-- campanha/anúncio", custo por lead, taxa de conversão por fonte, etc.
--
-- Também cria view auxiliar pra relatórios agregados.
-- ============================================================================

alter table public.crm_contacts
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content  text,
  add column if not exists utm_term     text,
  add column if not exists fbclid       text,
  add column if not exists gclid        text,
  add column if not exists referrer     text,
  add column if not exists landing_url  text;

-- Índices úteis pros relatórios (filtram por source/campaign no painel)
create index if not exists crm_contacts_utm_source_idx    on public.crm_contacts (utm_source);
create index if not exists crm_contacts_utm_campaign_idx  on public.crm_contacts (utm_campaign);
create index if not exists crm_contacts_fbclid_idx        on public.crm_contacts (fbclid) where fbclid is not null;
create index if not exists crm_contacts_gclid_idx         on public.crm_contacts (gclid) where gclid is not null;

-- View agregada pros relatórios: 1 row por combinação (source, medium, campaign)
-- Totais + fechamentos + taxa de conversão + leads últimos 30d.
create or replace view public.v_crm_leads_por_fonte as
select
  coalesce(utm_source, 'direto')                                        as source,
  coalesce(utm_medium, '—')                                             as medium,
  coalesce(utm_campaign, '—')                                           as campaign,
  owner_id,
  count(*)                                                              as total_leads,
  count(*) filter (where status_ciclo = 'cliente')                      as fechados,
  count(*) filter (where status_ciclo = 'perdido')                      as perdidos,
  count(*) filter (where status_ciclo = 'ativo')                        as ativos,
  count(*) filter (where temperatura = 'quente')                        as quentes,
  count(*) filter (where created_at > now() - interval '30 days')       as leads_30d,
  count(*) filter (where created_at > now() - interval '7 days')        as leads_7d,
  count(*) filter (where created_at > now() - interval '1 day')         as leads_hoje,
  case when count(*) > 0
       then round(100.0 * count(*) filter (where status_ciclo = 'cliente') / count(*), 1)
       else 0 end                                                       as taxa_conversao_pct,
  min(created_at)                                                       as primeiro_lead,
  max(created_at)                                                       as ultimo_lead
from public.crm_contacts
group by source, medium, campaign, owner_id;

comment on view public.v_crm_leads_por_fonte is
  'Agregação de leads por (source, medium, campaign, owner). Base pros relatórios de tráfego pago.';
