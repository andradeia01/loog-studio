-- Migration 017: Adiciona faixas de PESADOS (caminhao) na sivis_price_table
-- Calibracao: formula leve × multiplicador por categoria (decisao Luis 27/10/2026).
-- Faixas FIPE: respeitam as cotas oficiais da planilha 026-Planos.xlsx.
-- Admin pode editar depois via /admin/sivis-price (futura task).
--
-- Multiplicadores (base R$ 132,42 do carro leve COTA 1.0):
--   CAVALO MECANICO: 3.5x base (truck trator pesado) → R$ 450 base, +R$ 100 por faixa
--   TRUCK:           2.5x base (truck completo) → R$ 330 base, +R$ 70 por faixa
--   TOCO/VUC:        2.0x base (truck leve urbano) → R$ 260 base, +R$ 50 por faixa
--   VAN:             1.7x base → R$ 220 base, +R$ 60 por faixa
--   IMPLEMENTO:      1.4x base (semirreboque mais barato) → R$ 180, +R$ 40 por faixa
--   APENAS TERCEIRO: R$ 150 fixo (so terceiros, sem casco)
--   GUINCHO:         R$ 200 fixo

-- Remove entries anteriores de pesados (caso existam)
delete from public.sivis_price_table where tipo_veiculo = 'caminhao';

-- Adiciona tipo 'caminhao' no check (ja tava criado na 016; so garantir)
alter table public.sivis_price_table drop constraint if exists sivis_price_table_tipo_veiculo_check;
alter table public.sivis_price_table add constraint sivis_price_table_tipo_veiculo_check
  check (tipo_veiculo in ('carro','moto','utilitario','eletrico','caminhao'));

-- CAVALO MECANICO (8 cotas da planilha 026)
insert into public.sivis_price_table (tipo_veiculo, fipe_min_cents, fipe_max_cents, mensal_cents, cota_label, observacao) values
('caminhao', 0,          7500000,    45000, 'CAVALO MECANICO 1.0', 'FIPE 0-75k · base'),
('caminhao', 7500001,    10000000,   55000, 'CAVALO MECANICO 2.0', 'FIPE 75-100k'),
('caminhao', 10000001,   15000000,   65000, 'CAVALO MECANICO 3.0', 'FIPE 100-150k'),
('caminhao', 15000001,   20000000,   75000, 'CAVALO MECANICO 4.0', 'FIPE 150-200k'),
('caminhao', 20000001,   30000000,   85000, 'CAVALO MECANICO 5.0', 'FIPE 200-300k'),
('caminhao', 30000001,   40000000,   95000, 'CAVALO MECANICO 5.1', 'FIPE 300-400k'),
('caminhao', 40000001,   60000000,   110000, 'CAVALO MECANICO 6.0', 'FIPE 400-600k'),
('caminhao', 60000001,   120000000,  130000, 'CAVALO MECANICO 7.0', 'FIPE 600k-1.2M');

-- TRUCK (4 cotas da planilha 026)
-- Insere em faixas que nao sobrepoem com CAVALO. Pros TRUCK uso ranges menores que CAVALO
-- quando a matching por modelo (heuristica no cotador) escolhe TRUCK em vez de CAVALO.
-- Nota: TRUCK e CAVALO compartilham mesmas faixas FIPE no banco; a diferenciacao vem via
-- heuristica de modelo em cotarVeiculoLocal (SCANIA R → CAVALO, VW Delivery → TRUCK).
-- Pra evitar duplicacao, nao inserimos TRUCK aqui — usa a tabela CAVALO como fallback.
-- As cotacoes de TRUCK vao usar os preços de CAVALO (compartilhados).

-- OBS: VAN e IMPLEMENTO e TOCO/VUC seguem a mesma logica — como todos sao 'caminhao'
-- no enum, nao da pra ter 3 tabelas diferentes aqui. O cotador local usa a tabela plans
-- (via buscarPlanoLocal) pra escolher QUAL plano aplica, e so SOBRESCREVE monthly_cents
-- com valor da sivis_price_table pra tipos NAO-caminhao.
--
-- CORRECAO: pra pesados vamos usar outra estrategia — atualizar diretamente monthly_cents
-- na tabela plans. Isso respeita os varios tipos (CAVALO, TRUCK, VAN, IMPLEMENTO) sem
-- precisar de override na sivis_price_table.

-- Atualiza precos reais na tabela plans (source='pesados-026')
update public.plans set monthly_cents = 45000 where source='pesados-026' and name = 'CAVALO MECÂNICO 1.0';
update public.plans set monthly_cents = 55000 where source='pesados-026' and name = 'CAVALO MECÂNICO 2.0';
update public.plans set monthly_cents = 65000 where source='pesados-026' and name = 'CAVALO MECÂNICO 3.0';
update public.plans set monthly_cents = 75000 where source='pesados-026' and name = 'CAVALO MECÂNICO 4.0';
update public.plans set monthly_cents = 85000 where source='pesados-026' and name = 'CAVALO MECÂNICO 5.0';
update public.plans set monthly_cents = 95000 where source='pesados-026' and name = 'CAVALO MECÂNICO 5.1';
update public.plans set monthly_cents = 110000 where source='pesados-026' and name = 'CAVALO MECÂNICO 6.0';
update public.plans set monthly_cents = 130000 where source='pesados-026' and name = 'CAVALO MECÂNICO 7.0';

-- Participacao 8% (10% mais caro que 4%)
update public.plans set monthly_cents = 49500 where source='pesados-026' and name = 'Participação de 8% - 1.0' and group_name like 'CAVALO%';
update public.plans set monthly_cents = 60500 where source='pesados-026' and name = 'Participação de 8% - 2.0' and group_name like 'CAVALO%';
update public.plans set monthly_cents = 71500 where source='pesados-026' and name = 'Participação de 8% - 3.0' and group_name like 'CAVALO%';
update public.plans set monthly_cents = 82500 where source='pesados-026' and name = 'Participação de 8% - 4.0' and group_name like 'CAVALO%';
update public.plans set monthly_cents = 93500 where source='pesados-026' and name = 'Participação de 8% - 5.0' and group_name like 'CAVALO%';
update public.plans set monthly_cents = 104500 where source='pesados-026' and name = 'Participação de 8% - 5.1' and group_name like 'CAVALO%';
update public.plans set monthly_cents = 121000 where source='pesados-026' and name = 'Participação de 8% - 6.0' and group_name like 'CAVALO%';
update public.plans set monthly_cents = 143000 where source='pesados-026' and name = 'Participação de 8% - 7.0' and group_name like 'CAVALO%';

-- TRUCK 4 cotas (base R$ 330 + R$70 por faixa, menor que CAVALO)
update public.plans set monthly_cents = 33000 where source='pesados-026' and name = 'TRUCK 0.5';
update public.plans set monthly_cents = 40000 where source='pesados-026' and name = 'TRUCK 1.0';
update public.plans set monthly_cents = 47000 where source='pesados-026' and name = 'TRUCK 2.0';
update public.plans set monthly_cents = 54000 where source='pesados-026' and name = 'TRUCK 3.0';

-- Participacao 8% TRUCK (10% mais)
update public.plans set monthly_cents = 36300 where source='pesados-026' and name = 'Participação de 8% - 0.5' and group_name like 'TRUCK%';
update public.plans set monthly_cents = 44000 where source='pesados-026' and name = 'Participação de 8% - 1.0' and group_name like 'TRUCK%';
update public.plans set monthly_cents = 51700 where source='pesados-026' and name = 'Participação de 8% - 2.0' and group_name like 'TRUCK%';
update public.plans set monthly_cents = 59400 where source='pesados-026' and name = 'Participação de 8% - 3.0' and group_name like 'TRUCK%';

-- TOCO/VUC 3 cotas (base R$ 260 + R$50 por faixa, truck leve urbano)
update public.plans set monthly_cents = 26000 where source='pesados-026' and name = 'TOCO / VUC 0.5';
update public.plans set monthly_cents = 31000 where source='pesados-026' and name = 'TOCO / VUC 1.0';
update public.plans set monthly_cents = 36000 where source='pesados-026' and name = 'TOCO / VUC 2.0';

-- IMPLEMENTO 4 cotas (base R$ 180 + R$40 por faixa, semirreboque mais barato)
update public.plans set monthly_cents = 18000 where source='pesados-026' and name = 'IMPLEMENTO 1.0';
update public.plans set monthly_cents = 22000 where source='pesados-026' and name = 'IMPLEMENTO 1.5';
update public.plans set monthly_cents = 26000 where source='pesados-026' and name = 'IMPLEMENTO 2.0';
update public.plans set monthly_cents = 30000 where source='pesados-026' and name = 'IMPLEMENTO VALOR DETERMINADO';

-- VAN 4 cotas (base R$ 220 + R$60 por faixa)
update public.plans set monthly_cents = 22000 where source='pesados-026' and name = 'VAN ECONÔMICO 1.0';
update public.plans set monthly_cents = 28000 where source='pesados-026' and name = 'VAN ECONÔMICO 2.0';
update public.plans set monthly_cents = 34000 where source='pesados-026' and name = 'VAN ECONÔMICO 3.0';
update public.plans set monthly_cents = 40000 where source='pesados-026' and name = 'VAN ECONÔMICO 4.0';

-- Pickup/Carro premium dentro da 026
update public.plans set monthly_cents = 50000 where source='pesados-026' and name = 'PLANO PERSONALIZADO';
update public.plans set monthly_cents = 35000 where source='pesados-026' and name = 'LEVE POPULAR';
update public.plans set monthly_cents = 45000 where source='pesados-026' and name = 'LEVE PREMIUM';
update public.plans set monthly_cents = 60000 where source='pesados-026' and name = 'LEVE IMPORTADO';

-- APENAS TERCEIRO fixo
update public.plans set monthly_cents = 15000 where source='pesados-026' and name = 'APENAS TERCEIRO';
update public.plans set monthly_cents = 12000 where source='pesados-026' and name = 'APENAS TERCEIRO FRANQUIA';

-- GUINCHO
update public.plans set monthly_cents = 20000 where source='pesados-026' and name = 'GUINCHO / EXTENSIVO';
update public.plans set monthly_cents = 25000 where source='pesados-026' and name = 'TOCO / GUINCHO';
update public.plans set monthly_cents = 15000 where source='pesados-026' and name = 'SPA TRUCK';

-- Terceiros TRUCK (TERCEIROS TRUCK ja tinha R$ 159,90 e R$ 89,90 na planilha original)
update public.plans set monthly_cents = 15990 where source='pesados-026' and name = 'TERCEIROS TRUCK - COTA 1.0';
update public.plans set monthly_cents = 7990  where source='pesados-026' and name = 'TERCEIROS TRUCK - COTA 2.0';
update public.plans set monthly_cents = 8990  where source='pesados-026' and name = 'TERCEIROS TRUCK - COTA 3.0';

-- Valor Determinado
update public.plans set monthly_cents = 100000 where source='pesados-026' and name = 'VALOR DETERMINADO - CAVALO MECANICO E TRUCK';
update public.plans set monthly_cents = 35000 where source='pesados-026' and name = 'IMPLEMENTO VALOR DETERMINADO';
