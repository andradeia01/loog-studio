-- Migration 012: Seed planos + bloqueio por modelo + signatarios de contrato

-- =============================================================================
-- 1) Seed planos (Planos.xlsx)
-- =============================================================================
insert into public.plans (slug, name, group_name, vehicle_type, vehicle_type_label, min_fipe_cents, max_fipe_cents, monthly_cents, participation_type, participation_value, payment_options, extras, adhesion_service, sell_on_site, favorite, installments, year_limit, monthly_includes_adhesion, display_order) values
('cota-1-0', 'COTA 1.0', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 0, 2160000, 3490, 'fixed_cents'::plan_participation_type, 150000, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 0),
('cota-1-5', 'COTA 1.5', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 2160100, 3000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 1),
('cota-2-0', 'COTA 2.0', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 3000001, 4000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 2),
('cota-2-5', 'COTA 2.5', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 4000001, 5000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 3),
('cota-3-0', 'COTA 3.0', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 5000001, 6000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 4),
('cota-3-5', 'COTA 3.5', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 6000001, 7000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 5),
('cota-4-0', 'COTA 4.0', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 7000001, 8000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 6),
('cota-4-5', 'COTA 4.5', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 8000001, 9000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 7),
('cota-5-0', 'COTA 5.0', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 9000001, 10000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 8),
('cota-5-5', 'COTA 5.5', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 10000001, 11000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 9),
('cota-6-0', 'COTA 6.0', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 11000001, 12000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 10),
('cota-6-5', 'COTA 6.5', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 12000001, 13000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 11),
('cota-7-0', 'COTA 7.0', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 13000001, 14000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 12),
('cota-1-0-moto', 'COTA 1.0 MOTO', 'CONTRATOS', 'moto'::vehicle_type, 'Moto', 0, 2000000, 3490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km para pane Mecânica ou Eletrica (150km ida + 150km volta).', 'TAXA DE ADESAO', true, true, true, 21, true, 13),
('cota-1-5-moto', 'COTA 1.5 MOTO', 'CONTRATOS', 'moto'::vehicle_type, 'Moto', 2000001, 3000000, 3490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km para pane Mecânica ou Eletrica (150km ida + 150km volta).', 'TAXA DE ADESAO', true, true, true, 21, true, 14),
('cota-2-0-moto', 'COTA 2.0 MOTO', 'CONTRATOS', 'moto'::vehicle_type, 'Moto', 3000001, 4000000, 3490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km para pane Mecânica ou Eletrica (150km ida + 150km volta).', 'TAXA DE ADESAO', true, true, true, 21, true, 15),
('cota-2-5-moto', 'COTA 2.5 MOTO', 'CONTRATOS', 'moto'::vehicle_type, 'Moto', 4000001, 5000000, 3490, 'percent_bp'::plan_participation_type, 1500, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km para pane Mecânica ou Eletrica (150km ida + 150km volta).', 'TAXA DE ADESAO', true, true, true, 21, true, 16),
('rastreador-caminh-o', 'RASTREADOR - CAMINHÃO', 'CONTRATOS', 'caminhao'::vehicle_type, 'Caminhao', 0, 100000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', '', 'TAXA DE ADESAO', false, false, true, 50, false, 17),
('cota-1-0-utilit-rios', 'COTA 1.0 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 0, 1000000, 4490, 'fixed_cents'::plan_participation_type, 200000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 18),
('cota-1-5-utilit-rios', 'COTA 1.5 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 1000001, 2000000, 4490, 'fixed_cents'::plan_participation_type, 200000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 19),
('cota-2-0-utilit-rios', 'COTA 2.0 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 2000001, 3000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 20),
('cota-2-5-utilit-rios', 'COTA 2.5 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 3000001, 4000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 21),
('cota-3-0-utilit-rios', 'COTA 3.0 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 4000001, 5000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 22),
('cota-3-5-utilit-rios', 'COTA 3.5 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 5000001, 6000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 23),
('cota-4-0-utilit-rios', 'COTA 4.0 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 6000001, 7000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 24),
('cota-4-5-utilit-rios', 'COTA 4.5 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 7000001, 8000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 25),
('cota-5-0-utilit-rios', 'COTA 5.0 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 8000001, 9000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 26),
('cota-5-5-utilit-rios', 'COTA 5.5 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 9000001, 10000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 27),
('cota-6-0-utilit-rios', 'COTA 6.0 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 10000001, 11000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 28),
('cota-6-5-utilit-rios', 'COTA 6.5 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 11000001, 12000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 29),
('cota-7-0-utilit-rios', 'COTA 7.0 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 12000100, 13000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 30),
('cota-7-5-utilit-rios', 'COTA 7.5 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 13000001, 14000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 31),
('cota-3-0-moto', 'COTA 3.0 MOTO', 'CONTRATOS', 'moto'::vehicle_type, 'Moto', 5000001, 6000000, 3490, 'percent_bp'::plan_participation_type, 1500, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km para pane Mecânica ou Eletrica (150km ida + 150km volta).', 'TAXA DE ADESAO', true, true, true, 21, true, 32),
('cota-7-5', 'COTA 7.5', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 14000001, 15000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 33),
('cota-8-0', 'COTA 8.0', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 15000001, 16000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 34),
('cota-8-5', 'COTA 8.5', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 16000001, 17000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 35),
('cota-9-0', 'COTA 9.0', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 17000001, 18000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 36),
('cota-9-5', 'COTA 9.5', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 18000001, 19000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 37),
('cota-10-0', 'COTA 10.0', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 19000001, 20000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 38),
('cota-10-5', 'COTA 10.5', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 20000001, 21000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 39),
('cota-11-0', 'COTA 11.0', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 21000001, 22000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 40),
('cota-11-5', 'COTA 11.5', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 22000001, 23000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 41),
('cota-12-0', 'COTA 12.0', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 23000001, 24000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 42),
('cota-12-5', 'COTA 12.5', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 24000001, 25000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 43),
('cota-13-0', 'COTA 13.0', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 25000001, 26000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 44),
('cota-13-5', 'COTA 13.5', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 26000001, 27000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 45),
('cota-14-0', 'COTA 14.0', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 27000001, 28000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 46),
('cota-14-5', 'COTA 14.5', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 28000001, 29000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 47),
('cota-15-0', 'COTA 15.0', 'CONTRATOS', 'carro'::vehicle_type, 'Carro', 29000001, 30000000, 3490, 'percent_bp'::plan_participation_type, 700, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90|12 - 418.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, false, 21, true, 48),
('cota-8-0-utilit-rios', 'COTA 8.0 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 14000001, 15000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 49),
('cota-8-5-utilit-rios', 'COTA 8.5 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 15000001, 16000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 50),
('cota-9-0-utilit-rios', 'COTA 9.0 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 16000001, 17000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 51),
('cota-9-5-utilit-rios', 'COTA 9.5 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 17000001, 18000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 52),
('cota-10-0-utilit-rios', 'COTA 10.0 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 18000001, 19000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 53),
('cota-10-5-utilit-rios', 'COTA 10.5 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 19000001, 20000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 54),
('cota-11-0-utilit-rios', 'COTA 11.0 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 20000001, 21000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 55),
('cota-11-5-utilit-rios', 'COTA 11.5 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 21000001, 22000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 56),
('cota-12-0-utilit-rios', 'COTA 12.0 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 22000001, 23000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 57),
('cota-12-5-utilit-rios', 'COTA 12.5 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 23000001, 24000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 58),
('cota-13-0-utilit-rios', 'COTA 13.0 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 24000001, 25000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 59),
('cota-13-5-utilit-rios', 'COTA 13.5 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 25000001, 26000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 60),
('cota-15-0-utilit-rios', 'COTA 15.0 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 26000001, 27000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 61),
('cota-15-5-utilit-rios', 'COTA 15.5 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 27000001, 28000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 62),
('cota-16-0-utilit-rios', 'COTA 16.0 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 28000001, 29000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 63),
('cota-16-5-utilit-rios', 'COTA 16.5 - UTILITÁRIOS', 'UTILITARIOS', 'utilitario'::vehicle_type, 'Utilitario/Diesel', 29000001, 30000000, 4490, 'percent_bp'::plan_participation_type, 1000, 'PIX - 44.90|BOL - 44.90|DCC - 44.90|1 - 44.90|12 - 538.80', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km (150km ida e 150km volta) para pane Mecânica, Eletrica e Falta de Combustivel', 'TAXA DE ADESAO', true, true, true, 21, true, 64),
('cota-3-5-moto', 'COTA 3.5 MOTO', 'CONTRATOS', 'moto'::vehicle_type, 'Moto', 6000001, 7000000, 3490, 'percent_bp'::plan_participation_type, 1500, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km para pane Mecânica ou Eletrica (150km ida + 150km volta).', 'TAXA DE ADESAO', true, true, true, 21, true, 65),
('cota-4-0-moto', 'COTA 4.0 MOTO', 'CONTRATOS', 'moto'::vehicle_type, 'Moto', 7000001, 8000000, 3490, 'percent_bp'::plan_participation_type, 1500, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km para pane Mecânica ou Eletrica (150km ida + 150km volta).', 'TAXA DE ADESAO', true, true, true, 21, true, 66),
('cota-4-5-moto', 'COTA 4.5 MOTO', 'CONTRATOS', 'moto'::vehicle_type, 'Moto', 8000001, 9000000, 3490, 'percent_bp'::plan_participation_type, 1500, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km para pane Mecânica ou Eletrica (150km ida + 150km volta).', 'TAXA DE ADESAO', true, true, true, 21, true, 67),
('cota-5-0-moto', 'COTA 5.0 MOTO', 'CONTRATOS', 'moto'::vehicle_type, 'Moto', 9000001, 10000000, 3490, 'percent_bp'::plan_participation_type, 1500, 'PIX - 34.90|BOL - 34.90|DCC - 34.90|1 - 34.90', 'Reboque com KM ILIMITADO em casos de colisao e ate 300km para pane Mecânica ou Eletrica (150km ida + 150km volta).', 'TAXA DE ADESAO', true, true, true, 21, true, 68)
on conflict (slug) do update set
  name = excluded.name,
  group_name = excluded.group_name,
  vehicle_type = excluded.vehicle_type,
  vehicle_type_label = excluded.vehicle_type_label,
  min_fipe_cents = excluded.min_fipe_cents,
  max_fipe_cents = excluded.max_fipe_cents,
  monthly_cents = excluded.monthly_cents,
  participation_type = excluded.participation_type,
  participation_value = excluded.participation_value,
  payment_options = excluded.payment_options,
  extras = excluded.extras,
  adhesion_service = excluded.adhesion_service,
  sell_on_site = excluded.sell_on_site,
  favorite = excluded.favorite,
  installments = excluded.installments,
  year_limit = excluded.year_limit,
  monthly_includes_adhesion = excluded.monthly_includes_adhesion,
  display_order = excluded.display_order,
  updated_at = now();


-- =============================================================================
-- 2) Bloqueio por modelo (vehicle_restrictions)
-- =============================================================================
-- scope decide a granularidade:
--   fipe_code -> bloqueia UM codigo FIPE especifico (ex: BMW X5 2015 1.6)
--   marca     -> bloqueia TODA uma marca (ex: todas BMWs)
--   modelo    -> bloqueia marca+modelo (ex: BMW X5 de qualquer ano)
--   placa     -> bloqueia placa especifica

do $$ begin
  create type vehicle_restriction_scope as enum ('fipe_code', 'marca', 'modelo', 'placa');
exception when duplicate_object then null; end $$;

create table if not exists public.vehicle_restrictions (
  id             uuid primary key default gen_random_uuid(),
  scope          vehicle_restriction_scope not null,
  marca          text,
  modelo         text,
  fipe_code      text,
  fipe_year_id   text,
  placa          text,
  vehicle_type   vehicle_type,
  reason         text,
  active         boolean not null default true,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (
    (scope = 'fipe_code' and fipe_code is not null) or
    (scope = 'marca' and marca is not null) or
    (scope = 'modelo' and marca is not null and modelo is not null) or
    (scope = 'placa' and placa is not null)
  )
);
create index if not exists vehicle_restrictions_scope_idx on public.vehicle_restrictions (scope, active);
create index if not exists vehicle_restrictions_marca_idx on public.vehicle_restrictions (marca) where marca is not null;
create index if not exists vehicle_restrictions_fipe_idx on public.vehicle_restrictions (fipe_code) where fipe_code is not null;
create index if not exists vehicle_restrictions_placa_idx on public.vehicle_restrictions (placa) where placa is not null;

do $$ begin
  create trigger vehicle_restrictions_set_updated_at before update on public.vehicle_restrictions
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

alter table public.vehicle_restrictions enable row level security;
drop policy if exists "vr read approved" on public.vehicle_restrictions;
drop policy if exists "vr admin all"     on public.vehicle_restrictions;
create policy "vr read approved" on public.vehicle_restrictions for select using (public.is_approved(auth.uid()) and active = true);
create policy "vr admin all"     on public.vehicle_restrictions for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

comment on table public.vehicle_restrictions is 'Lista negra de veiculos. Scope decide granularidade (fipe_code | marca | modelo | placa).';

-- Helper: verifica se um veiculo pode ser cotado
create or replace function public.is_vehicle_blocked(
  p_marca text, p_modelo text, p_fipe_code text, p_fipe_year_id text, p_placa text, p_type vehicle_type
) returns boolean language sql stable as $$
  select exists (
    select 1 from public.vehicle_restrictions vr
    where vr.active = true
      and (vr.vehicle_type is null or vr.vehicle_type = p_type)
      and (
        (vr.scope = 'placa' and upper(vr.placa) = upper(p_placa)) or
        (vr.scope = 'fipe_code' and vr.fipe_code = p_fipe_code and
          (vr.fipe_year_id is null or vr.fipe_year_id = p_fipe_year_id)) or
        (vr.scope = 'marca' and upper(vr.marca) = upper(p_marca)) or
        (vr.scope = 'modelo' and upper(vr.marca) = upper(p_marca) and upper(vr.modelo) = upper(p_modelo))
      )
  );
$$;

-- =============================================================================
-- 3) Signatarios de contrato (DocuSeal integration ready)
-- =============================================================================
do $$ begin
  create type signer_role as enum ('associado', 'presidente', 'vice_presidente');
exception when duplicate_object then null; end $$;

create table if not exists public.contract_signers (
  id             uuid primary key default gen_random_uuid(),
  contract_id    uuid,
  role           signer_role not null,
  profile_id     uuid references public.profiles(id) on delete set null,
  member_id      uuid references public.members(id) on delete cascade,
  nome           text not null,
  email          text,
  cpf_cnpj       text,
  order_index    integer not null default 0,
  required       boolean not null default true,
  signed_at      timestamptz,
  docuseal_id    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists contract_signers_contract_idx on public.contract_signers (contract_id);
create index if not exists contract_signers_profile_idx on public.contract_signers (profile_id);
create index if not exists contract_signers_member_idx on public.contract_signers (member_id);
create index if not exists contract_signers_role_idx on public.contract_signers (role, required);

do $$ begin
  create trigger contract_signers_set_updated_at before update on public.contract_signers
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

alter table public.contract_signers enable row level security;
drop policy if exists "cs read approved" on public.contract_signers;
drop policy if exists "cs admin all"     on public.contract_signers;
create policy "cs read approved" on public.contract_signers for select using (public.is_approved(auth.uid()));
create policy "cs admin all"     on public.contract_signers for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Settings: quem e o presidente/vice padrao da LOOG
create table if not exists public.contract_signer_defaults (
  id              uuid primary key default gen_random_uuid(),
  role            signer_role not null unique,
  profile_id      uuid references public.profiles(id) on delete set null,
  nome            text not null,
  email           text,
  cpf_cnpj        text,
  cargo           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

do $$ begin
  create trigger csd_set_updated_at before update on public.contract_signer_defaults
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

alter table public.contract_signer_defaults enable row level security;
drop policy if exists "csd read approved" on public.contract_signer_defaults;
drop policy if exists "csd admin all"     on public.contract_signer_defaults;
create policy "csd read approved" on public.contract_signer_defaults for select using (public.is_approved(auth.uid()));
create policy "csd admin all"     on public.contract_signer_defaults for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

insert into public.contract_signer_defaults (role, nome, cargo, active) values
  ('presidente', 'Halisson Emerick', 'Presidente', true),
  ('vice_presidente', 'Vice-Presidente LOOG', 'Vice-Presidente Executivo', false)
on conflict (role) do nothing;

comment on table public.contract_signers is 'Signatarios de cada contrato LOOG (associado + presidente + vice). DocuSeal integration via docuseal_id.';
comment on table public.contract_signer_defaults is 'Presidente/vice padrao da LOOG. Admin configura quem ocupa cada cargo.';
