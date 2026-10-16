# LOOG HUB — Roadmap

> Linha do tempo das fases do Track A (substituir SIVIS). Track B (super-app, doc 17) só começa após desligamento do SIVIS.

Última atualização: 2026-10-06.

---

## Status das pastas pré-existentes

Antes das fases: inventário do que já existe no Desktop do Andrade.

| Pasta | Status | Decisão para o HUB |
|---|---|---|
| `APP Loog/` | 🟢 Protótipo HTML/CSS completo (8 telas, dev-specs) | Base de UI para `apps/portal`. Portar para Next.js 15 + Tailwind + shadcn. |
| `SOFTWARE - LOOG PROTEÇÃO VEICULAR/` | 🟢 Next.js 15 funcional. Cotação por placa + FIPE + Postgres local via Docker | Base de `apps/consultor`. Migrar Postgres local → Supabase. Preservar camadas `services/`. |
| `SDR - LOOG - PROTEÇÃO VEICULAR/` | 🟢 SDR AI (Zaia + Baileys + SivisWeb reverse-eng) rodando com cloudflared | **Fica externo ao HUB**. Vira cliente do HUB quando este tiver API de cotação. SivisWeb provider vira `packages/adapters/sivis`. |
| `LOOG-STUDIO/`, `LOOG-STUDIO-DEPLOY/` | 🟡 Gerador de artes para consultores (Sharp + templates) | Módulo opcional de `apps/consultor` fase 2+. |
| `HALISSON - LOOG/` | 🟢 Spec v0.2 super-app (doc 17) + 90+ assets de brand/voz/conteúdo | Referência estratégica. Extrato em `docs/14-roadmap-super-app.md`. |
| `GAME LOOG - IA/`, `LOOG-Apresentacao/`, `.pptx` várias | 🔵 Marketing / lançamento | Fora do escopo técnico. Não absorver. |

---

## Fase 0 — Fundação (semanas 1-2)

Objetivo: monorepo rodando com um "hello world" em cada app + banco migrado + deploy funcionando.

- [x] Decisão de escopo (Track A, Next.js + Prisma + Supabase + PWA)
- [x] Estrutura de pastas criada
- [x] SPEC.md canônico
- [ ] `pnpm` workspace + `turbo.json` (ou `nx`) — decidir pnpm+turbo
- [ ] Prisma inicial com tabelas base (Tenant, User, Role, Member, Vehicle)
- [ ] Supabase projeto criado + RLS policy inicial
- [ ] `apps/admin` scaffold com Supabase Auth + home vazia
- [ ] `apps/portal` scaffold com Supabase Auth + home vazia
- [ ] `apps/consultor` scaffold com Supabase Auth + home vazia
- [ ] `apps/vistoria` scaffold (PWA skeleton)
- [ ] Deploy inicial Vercel (admin, consultor) + Netlify (portal, vistoria)
- [ ] CI GitHub Actions: lint + typecheck + test + preview deploy
- [ ] `docs/02-arquitetura.md` detalhado (env vars, segredos, infra)
- [ ] `docs/05-design-system.md` com tokens + shadcn init

**Marco:** `pnpm dev` roda os 4 apps localmente. Deploys preview funcionam.

---

## Fase 1 — Associado + Veículo + Portal V1 (semanas 3-5)

Objetivo: CRUD de associado e veículo no admin. Portal do associado mostra ficha + lista de boletos lendo do SIVIS via adapter.

- [ ] `packages/db` schema para Member, Address, Vehicle, FipeSnapshot
- [ ] `packages/core/member` CRUD + validação Zod
- [ ] `packages/core/vehicle` CRUD + lookup FIPE (Parallelum provider)
- [ ] `packages/adapters/sivis` consolida reverse-engineering do SDR folder (login, vehicle, FIPE, lead CRM)
- [ ] `apps/admin` tela de listagem + edição de associado
- [ ] `apps/admin` tela de listagem + edição de veículo
- [ ] `apps/portal` login + home com saudação + dropdown de veículo + card de próxima fatura (dados do SIVIS)
- [ ] `apps/portal` 2ª via de boleto (lendo URL do SIVIS/Asaas)
- [ ] Portar as 8 telas HTML de `/APP Loog/` para componentes React
- [ ] Primeiro deploy público do portal (associado teste)

**Marco:** 10 associados reais da LOOG conseguem logar no portal e baixar 2ª via de boleto.

---

## Fase 2 — Cotação + Consultor (semanas 6-8)

Objetivo: consultor fecha cotação pelo HUB sem precisar do SIVIS.

- [ ] `packages/core/quote` motor determinístico de preço + regras versionadas
- [ ] `packages/core/quote` snapshot de cobertura/regra no momento da cotação
- [ ] `packages/db` schema Lead, Quote, PricingRule, Coverage, AddOn
- [ ] `apps/consultor` wizard: placa → FIPE → cliente → gerar
- [ ] `apps/consultor` tela de edição de cotação com recálculo backend
- [ ] `apps/consultor` CRM: pipeline de leads (NEW → QUALIFIED → QUOTED → ACCEPTED → LOST)
- [ ] `apps/consultor` envio WhatsApp pré-formatado (template Meta Cloud API aprovado)
- [ ] `apps/admin` painel admin de coberturas e regras de preço
- [ ] Importar os leads existentes do SIVIS loja 028 (CRM atual)
- [ ] Decidir estratégia de WhatsApp Business (Meta Cloud oficial × Baileys do SDR)

**Marco:** 1 consultor da LOOG fecha 5 cotações reais no HUB. SDR AI começa a chamar API do HUB em vez do SIVIS direto.

---

## Fase 3 — Boletos + Pay (semanas 9-11)

Objetivo: emissão de boletos mensais pelo HUB. Baixa automática. Régua de cobrança.

- [ ] Decidir Asaas × Pagar.me (recomendação: Asaas)
- [ ] `packages/adapters/payment/asaas` emissão + baixa + webhook HMAC
- [ ] `packages/core/billing` modelo Invoice + PaymentAttempt + Settlement
- [ ] `packages/core/dunning` régua automática (D+3, D+7, D+15, D+30)
- [ ] `apps/admin` lote de emissão mensal
- [ ] `apps/admin` tela de conciliação + reconciliation report
- [ ] `apps/portal` Pix + 2ª via boleto emitidos pelo HUB
- [ ] `apps/portal` cartão de crédito (parcelamento) para adesão
- [ ] Split de comissão para consultor automatizado
- [ ] Templates WhatsApp aprovados: boleto_disponivel, confirmacao_pagamento, cobranca

**Marco:** emissão mensal 100% pelo HUB. Dupla de reconciliação com SIVIS por 30 dias.

---

## Fase 4 — Vistoria (semanas 12-14)

Objetivo: substituir APP Visto do SIVIS. Vistoria offline obrigatória.

- [ ] `packages/core/inspection` modelo + checklist versionado
- [ ] `apps/vistoria` PWA offline-first com IndexedDB
- [ ] Captura de foto com watermark (GPS + timestamp assinado)
- [ ] Fluxo de assinatura do associado (canvas) + checksum
- [ ] Fila de sync quando voltar à rede
- [ ] Geração de PDF laudo (puppeteer/Playwright server-side)
- [ ] `apps/admin` fluxo de aprovação da vistoria (admin aprova/rejeita)
- [ ] Régua antifraude declarativa (foto sem GPS, duplicata, horário suspeito)
- [ ] Export para storage com retenção 10 anos (requisito LGPD + regulatório)

**Marco:** 1 vistoriador terceirizado faz 20 vistorias reais no HUB sem usar APP Visto.

---

## Fase 5 — Sinistros + Assistência 24h (semanas 15-17)

Objetivo: fechar o portfólio operacional. Associado pode abrir sinistro e acionar guincho pelo app.

- [ ] `packages/core/claim` workflow (opened → investigating → approved/denied → paid → closed)
- [ ] `apps/portal` abertura de sinistro: foto, B.O., localização, descrição
- [ ] Extração de B.O. via Anthropic vision (preenche campos)
- [ ] `apps/admin` painel do analista de sinistros + aprovação multi-step
- [ ] `packages/core/assistance` cadastro de rede (guincho, chaveiro, pneu, mecânico) por região
- [ ] `apps/portal` acionamento 24h: tipo + localização GPS + status em tempo real
- [ ] Webhook para central de atendimento 24h (parceiro externo)
- [ ] `apps/admin` SLA tracker da assistência (tempo resposta médio por tipo/região)

**Marco:** 1 sinistro real aberto, aprovado e pago pelo HUB. 1 guincho acionado via app.

---

## Fase 6 — Migração SIVIS (semanas 18-20)

Objetivo: ponto de corte. HUB vira master. SIVIS vira read-only por 90d.

- [ ] Script `scripts/migrate-sivis.ts` para dump completo da loja 028
- [ ] Validação por checksum (associados, veículos, boletos, sinistros, vistorias)
- [ ] Ponto de corte: data D em que novos cadastros só vão para HUB
- [ ] SIVIS continua rodando read-only para consultas históricas
- [ ] Comunicação com equipe LOOG (treinamento 2 semanas antes)
- [ ] Notificação aos associados ativos (template WhatsApp)
- [ ] Monitoramento intensivo nas primeiras 72h
- [ ] Rollback plan documentado + testado

**Marco:** D+30 do ponto de corte sem incidentes bloqueantes = SIVIS pode ser desligado.

---

## Fase 7 — Hardening (semanas 21-24)

Objetivo: tirar o rótulo "MVP" e deixar institucional.

- [ ] Pentest externo (recomendação: Tempest ou IDUFF)
- [ ] LGPD review formal + política publicada + DPO oficial
- [ ] SLA interno (99.5% admin, 99.9% portal)
- [ ] Dashboards diretoria (Paulo + Halisson): faturamento, ativos, inadimplência, sinistralidade, LTV, CAC
- [ ] Performance tuning (Core Web Vitals verde em todos os apps)
- [ ] Playbook de incidente (SEV1-SEV4) + plantão
- [ ] Backup off-site encriptado (semanal)
- [ ] Documentação de operação para equipe LOOG (admin, financeiro, cobrança, sinistros)

**Marco:** diretoria sente que o produto é "deles" — ninguém mais pergunta "e se o Andrade sumir?".

---

## Pós-MVP (Track B — Super-app)

A partir daqui, o HUB vira a base do super-app descrito no doc 17 do Halisson. Primeira vertical adicional provável:

1. **LOOG Mobilidade** (motorista de app com desconto no combustível) — maior fila esperada
2. **LOOG Oficina** (manutenção preventiva com preço-teto)
3. **LOOG Farmácia** (remédio pelo preço de custo)

Cada vertical vira um módulo em `packages/core/*` e um tile no portal. Arquitetura é aditiva — nada do Track A precisa ser refatorado.

---

## Riscos conhecidos

| Risco | Impacto | Mitigação |
|---|---|---|
| Mapeamento incompleto do SIVIS (vistorias, sinistros, financeiro) | Alto — pode descobrir campo faltante na migração | Fases 4-5 fazem a reverse engineering junto com a implementação. Andrade dirige exploração logada semanalmente. |
| Asaas/Pagar.me recusar split para associação (modelo jurídico) | Alto | Validar com jurídico ANTES da fase 3. Alternativa: emissor próprio (fase 8+) com conta PJ corrente + conciliação manual. |
| Templates WhatsApp Business não aprovados | Médio | Baileys como fallback (ciente do risco). Submeter templates desde fase 1. |
| Volume de associados maior que estimado | Médio | Supabase Pro escala vertical. Em 50k+ associados, considerar Postgres dedicado (Fly.io ou Hetzner). |
| Resistência da equipe LOOG ao HUB (acostumados com SIVIS) | Médio | Treinamento 2 semanas antes do corte. Side-by-side nas primeiras 2 semanas. |
| Andrade bus-factor = 1 | Alto | Documentar tudo em `docs/`. Spec-driven força decisões escritas. Em fase 7 contratar segundo dev. |

---

## Métricas de acompanhamento (quando MVP for pro ar)

- **Operacionais:** uptime admin/portal, latência cotação, taxa de conversão lead→adesão, tempo médio de resolução de sinistro, SLA assistência 24h.
- **Financeiras:** faturamento mensal, inadimplência D+30, D+60, D+90, LTV, churn, CAC, split pago a consultores.
- **Produto:** DAU/WAU do portal, taxa de uso de 2ª via, # acionamentos 24h, NPS pós-atendimento.
- **Técnicas:** erros Sentry por semana, Core Web Vitals por app, custo infra mensal.
