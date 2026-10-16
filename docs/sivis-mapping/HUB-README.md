# LOOG HUB

Repositório-mãe do software proprietário da **LOOG Proteção Veicular** — associação sul-fluminense de proteção veicular (CNPJ 55.577.669/0001-32), fundada por Halisson Emerick.

> **Missão de curto prazo (Track A):** substituir o **SIVIS** (portal.sivisweb.com.br), ERP/CRM que a LOOG opera hoje. Sem dependência de Hinova (proposta comercial 13.166 recusada em agosto/2026).
>
> **Visão de longo prazo (Track B):** ecossistema LOOG com 11 verticais (ver `docs/14-roadmap-super-app.md`). Fora de escopo do MVP.

---

## O que é

Monorepo com os 4 apps que, juntos, substituem o conjunto SIVIS + eventuais complementos:

| App | Papel | Substitui | Status |
|---|---|---|---|
| `apps/admin` | Backoffice (SGA): cadastro de associados, veículos, financeiro, cobrança, documentação, eventos, rede de atendimento, fornecedores | SIVIS Dashboard | ⬜ pending |
| `apps/portal` | PWA do associado: 2ª via boleto, acionamento 24h, documentos, pagamentos, notificações | APP Associado | 🟡 UI em `/Desktop/APP Loog` |
| `apps/consultor` | Portal do consultor/corretora: cotação por placa + CRM de leads + split comissão | Power CRM | 🟡 cotação em `/Desktop/SOFTWARE - LOOG PROTEÇÃO VEICULAR` |
| `apps/vistoria` | PWA de vistoria veicular (checklist + fotos + GPS + assinatura) | APP Visto | ⬜ pending |

Compartilhado:

| Package | O que faz |
|---|---|
| `packages/db` | Schema Prisma + migrations (Postgres via Supabase) |
| `packages/core` | Domínio puro: associado, veículo, cobertura, cotação, boleto, sinistro, vistoria |
| `packages/adapters` | SIVIS (migração), FIPE, Pagar.me/Asaas, OpenAI vision, WhatsApp |
| `packages/ui` | shadcn/ui skinnado com identidade LOOG (All Black + #0053FF) |

Tools:

| Pasta | O que é |
|---|---|
| `tools/rea` | [REA — Reverse Engineer Anything](https://github.com/morluto/rea) · MCP para engenharia reversa. Usado em fases iniciais para completar o mapeamento SIVIS. |

---

## Como navegar

| Arquivo | Para quê |
|---|---|
| [SPEC.md](./SPEC.md) | Spec canônico Track A — a fonte da verdade do produto. Leia primeiro. |
| [ROADMAP.md](./ROADMAP.md) | Fases, cronograma, status das pastas pré-existentes. |
| [docs/01-sivis-inventory.md](./docs/01-sivis-inventory.md) | Inventário dos endpoints SIVIS já engenhariam reversão + lacunas. |
| [docs/02-arquitetura.md](./docs/02-arquitetura.md) | Stack, monorepo, segredos, infra. |
| [docs/03-domain-model.md](./docs/03-domain-model.md) | Modelo de dados completo (associado, veículo, cobertura, boleto, sinistro, vistoria). |
| [docs/04-migracao-sivis.md](./docs/04-migracao-sivis.md) | Estratégia de migração (dados + leads + usuários do SIVIS). |
| [docs/05-design-system.md](./docs/05-design-system.md) | Identidade visual LOOG (All Black + cobalto #0053FF). |

---

## Pastas pré-existentes no Desktop (absorvidas como base)

| Pasta origem | O que oferece | Destino no HUB |
|---|---|---|
| `APP Loog/` | Protótipo HTML/CSS das 8 telas do app associado (login, home, veículos, pagamentos, dados, documentos, notificações, avaliação) | referência de UI para `apps/portal` |
| `SOFTWARE - LOOG PROTEÇÃO VEICULAR/` | Next.js 15 + Prisma com cotação por placa + FIPE + Postgres local via Docker. Já funciona end-to-end. | base de `apps/consultor` (módulo cotação) |
| `SDR - LOOG - PROTEÇÃO VEICULAR/` | SDR AI (Zaia + Baileys) + **SivisWebQuoteProvider** reverse-engineered (login + lead + produtos + coberturas + impressão) | `packages/adapters/sivis` + SDR mantém-se externo |
| `HALISSON - LOOG/` | Spec v0.2 do super-app LOOG (doc 17, 605 linhas) + biblioteca de brand/voz/conteúdo (90+ arquivos) | referência estratégica, extratos no `docs/14-roadmap-super-app.md` |
| `LOOG-STUDIO/`, `LOOG-STUDIO-DEPLOY/` | Gerador de artes para consultores (Sharp + templates). | módulo opcional de `apps/consultor` |

Nenhuma dessas pastas foi tocada. O HUB cresce em paralelo e absorve o que fizer sentido via import/copy.

---

## Status atual

- [x] Decisão de escopo: **substituir SIVIS primeiro** (Track A), stack Next.js + Prisma + Supabase + PWA
- [x] Inventário parcial dos endpoints SIVIS (login, vehicle, FIPE, lead, produtos, coberturas, impressão)
- [x] Estrutura de monorepo criada
- [x] SPEC.md canônico escrito
- [ ] Completar inventário SIVIS: vistorias, sinistros, financeiro, eventos, documentação (precisa do Andrade logado dirigindo a exploração)
- [ ] Modelo de dados Prisma inicial
- [ ] Scaffold `apps/admin` com Next.js 15 + Supabase Auth
- [ ] Primeira migration + seed com dados ficcionais

Ver [TaskList](#) desta sessão para a fila de trabalho.

---

## Como rodar (quando os apps existirem)

Pré-requisitos: Node 24+, pnpm 9+, Docker (Postgres local via docker-compose), conta Supabase.

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev          # roda admin + portal + consultor + vistoria em paralelo
```

Variáveis de ambiente: ver `docs/02-arquitetura.md § 7`.

---

## Licença e propriedade

Software proprietário da **LOOG Proteção Veicular**. Não distribuir. Todos os direitos reservados.
