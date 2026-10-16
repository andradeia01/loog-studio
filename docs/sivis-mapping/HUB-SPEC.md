# LOOG HUB — Spec Canônico (Track A: Substituir SIVIS)

> **Versão:** 0.1 · **Data:** 2026-10-06 · **Autor:** Andrade (@axencode) com assistência Claude Opus 4.7
> Esta é a fonte da verdade do produto. Qualquer disputa de design/escopo se resolve consultando este documento. Mudança de direção = atualizar este arquivo antes de qualquer código.

---

## 1. Problema

A LOOG hoje opera no **SIVIS** (SIVIS Tecnologia · portal.sivisweb.com.br, loja 028). Dependência externa com três custos:

1. **Operacional:** cada mudança de regra comercial, cobertura, taxa ou fluxo depende de ticket de suporte à SIVIS.
2. **Dado:** a base de associados, histórico de boletos, sinistros, vistorias e leads mora num banco que não é da LOOG. Sair custa tempo e eventualmente dinheiro.
3. **Estratégico:** o SIVIS não é construído para o ecossistema LOOG (ver doc 17 em `HALISSON - LOOG/`). Features como super-app, cashback cruzado, carteira de ∞ não existem lá — nem vão.

A Hinova apresentou proposta (nº 13.166, 06/08/2026, Sandro Versino) para migrar a LOOG do SIVIS para o pacote Hinova (APP Associado, APP Visto, Hinova Pay, Power CRM, SGA, R$ 5.500 setup + mensalidade). A proposta foi recusada: trocar um fornecedor por outro resolve nada.

**Decisão:** construir software proprietário da LOOG que substitua o SIVIS no prazo mais curto possível, mantendo todas as operações atuais rodando (migração zero-downtime).

---

## 2. Escopo do Track A (MVP)

O MVP está pronto quando a LOOG **desligar o SIVIS** sem perder nenhum fluxo abaixo.

### 2.1 Fluxos operacionais obrigatórios

| # | Fluxo | Quem usa | Hoje no SIVIS | No HUB |
|---|---|---|---|---|
| 1 | Cadastro de associado + veículo(s) | Admin, Consultor | Portal SIVIS | `apps/admin` + `apps/consultor` |
| 2 | Cotação por placa (FIPE + regras de preço + coberturas + adicionais) | Consultor | Portal SIVIS "Cotação Rápida" | `apps/consultor` |
| 3 | Conversão lead → adesão (aceite + 1º boleto + apólice) | Consultor, Admin | SIVIS | `apps/admin` + `apps/consultor` |
| 4 | Emissão de boletos mensais (Pix híbrido) | Admin (automático) | Hinova Pay? ou outro gateway | `packages/adapters/payment` (Asaas ou Pagar.me) |
| 5 | 2ª via de boleto + Pix pelo associado | Associado | APP Associado SIVIS | `apps/portal` |
| 6 | Baixa automática de pagamentos + conciliação | Admin | SIVIS Financeiro | `packages/core/billing` |
| 7 | Cobrança / inadimplência (régua automática) | Admin | SIVIS Financeiro + WhatsApp manual | `packages/core/dunning` + WhatsApp |
| 8 | Acionamento assistência 24h (guincho, chaveiro, pneu) | Associado | APP Associado + central telefônica | `apps/portal` + webhook central |
| 9 | Aviso de furto/roubo + abertura de sinistro | Associado | Formulário SIVIS | `apps/portal` + `apps/admin` |
| 10 | Vistoria de novo veículo (checklist + fotos + laudo PDF) | Vistoriador terceirizado | APP Visto SIVIS | `apps/vistoria` (PWA) |
| 11 | Revistoria (anual + inadimplentes) | Vistoriador | APP Visto SIVIS | `apps/vistoria` |
| 12 | Rede de atendimento (oficinas, assistências, borracheiros) | Associado | APP Associado SIVIS | `apps/portal` + mapa |
| 13 | Vantagens e benefícios do clube | Associado | APP Associado SIVIS | `apps/portal` |
| 14 | Documentação (regulamento, apólice por veículo em PDF) | Associado, Admin | APP Associado SIVIS | `apps/portal` + storage |
| 15 | Indicação de amigos + rastreio de recompensa | Associado | APP Associado SIVIS | `apps/portal` |
| 16 | Notificações push + e-mail + WhatsApp | Admin automático | SIVIS + ferramenta externa | `packages/core/notifications` |
| 17 | Eventos (cadastro, check-in, lista de presença) | Admin | SIVIS Eventos | `apps/admin` |
| 18 | Avaliação do atendente após ativação (NPS curto) | Associado | — (novo diferencial) | `apps/portal` |
| 19 | Gestão de fornecedores (cadastro + split financeiro) | Admin | SIVIS | `apps/admin` |
| 20 | Relatórios operacionais (faturamento, ativos, inadimplência, sinistralidade) | Diretor (Paulo) | SIVIS Dashboards | `apps/admin` + dashboards |
| 21 | Comissionamento + split de pagamento para consultor/corretora | Admin + Consultor | SIVIS + planilha | `packages/core/commission` + Asaas split |
| 22 | Convênios (parcerias com empresas que indicam associados) | Admin, Consultor | SIVIS | `apps/admin` |

### 2.2 Fora de escopo do Track A

- Super-app com 11 verticais (ver doc 17 do Halisson — vira Track B)
- Multi-tenant real (um tenant só: LOOG-Brasil)
- LOOG Pay próprio (usa Asaas ou Pagar.me no MVP; emissor próprio é fase 2)
- Rastreamento veicular telemétrico (score de direção)
- App do frentista / abastecimento (não aplica)
- Modo offline do associado (apenas vistoriador tem offline obrigatório)

---

## 3. Princípios de produto

1. **O associado nunca precisa falar com humano para operações rotineiras.** 2ª via de boleto, atualizar cadastro, pedir assistência, baixar apólice — tudo pelo app.
2. **O consultor fecha venda em menos de 5 minutos.** Placa → FIPE → cotação → WhatsApp pré-formatado → aceite online → 1º boleto emitido.
3. **O admin tem auditoria completa.** Toda mudança de regra, cobertura, preço fica versionada. Cotação antiga preserva o preço que tinha (snapshot).
4. **Nenhum preço decidido no cliente.** Toda tarifação é calculada no backend. Mudança de regra não quebra cotações antigas (soft-off + pricingRuleId).
5. **Zero PII em logs.** Placas mascaradas (ABC1***), CPF nunca logado estruturado, documentos brutos deletados após processamento.
6. **Deployment-friendly.** Supabase + Netlify/Vercel. Deploy em `git push`. Sem bare-metal, sem Docker na infra de produção (local sim para dev).

---

## 4. Arquitetura

### 4.1 Monorepo

```
LOOG HUB/
├── apps/
│   ├── admin/        Next.js 15 App Router · backoffice LOOG
│   ├── portal/       Next.js 15 PWA · app do associado
│   ├── consultor/    Next.js 15 · portal do consultor (cotação + CRM)
│   └── vistoria/     Next.js 15 PWA (offline) · app do vistoriador
├── packages/
│   ├── db/           Prisma schema + migrations + client
│   ├── core/         Domínio puro (TypeScript, zero deps de framework)
│   │   ├── member/       Associados
│   │   ├── vehicle/      Veículos (FIPE snapshot)
│   │   ├── quote/        Cotação + regras de preço
│   │   ├── membership/   Adesão + plano ativo
│   │   ├── billing/      Boletos + Pix + conciliação
│   │   ├── dunning/      Régua de cobrança
│   │   ├── claim/        Sinistros
│   │   ├── inspection/   Vistorias
│   │   ├── assistance/   Assistência 24h
│   │   ├── commission/   Comissões + split
│   │   └── notification/ Templates + canais
│   ├── adapters/     Integrações externas
│   │   ├── sivis/        Migração + cotação-fallback durante transição
│   │   ├── fipe/         Parallelum + fallback oficial
│   │   ├── payment/      Asaas + Pagar.me (gateway abstract)
│   │   ├── vision/       OpenAI vision para extração de CRLV/CNH
│   │   ├── whatsapp/     Meta Cloud API (preferencial) + Baileys (fallback MVP)
│   │   └── storage/      Supabase Storage
│   └── ui/           shadcn/ui + skin LOOG (Tailwind tokens)
├── docs/             spec, inventário, decisões
├── tools/
│   └── rea/          MCP de reverse engineering (SIVIS mapping)
└── scripts/          seeds, importers, ferramentas de migração
```

### 4.2 Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Framework | **Next.js 15** (App Router) + React 19 + TypeScript | Já é a stack das pastas existentes; SSR + Server Actions resolvem a maioria dos cenários sem BFF separado |
| Package manager | **pnpm 9** com workspaces | Monorepo nativo, mais rápido que npm |
| DB | **Postgres 16 via Supabase** | Managed, RLS nativo, backups, read replicas no plano Pro |
| ORM | **Prisma 6** | Schema único + types gerados + migrations versionadas |
| Auth | **Supabase Auth** (OTP + magic link + senha) | WhatsApp OTP via custom SMS provider, cobre associado e consultor |
| Validação | **Zod 4** | Nos boundaries (API, forms, env) |
| Pagamentos | **Asaas** (primeiro) + Pagar.me (fallback) | Asaas suporta boleto híbrido PIX + split nativo para comissões |
| WhatsApp | **Meta Cloud API** | Oficial, templates aprováveis, sem risco de ban |
| Vision/IA | **Anthropic Claude** (vision + text) + fallback OpenAI | Já usado no SDR, famílias Claude 5 |
| Storage | **Supabase Storage** | PDF apólices + fotos vistoria + CRLV |
| Hosting | **Vercel** para `apps/admin, apps/consultor` + **Netlify** para `apps/portal, apps/vistoria` | Vercel para apps internos (performance), Netlify tem edge functions para PWA offline |
| Observabilidade | **Vercel Analytics** + **Sentry** + **Pino** → **Grafana Cloud** (fase 2) | — |
| CI | **GitHub Actions** | Lint + typecheck + test + preview deploy |

### 4.3 Multi-tenancy (preparado, não ativado)

Toda tabela carrega `tenantId` desde o schema inicial. RLS no Postgres filtra por `auth.jwt() ->> 'tenant_id'`. MVP roda com um tenant só (`loog-brasil`). Permite no futuro: white-label para outra associação, LOOG-PT, LOOG-Frota como sub-tenant.

### 4.4 Modularidade

Cada módulo em `packages/core/*` segue o contrato:

```ts
export interface DomainModule<Config, Events> {
  id: string;                       // 'billing', 'claim', ...
  bootstrap(config: Config): void;
  events: Events;                   // event-sourced quando aplicável
}
```

Trocar o provider de pagamento (Asaas → Pagar.me → gateway próprio no futuro) não toca em nenhum consumidor — só em `packages/adapters/payment`.

---

## 5. Modelo de dados (resumo — detalhe em `docs/03-domain-model.md`)

Entidades centrais (abreviado):

```
Tenant
  └── User (admin, consultor, associado, vistoriador)
       └── Role (RBAC)

Member (associado)
  ├── Address
  ├── Vehicle (1..n)
  │    └── FipeSnapshot (histórico de valores)
  ├── Membership (adesão ativa / cancelada)
  │    └── Plan (snapshot do plano no momento da adesão)
  │         ├── Coverage[] (snapshot das coberturas)
  │         └── Add-on[]   (snapshot dos adicionais)
  └── EvaluationNps (avaliação do atendente)

Lead → Quote → Acceptance → Membership

Invoice (boleto)
  ├── PaymentAttempt
  ├── Settlement (baixa)
  └── DunningStep (régua de cobrança)

Claim (sinistro)
  ├── Occurrence (roubo, colisão, incêndio, outros)
  ├── Document (BO, CRLV, laudo)
  └── Status (open, investigating, approved, denied, paid, closed)

Inspection (vistoria)
  ├── ChecklistAnswer[]
  ├── Photo[]  (hash + GPS + timestamp assinados)
  ├── Signature (assinatura do associado)
  └── Report (PDF gerado)

AssistanceCall (acionamento 24h)
  ├── Type (guincho | chaveiro | pneu | mecânico | ...)
  ├── Location (GPS)
  ├── Provider (parceiro acionado)
  └── Status

PartnerNetwork (oficinas, assistências, borracheiros, convênios)
Supplier (fornecedores com split financeiro)
Event (evento + check-ins)
Document (regulamento, apólice, laudo — PDFs com versionamento)

AuditLog (toda mudança sensível)
PricingRule (versionadas; cotação referencia por id, mantendo snapshot)
```

Regra de ouro: **snapshots everywhere**. Mudar uma regra de preço nunca retroage em adesões/cotações antigas.

---

## 6. Integrações críticas

### 6.1 SIVIS (fase de transição)

Durante os primeiros 60-90 dias, o HUB opera em paralelo ao SIVIS. Dois modos:

- **Dual-write:** novas adesões vão para HUB e para SIVIS (via adapter `packages/adapters/sivis`), até o ponto de corte.
- **Read-fallback:** se o HUB não encontrar um associado (ainda não migrado), lê do SIVIS por API reversa-engenhada.

Endpoints SIVIS já mapeados (ver `docs/01-sivis-inventory.md`):

- Auth, Session, Vehicle lookup por placa, FIPE, Lead CRM, Produtos, Coberturas, Impressão de cotação.

A mapear (requer Andrade logado dirigindo a exploração):

- Vistoria completa (checklist + fotos + aprovação)
- Sinistros (abertura, acompanhamento, aprovação)
- Boletos (emissão, baixa, cancelamento)
- Rede de atendimento + fornecedores
- Eventos + check-ins
- Documentação (apólice gerada, regulamento)
- Comissionamento + convênios
- Relatórios internos

### 6.2 FIPE

Primário: **Parallelum v1** (gratuito, sem chave). Cache em `FipeSnapshot` por `(fipeCode, year, referenceMonth)`.

Fallback: API oficial FIPE (se Parallelum cair).

### 6.3 Pagamento (Asaas)

- Boleto híbrido com QR Pix.
- Split automático: X% para o consultor na cadeia de recebimento.
- Webhook de baixa em `/api/webhooks/asaas` com HMAC.
- Idempotência por `invoiceId` + `settlementId`.

### 6.4 WhatsApp (Meta Cloud API)

- Templates aprovados: `boleto_disponivel`, `confirmacao_pagamento`, `cobranca_D+3`, `cobranca_D+7`, `avisofurto_recebido`, `cotacao_enviada`, `apolice_pronta`.
- Fallback para Baileys apenas enquanto template approval pendente (ciente do risco de ban).

### 6.5 Vision IA (Anthropic Claude)

- Extração de CRLV (associado foto do documento no onboarding).
- Extração de B.O. (abertura de sinistro).
- Confidence por campo (nunca true/false seco).
- Retenção zero: imagem deletada após processamento + persistência estruturada.

---

## 7. Requisitos não-funcionais

| Categoria | Requisito |
|---|---|
| **Disponibilidade** | 99.5% para `apps/admin` e `apps/consultor`; 99.9% para `apps/portal` (associado é cliente). |
| **Latência** | Cotação por placa < 3s P95 (FIPE pode ser lento). Dashboard admin < 1.5s LCP. |
| **Offline** | `apps/vistoria` é obrigatório offline (fotos + GPS + fila sync quando voltar). Outros apps só precisam renderizar off-line a última tela vista. |
| **Segurança** | LGPD compliance · dados sensíveis criptografados em repouso (Supabase) · ledger imutável para pagamentos · auditoria event-sourced para dados do associado. |
| **Antifraude** | Régua declarativa para vistoria (fotos sem GPS, duplicatas, timing) · validação do B.O. real (consulta integrador quando possível). |
| **Observabilidade** | Sentry em toda rota · Vercel Analytics para Core Web Vitals · Grafana Cloud para traces (fase 2). |
| **Acessibilidade** | WCAG AA nos fluxos do associado · contraste All Black validado · haptic feedback no mobile. |
| **Backup** | Supabase daily automatic + weekly dump para storage encriptado terceiro. |
| **LGPD** | Política publicada · DPO (Andrade na fase MVP) · fluxo de exportar meus dados + excluir conta em `apps/portal`. |

---

## 8. Roadmap resumido (detalhe em `ROADMAP.md`)

| Fase | Semanas | Entregas-chave |
|---|---|---|
| **0 — Fundação** | 1-2 | Monorepo, Prisma inicial, Supabase, Auth, deploy Vercel/Netlify, design system LOOG tokens em código |
| **1 — Associado + Veículo + Portal V1** | 3-5 | CRUD associado/veículo, cadastro de coberturas e regras, PWA portal com 2ª via boleto (lendo do SIVIS via adapter) |
| **2 — Cotação + Consultor** | 6-8 | Portal consultor, cotação por placa (FIPE + regras locais), WhatsApp pré-formatado, pipeline CRM |
| **3 — Boletos + Pay** | 9-11 | Emissão + baixa + conciliação via Asaas, dunning automático, split para consultor |
| **4 — Vistoria** | 12-14 | PWA vistoria offline, assinatura, PDF laudo, workflow aprovação admin |
| **5 — Sinistros + Assistência 24h** | 15-17 | Abertura de sinistro, workflow aprovação, acionamento 24h com rede de parceiros |
| **6 — Migração SIVIS** | 18-20 | Ponto de corte: HUB passa a ser master, SIVIS fica read-only por 60 dias, depois desligamento |
| **7 — Hardening** | 21-24 | Pentest, DPO docs, SLA interno, dashboards diretoria, performance tuning |

Fase 5+ (Track B — super-app) só começa após desligar SIVIS.

---

## 9. Definição de pronto (DoD do Track A)

O LOOG HUB está pronto para substituir o SIVIS quando:

- [ ] Todo associado atual do SIVIS existe no HUB (migrado + validado por checksum).
- [ ] Associado consegue: 2ª via boleto (Pix + código barras), ver apólice, acionar 24h, abrir sinistro, atualizar dados — sem falar com humano.
- [ ] Consultor consegue: cotar por placa em < 3 min, enviar WhatsApp pré-formatado, acompanhar aceite, ver suas comissões — sem falar com admin.
- [ ] Admin consegue: cadastrar coberturas/regras, emitir boletos em lote, acompanhar inadimplência, ver dashboards de faturamento/sinistralidade — sem SQL.
- [ ] Vistoriador consegue: fazer vistoria offline, sincronizar quando voltar à rede, enviar PDF ao admin para aprovação.
- [ ] 100% dos endpoints SIVIS críticos têm equivalente no HUB (lista fechada em `docs/01-sivis-inventory.md`).
- [ ] Pentest + LGPD review aprovados.
- [ ] Dashboard operacional em TV no escritório.
- [ ] Playbook de incidente escrito e testado.
- [ ] SIVIS pode ser desligado (ou mantido read-only por 90 dias para auditoria histórica).

---

## 10. Decisões abertas

1. **Asaas vs Pagar.me para pagamentos.** Hoje recomendamos Asaas (split nativo + boleto híbrido fácil). Validar com Halisson/Paulo se há relação comercial preferencial.
2. **Supabase Pro vs auto-hospedado.** Supabase Pro ($25/mês) resolve dev + staging + produção pequena. Para escala, autohostar no Fly.io/Hetzner é alternativa. Decisão em fase 2.
3. **Admin em Next.js vs Retool/Appsmith.** O admin tem muito CRUD. Pode valer um low-code para operações internas. Trade-off: velocidade inicial × controle longo prazo. Recomendação: Next.js (controle), low-code só para scaffold temporário.
4. **Período de dual-write com SIVIS.** 30d, 60d, 90d? Depende do apetite de risco do Halisson. Minimo 30d após ponto de corte.
5. **Nome interno dos apps.** `admin`, `portal`, `consultor`, `vistoria` são genéricos. Vale batizar (ex: `núcleo`, `associado`, `vendas`, `vistoria`)? Marca é parte do produto.

---

## 11. Anexos previstos

- `docs/01-sivis-inventory.md` — endpoints SIVIS mapeados + lacunas
- `docs/02-arquitetura.md` — stack, env vars, infra
- `docs/03-domain-model.md` — Prisma schema completo
- `docs/04-migracao-sivis.md` — estratégia dual-write + ponto de corte
- `docs/05-design-system.md` — tokens Tailwind + componentes shadcn skinnados
- `docs/06-dominio-cotacao.md` — regra de preço + snapshot
- `docs/07-dominio-financeiro.md` — Asaas + dunning + conciliação
- `docs/08-dominio-vistoria.md` — offline-first, assinatura, PDF
- `docs/09-dominio-sinistros.md` — workflow aprovação + documentação
- `docs/10-dominio-assistencia-24h.md` — rede de parceiros + webhook central
- `docs/11-portal-associado.md` — telas (herdadas de `/APP Loog/`)
- `docs/12-portal-consultor.md` — Power CRM replacement
- `docs/13-admin-backoffice.md` — SGA replacement
- `docs/14-roadmap-super-app.md` — Track B (doc 17 do Halisson, resumido)

---

**Fim do Spec v0.1.** Qualquer alteração: PR com justificativa + atualização do changelog da seção afetada.
