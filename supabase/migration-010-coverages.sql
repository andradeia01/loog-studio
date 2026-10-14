-- =============================================================================
-- Migration 010: Cobertura Opcional V2 — toggles de personalização da cotação
-- =============================================================================
-- Fonte: planilhas oficiais LOOG `Acessórios.xlsx` + `Planos.xlsx` (14/10/2026)
-- Regra: Roubo/Furto e Colisão NÃO entram aqui — são % FIPE já embutidas no
-- valor base retornado pelo Hub. Esta tabela cobre só os ADITIVOS em R$ fixo
-- que o consultor pode ligar/desligar sem re-rastrear SIVIS.
-- =============================================================================

do $$ begin
  create type coverage_vehicle as enum ('carro', 'moto', 'utilitario', 'eletrico', 'caminhao');
exception when duplicate_object then null; end $$;

create table if not exists public.cotacao_coverages (
  id             uuid primary key default gen_random_uuid(),
  grupo          text not null,             -- 'terceiros' | 'reserva' | 'vidros' | 'reboque' | 'gnv' | 'monitoramento' | 'atividade' | 'assistencia_24h'
  grupo_label    text not null,             -- "Danos a Terceiros", "Carro Reserva" etc.
  codigo         text not null unique,      -- 'terceiros_carro_30k', 'reserva_15d' etc.
  descricao      text not null,             -- texto que vira label do toggle
  tipo_veiculo   coverage_vehicle not null, -- filtra pelo tipo da cotação
  nivel          int not null default 0,    -- pra radios: 1,2,3... toggle normal usa 0
  exclusivo      boolean not null default false, -- true = grupo é radio (só um nível ativo)
  delta_cents    int not null default 0,    -- quanto soma na mensalidade (pode ser 0 pra "nível incluso")
  ordem          int not null default 0,
  ativo          boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists cotacao_coverages_tipo on public.cotacao_coverages (tipo_veiculo, ativo, grupo, nivel);

alter table public.cotacao_coverages enable row level security;

drop policy if exists "coverages read approved"  on public.cotacao_coverages;
drop policy if exists "coverages admin all"      on public.cotacao_coverages;

create policy "coverages read approved"
  on public.cotacao_coverages for select
  using (public.is_approved(auth.uid()) and ativo = true);

create policy "coverages admin all"
  on public.cotacao_coverages for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ─── SEED ────────────────────────────────────────────────────────────────────
-- Valores extraídos literalmente da planilha Acessórios.xlsx (14/10/2026).
-- Formato delta_cents: R$ * 100 (ex: R$ 38,00 = 3800)

-- CARRO ──────────────────────────────────────────────────────────────────────
insert into public.cotacao_coverages (grupo, grupo_label, codigo, descricao, tipo_veiculo, nivel, exclusivo, delta_cents, ordem) values
  -- Reboque (nível 1 incluso = 0, upgrades somam)
  ('reboque', 'Reboque KM', 'reboque_carro_300', 'Reboque 300km (150+150) — incluso', 'carro', 1, true, 0, 10),
  ('reboque', 'Reboque KM', 'reboque_carro_600', 'Estender pra 600km (300+300)', 'carro', 2, true, 3800, 11),
  ('reboque', 'Reboque KM', 'reboque_carro_1000', 'Estender pra 1000km (500+500)', 'carro', 3, true, 6800, 12),

  -- Terceiros (exclusivo — radio)
  ('terceiros', 'Danos Materiais a Terceiros', 'terceiros_carro_30k', 'Até R$ 30.000', 'carro', 1, true, 2000, 20),
  ('terceiros', 'Danos Materiais a Terceiros', 'terceiros_carro_50k', 'Até R$ 50.000', 'carro', 2, true, 4000, 21),
  ('terceiros', 'Danos Materiais a Terceiros', 'terceiros_carro_100k', 'Até R$ 100.000', 'carro', 3, true, 7000, 22),

  -- Carro Reserva (exclusivo — nível 1 grátis)
  ('reserva', 'Carro Reserva', 'reserva_carro_10d', '10 dias — incluso', 'carro', 1, true, 0, 30),
  ('reserva', 'Carro Reserva', 'reserva_carro_15d', '15 dias', 'carro', 2, true, 1500, 31),
  ('reserva', 'Carro Reserva', 'reserva_carro_30d', '30 dias', 'carro', 3, true, 2500, 32),

  -- Monitoramento (toggle on/off)
  ('monitoramento', 'Rastreador / Monitoramento', 'monitoramento_carro', 'Monitoramento 24h', 'carro', 0, false, 4000, 40),

  -- GNV (exclusivo)
  ('gnv', 'Cobertura Kit GNV', 'gnv_carro_2k', 'Limite R$ 2.000', 'carro', 1, true, 2500, 50),
  ('gnv', 'Cobertura Kit GNV', 'gnv_carro_4k', 'Limite R$ 4.000', 'carro', 2, true, 4500, 51),

  -- Atividade Remunerada (toggle)
  ('atividade', 'Atividade Remunerada', 'atividade_carro', 'Uso remunerado do veículo', 'carro', 0, false, 1500, 60),

  -- Vidros (exclusivo — nenhum/para-brisa/completo)
  ('vidros', 'Cobertura de Vidros', 'vidros_carro_parabrisa', 'Só para-brisa', 'carro', 1, true, 1000, 70),
  ('vidros', 'Cobertura de Vidros', 'vidros_carro_completa', 'Vidros + faróis + lanternas + retrovisores', 'carro', 2, true, 2000, 71);

-- MOTO ───────────────────────────────────────────────────────────────────────
insert into public.cotacao_coverages (grupo, grupo_label, codigo, descricao, tipo_veiculo, nivel, exclusivo, delta_cents, ordem) values
  ('reboque', 'Reboque KM', 'reboque_moto_300', 'Reboque 300km — incluso', 'moto', 1, true, 0, 10),
  ('reboque', 'Reboque KM', 'reboque_moto_600', 'Estender pra 600km', 'moto', 2, true, 3800, 11),
  ('reboque', 'Reboque KM', 'reboque_moto_1000', 'Estender pra 1000km', 'moto', 3, true, 6800, 12),

  ('terceiros', 'Danos Materiais a Terceiros', 'terceiros_moto_30k', 'Até R$ 30.000', 'moto', 1, true, 2000, 20),
  ('terceiros', 'Danos Materiais a Terceiros', 'terceiros_moto_50k', 'Até R$ 50.000', 'moto', 2, true, 3000, 21),

  ('monitoramento', 'Rastreador / Monitoramento', 'monitoramento_moto', 'Monitoramento 24h', 'moto', 0, false, 4000, 40),

  ('atividade', 'Atividade Remunerada', 'atividade_moto', 'Uso remunerado do veículo', 'moto', 0, false, 1500, 60);

-- UTILITÁRIO / DIESEL ────────────────────────────────────────────────────────
insert into public.cotacao_coverages (grupo, grupo_label, codigo, descricao, tipo_veiculo, nivel, exclusivo, delta_cents, ordem) values
  ('reboque', 'Reboque KM', 'reboque_util_300', 'Reboque 300km — incluso', 'utilitario', 1, true, 0, 10),
  ('reboque', 'Reboque KM', 'reboque_util_600', 'Estender pra 600km', 'utilitario', 2, true, 3800, 11),
  ('reboque', 'Reboque KM', 'reboque_util_1000', 'Estender pra 1000km', 'utilitario', 3, true, 6800, 12),

  ('terceiros', 'Danos Materiais a Terceiros', 'terceiros_util_30k', 'Até R$ 30.000', 'utilitario', 1, true, 4000, 20),
  ('terceiros', 'Danos Materiais a Terceiros', 'terceiros_util_50k', 'Até R$ 50.000', 'utilitario', 2, true, 6000, 21),
  ('terceiros', 'Danos Materiais a Terceiros', 'terceiros_util_100k', 'Até R$ 100.000', 'utilitario', 3, true, 8000, 22),

  ('reserva', 'Carro Reserva', 'reserva_util_10d', '10 dias — incluso', 'utilitario', 1, true, 0, 30),
  ('reserva', 'Carro Reserva', 'reserva_util_15d', '15 dias', 'utilitario', 2, true, 1500, 31),
  ('reserva', 'Carro Reserva', 'reserva_util_30d', '30 dias', 'utilitario', 3, true, 2500, 32),

  ('monitoramento', 'Rastreador / Monitoramento', 'monitoramento_util', 'Monitoramento 24h', 'utilitario', 0, false, 4000, 40),

  ('gnv', 'Cobertura Kit GNV', 'gnv_util_2k', 'Limite R$ 2.000', 'utilitario', 1, true, 2500, 50),
  ('gnv', 'Cobertura Kit GNV', 'gnv_util_4k', 'Limite R$ 4.000', 'utilitario', 2, true, 4500, 51),

  ('atividade', 'Atividade Remunerada', 'atividade_util', 'Uso remunerado do veículo', 'utilitario', 0, false, 1500, 60),

  ('vidros', 'Cobertura de Vidros', 'vidros_util_parabrisa', 'Só para-brisa', 'utilitario', 1, true, 2000, 70),
  ('vidros', 'Cobertura de Vidros', 'vidros_util_completa', 'Vidros + faróis + lanternas + retrovisores', 'utilitario', 2, true, 3500, 71);

-- CARRO ELÉTRICO ─────────────────────────────────────────────────────────────
insert into public.cotacao_coverages (grupo, grupo_label, codigo, descricao, tipo_veiculo, nivel, exclusivo, delta_cents, ordem) values
  ('reboque', 'Reboque KM', 'reboque_eletrico_300', 'Reboque 300km — incluso', 'eletrico', 1, true, 0, 10),
  ('reboque', 'Reboque KM', 'reboque_eletrico_600', 'Estender pra 600km', 'eletrico', 2, true, 3800, 11),
  ('reboque', 'Reboque KM', 'reboque_eletrico_1000', 'Estender pra 1000km', 'eletrico', 3, true, 6800, 12),

  ('terceiros', 'Danos Materiais a Terceiros', 'terceiros_eletrico_30k', 'Até R$ 30.000', 'eletrico', 1, true, 2000, 20),
  ('terceiros', 'Danos Materiais a Terceiros', 'terceiros_eletrico_50k', 'Até R$ 50.000', 'eletrico', 2, true, 4000, 21),
  ('terceiros', 'Danos Materiais a Terceiros', 'terceiros_eletrico_100k', 'Até R$ 100.000', 'eletrico', 3, true, 7000, 22),

  ('reserva', 'Carro Reserva', 'reserva_eletrico_10d', '10 dias — incluso', 'eletrico', 1, true, 0, 30),
  ('reserva', 'Carro Reserva', 'reserva_eletrico_15d', '15 dias', 'eletrico', 2, true, 1500, 31),
  ('reserva', 'Carro Reserva', 'reserva_eletrico_30d', '30 dias', 'eletrico', 3, true, 2500, 32),

  ('monitoramento', 'Rastreador / Monitoramento', 'monitoramento_eletrico', 'Monitoramento 24h', 'eletrico', 0, false, 4000, 40),

  ('atividade', 'Atividade Remunerada', 'atividade_eletrico', 'Uso remunerado do veículo', 'eletrico', 0, false, 1500, 60),

  ('vidros', 'Cobertura de Vidros', 'vidros_eletrico_parabrisa', 'Só para-brisa', 'eletrico', 1, true, 2000, 70),
  ('vidros', 'Cobertura de Vidros', 'vidros_eletrico_completa', 'Vidros + faróis + lanternas + retrovisores', 'eletrico', 2, true, 3000, 71);

-- CAMINHÃO ───────────────────────────────────────────────────────────────────
insert into public.cotacao_coverages (grupo, grupo_label, codigo, descricao, tipo_veiculo, nivel, exclusivo, delta_cents, ordem) values
  ('monitoramento', 'Rastreador / Monitoramento', 'monitoramento_caminhao', 'Monitoramento 24h — plano rastreador', 'caminhao', 0, false, 4000, 40);
