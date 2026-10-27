-- Migration 016: Tabela sivis_price_table — fonte da verdade pra calcular mensalidade
-- Deduzida de 225 cotacoes reais do SIVIS extraidas do CRM historico.
-- Padrao SIVIS:
--   CARROS: cada R$10k FIPE = +R$22/mes, comeca R$132,42 pra 0-20k
--   MOTOS:  cada R$10k FIPE = +R$26/mes, comeca R$116,90 pra 0-20k
--   ADESAO: R$100,00 fixa em todos
--   ELETRICO: usa mesma tabela de CARRO por default (sem dados suficientes pra calibrar separado)
--   UTILITARIO: usa mesma tabela de CARRO (dados mostram padrao similar — ex Bongo 74k = R$260,90)

create table if not exists public.sivis_price_table (
  id              uuid primary key default gen_random_uuid(),
  tipo_veiculo    text not null check (tipo_veiculo in ('carro','moto','utilitario','eletrico')),
  fipe_min_cents  bigint not null,     -- faixa minima FIPE (inclusive)
  fipe_max_cents  bigint not null,     -- faixa maxima FIPE (inclusive)
  mensal_cents    integer not null,    -- mensalidade base (com defaults terceiros_30k + reserva_10d + vidros_completa)
  adesao_cents    integer not null default 10000,  -- taxa de adesao fixa R$ 100,00
  cota_label      text,                -- "COTA 1.0", "COTA 2.5" etc (so pra referencia)
  observacao      text,                -- notas tipo "variante alternativa", etc
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists sivis_price_table_lookup_idx on public.sivis_price_table (tipo_veiculo, fipe_min_cents, fipe_max_cents) where active;

do $$ begin
  create trigger sivis_price_table_set_updated_at before update on public.sivis_price_table
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- Seed: tabela deduzida de 225 cotacoes historicas do SIVIS
delete from public.sivis_price_table;

-- CARROS (passenger — com defaults terceiros_30k + reserva_10d + vidros_completa)
-- Faixas FIPE bateam com planilha oficial LOOG (COTA 1.0 = 0 a R$ 21.600, nao 0-20k)
insert into public.sivis_price_table (tipo_veiculo, fipe_min_cents, fipe_max_cents, mensal_cents, cota_label) values
('carro', 0,            2160000,     13242, 'COTA 1.0'),
('carro', 2160001,      3000000,     15090, 'COTA 1.5'),
('carro', 3000001,      4000000,     17290, 'COTA 2.0'),
('carro', 4000001,      5000000,     19490, 'COTA 2.5'),
('carro', 5000001,      6000000,     21690, 'COTA 3.0'),
('carro', 6000001,      7000000,     23890, 'COTA 3.5'),
('carro', 7000001,      8000000,     26090, 'COTA 4.0'),
('carro', 8000001,      9000000,     28290, 'COTA 4.5'),
('carro', 9000001,      10000000,    30490, 'COTA 5.0'),
('carro', 10000001,     11000000,    32690, 'COTA 5.5'),
('carro', 11000001,     12000000,    34890, 'COTA 6.0'),
('carro', 12000001,     13000000,    37090, 'COTA 6.5'),
('carro', 13000001,     14000000,    39290, 'COTA 7.0'),
('carro', 14000001,     15000000,    41490, 'COTA 7.5'),
('carro', 15000001,     16000000,    43690, 'COTA 8.0'),
('carro', 16000001,     17000000,    45890, 'COTA 8.5'),
('carro', 17000001,     18000000,    48090, 'COTA 9.0'),
('carro', 18000001,     19000000,    50290, 'COTA 9.5'),
('carro', 19000001,     20000000,    52490, 'COTA 10.0'),
('carro', 20000001,     21000000,    54690, 'COTA 10.5'),
('carro', 21000001,     22000000,    56890, 'COTA 11.0'),
('carro', 22000001,     23000000,    59090, 'COTA 11.5'),
('carro', 23000001,     24000000,    61290, 'COTA 12.0'),
('carro', 24000001,     25000000,    63490, 'COTA 12.5'),
('carro', 25000001,     26000000,    65690, 'COTA 13.0'),
('carro', 26000001,     27000000,    67890, 'COTA 13.5'),
('carro', 27000001,     28000000,    70090, 'COTA 14.0'),
('carro', 28000001,     29000000,    72290, 'COTA 14.5'),
('carro', 29000001,     30000000,    74490, 'COTA 15.0');

-- MOTOS (so terceiros_30k por default)
insert into public.sivis_price_table (tipo_veiculo, fipe_min_cents, fipe_max_cents, mensal_cents, cota_label) values
('moto', 0,            2000000,     11690, 'COTA 1.0 MOTO'),
('moto', 2000001,      3000000,     14290, 'COTA 1.5 MOTO'),
('moto', 3000001,      4000000,     16890, 'COTA 2.0 MOTO'),
('moto', 4000001,      5000000,     19490, 'COTA 2.5 MOTO'),
('moto', 5000001,      6000000,     22090, 'COTA 3.0 MOTO'),
('moto', 6000001,      7000000,     24690, 'COTA 3.5 MOTO'),
('moto', 7000001,      8000000,     27290, 'COTA 4.0 MOTO'),
('moto', 8000001,      9000000,     29890, 'COTA 4.5 MOTO'),
('moto', 9000001,      10000000,    32490, 'COTA 5.0 MOTO');

-- UTILITARIO (Diesel) — mesma tabela de CARRO (dados batem: Bongo 74k = R$260,90 bate com faixa 70-80k)
insert into public.sivis_price_table (tipo_veiculo, fipe_min_cents, fipe_max_cents, mensal_cents, cota_label, observacao) values
('utilitario', 0,            2000000,     13242, 'COTA 1.0 UTIL', 'Mesma base de CARRO'),
('utilitario', 2000001,      3000000,     15090, 'COTA 1.5 UTIL', NULL),
('utilitario', 3000001,      4000000,     17290, 'COTA 2.0 UTIL', NULL),
('utilitario', 4000001,      5000000,     19490, 'COTA 2.5 UTIL', NULL),
('utilitario', 5000001,      6000000,     21690, 'COTA 3.0 UTIL', NULL),
('utilitario', 6000001,      7000000,     23890, 'COTA 3.5 UTIL', NULL),
('utilitario', 7000001,      8000000,     26090, 'COTA 4.0 UTIL', NULL),
('utilitario', 8000001,      9000000,     28290, 'COTA 4.5 UTIL', NULL),
('utilitario', 9000001,      10000000,    30490, 'COTA 5.0 UTIL', NULL),
('utilitario', 10000001,     12000000,    34890, 'COTA 6.0 UTIL', NULL),
('utilitario', 12000001,     14000000,    39290, 'COTA 7.0 UTIL', NULL),
('utilitario', 14000001,     16000000,    43690, 'COTA 8.0 UTIL', NULL),
('utilitario', 16000001,     18000000,    48090, 'COTA 9.0 UTIL', NULL),
('utilitario', 18000001,     20000000,    52490, 'COTA 10.0 UTIL', NULL),
('utilitario', 20000001,     22000000,    56890, 'COTA 11.0 UTIL', NULL),
('utilitario', 22000001,     24000000,    61290, 'COTA 12.0 UTIL', NULL),
('utilitario', 24000001,     26000000,    65690, 'COTA 13.0 UTIL', NULL),
('utilitario', 26000001,     28000000,    70090, 'COTA 14.0 UTIL', NULL),
('utilitario', 28000001,     30000000,    74490, 'COTA 15.0 UTIL', NULL);

-- ELETRICO — mesma tabela de CARRO. Planilha nova "Planos COM ELETRICO" tem 23 cotas eletrico
-- com mesma estrutura; sem dados reais de cotacao eletrica no SIVIS pra calibrar separado,
-- replica carro. Admin pode ajustar depois via /admin/planos.
insert into public.sivis_price_table (tipo_veiculo, fipe_min_cents, fipe_max_cents, mensal_cents, cota_label, observacao) values
('eletrico', 0,            2000000,     13242, 'COTA 1.0 ELETRICO', 'Mesma base de CARRO (sem dados SIVIS)'),
('eletrico', 2000001,      3000000,     15090, 'COTA 1.5 ELETRICO', NULL),
('eletrico', 3000001,      4000000,     17290, 'COTA 2.0 ELETRICO', NULL),
('eletrico', 4000001,      5000000,     19490, 'COTA 2.5 ELETRICO', NULL),
('eletrico', 5000001,      6000000,     21690, 'COTA 3.0 ELETRICO', NULL),
('eletrico', 6000001,      7000000,     23890, 'COTA 3.5 ELETRICO', NULL),
('eletrico', 7000001,      8000000,     26090, 'COTA 4.0 ELETRICO', NULL),
('eletrico', 8000001,      9000000,     28290, 'COTA 4.5 ELETRICO', NULL),
('eletrico', 9000001,      10000000,    30490, 'COTA 5.0 ELETRICO', NULL),
('eletrico', 10000001,     12000000,    34890, 'COTA 6.0 ELETRICO', NULL),
('eletrico', 12000001,     14000000,    39290, 'COTA 7.0 ELETRICO', NULL),
('eletrico', 14000001,     16000000,    43690, 'COTA 8.0 ELETRICO', NULL),
('eletrico', 16000001,     18000000,    48090, 'COTA 9.0 ELETRICO', NULL),
('eletrico', 18000001,     20000000,    52490, 'COTA 10.0 ELETRICO', NULL),
('eletrico', 20000001,     22000000,    56890, 'COTA 11.0 ELETRICO', NULL),
('eletrico', 22000001,     24000000,    61290, 'COTA 12.0 ELETRICO', NULL),
('eletrico', 24000001,     26000000,    65690, 'COTA 13.0 ELETRICO', NULL),
('eletrico', 26000001,     28000000,    70090, 'COTA 14.0 ELETRICO', NULL),
('eletrico', 28000001,     30000000,    74490, 'COTA 15.0 ELETRICO', NULL);

-- RLS: tudo mundo le, so admin edita
alter table public.sivis_price_table enable row level security;
drop policy if exists "sivis_price read all" on public.sivis_price_table;
create policy "sivis_price read all" on public.sivis_price_table for select using (true);
drop policy if exists "sivis_price write admin" on public.sivis_price_table;
create policy "sivis_price write admin" on public.sivis_price_table for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','gestor'))
);
