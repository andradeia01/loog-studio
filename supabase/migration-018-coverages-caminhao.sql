-- =============================================================================
-- Migration 018: Coberturas opcionais completas pra CAMINHÃO
-- =============================================================================
-- Luís 27/10/2026: caminhão só tinha 1 toggle (monitoramento). Falta a estrutura
-- completa igual carros/utilitários mas com valores calibrados pro porte do veículo.
--
-- Regra de calibração: delta_cents pra caminhão ~2-3x o utilitário porque:
--   - Reboque de caminhão: equipamento especializado (plataforma de 20+ ton)
--   - Terceiros: acidente de caminhão causa muito mais dano
--   - Vidros: para-brisa panorâmico de caminhão é peça cara
--
-- Admin pode ajustar depois via SQL ou interface /admin/coverages.
-- =============================================================================

-- Remove entrada antiga de monitoramento_caminhao (vamos reinseri-la junto)
delete from public.cotacao_coverages where tipo_veiculo = 'caminhao';

-- CAMINHÃO ───────────────────────────────────────────────────────────────────
insert into public.cotacao_coverages (grupo, grupo_label, codigo, descricao, tipo_veiculo, nivel, exclusivo, delta_cents, ordem) values
  -- Reboque / Guincho (exclusivo — nível 1 incluso)
  ('reboque', 'Reboque / Guincho KM', 'reboque_caminhao_300', 'Guincho 300km — incluso', 'caminhao', 1, true, 0, 10),
  ('reboque', 'Reboque / Guincho KM', 'reboque_caminhao_600', 'Estender pra 600km', 'caminhao', 2, true, 15000, 11),
  ('reboque', 'Reboque / Guincho KM', 'reboque_caminhao_1000', 'Estender pra 1000km', 'caminhao', 3, true, 28000, 12),

  -- Terceiros (exclusivo — faixas maiores pq caminhão causa mais dano)
  ('terceiros', 'Danos Materiais a Terceiros', 'terceiros_caminhao_30k', 'Até R$ 30.000', 'caminhao', 1, true, 8000, 20),
  ('terceiros', 'Danos Materiais a Terceiros', 'terceiros_caminhao_50k', 'Até R$ 50.000', 'caminhao', 2, true, 12000, 21),
  ('terceiros', 'Danos Materiais a Terceiros', 'terceiros_caminhao_100k', 'Até R$ 100.000', 'caminhao', 3, true, 18000, 22),
  ('terceiros', 'Danos Materiais a Terceiros', 'terceiros_caminhao_200k', 'Até R$ 200.000', 'caminhao', 4, true, 28000, 23),
  ('terceiros', 'Danos Materiais a Terceiros', 'terceiros_caminhao_500k', 'Até R$ 500.000', 'caminhao', 5, true, 45000, 24),

  -- Carga Transportada (exclusivo — cobertura específica caminhão)
  ('carga', 'Cobertura de Carga', 'carga_caminhao_nenhuma', 'Sem cobertura de carga', 'caminhao', 1, true, 0, 25),
  ('carga', 'Cobertura de Carga', 'carga_caminhao_50k', 'Até R$ 50.000', 'caminhao', 2, true, 18000, 26),
  ('carga', 'Cobertura de Carga', 'carga_caminhao_100k', 'Até R$ 100.000', 'caminhao', 3, true, 30000, 27),
  ('carga', 'Cobertura de Carga', 'carga_caminhao_200k', 'Até R$ 200.000', 'caminhao', 4, true, 50000, 28),

  -- Monitoramento (toggle) — mantém valor original
  ('monitoramento', 'Rastreador / Monitoramento', 'monitoramento_caminhao', 'Monitoramento 24h — plano rastreador', 'caminhao', 0, false, 4000, 40),

  -- Vidros (exclusivo — vidros de caminhão são caros)
  ('vidros', 'Cobertura de Vidros', 'vidros_caminhao_parabrisa', 'Só para-brisa', 'caminhao', 1, true, 6000, 70),
  ('vidros', 'Cobertura de Vidros', 'vidros_caminhao_completa', 'Vidros + faróis + lanternas + retrovisores', 'caminhao', 2, true, 12000, 71),

  -- Atividade Remunerada (toggle — maioria dos caminhões é profissional)
  ('atividade', 'Atividade Remunerada', 'atividade_caminhao', 'Uso profissional / fretes', 'caminhao', 0, false, 5000, 60),

  -- Assistência 24h (toggle — para quem roda muito)
  ('assistencia_24h', 'Assistência 24h Estendida', 'assistencia_caminhao', 'Assistência 24h completa — mecânica/elétrica em rota', 'caminhao', 0, false, 4000, 80);
