-- =============================================================================
-- Migration 019: Exceções em bloqueios de marca
-- =============================================================================
-- Luís 27/10/2026: "quero poder bloquear a marca MAS deixar apenas 1 modelo liberado"
-- Ex: Chevrolet bloqueada EXCETO Onix Plus. Antes era tudo-ou-nada.
--
-- Nova coluna: allowed_model_codes text[] (FIPE codigos liberados mesmo com marca bloqueada)
-- Também salva allowed_model_names pra display sem ter que fazer join com fipe_catalog_modelos.
-- =============================================================================

alter table public.vehicle_blocks
  add column if not exists allowed_model_codes text[] not null default '{}',
  add column if not exists allowed_model_names text[] not null default '{}';

comment on column public.vehicle_blocks.allowed_model_codes is
  'Códigos FIPE de modelos que são EXCEÇÃO ao bloqueio de marca. Só se aplica quando modelo_codigo IS NULL (bloqueio de marca inteira).';
comment on column public.vehicle_blocks.allowed_model_names is
  'Nomes dos modelos liberados por exceção — pareados por índice com allowed_model_codes.';
