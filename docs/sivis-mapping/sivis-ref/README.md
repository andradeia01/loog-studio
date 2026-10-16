# LOOG AI SDR Integration Hub

Camada backend HTTP determinística que serve a Zaia como conjunto de ferramentas do SDR de IA da LOOG.

> Status: **PHASE 1 — scaffold**. Fastify + auth + errors + logs + health. Providers e domínio nas próximas fases.

## Papel

- A Zaia continua sendo o cérebro: conversação, WhatsApp, CRM, memória, workflows, handoff.
- Este serviço fornece APIs para: consulta veicular, FIPE, análise de CRLV, geração/envio de áudio ElevenLabs, journey engine, lead score, cotação Sivisweb (planejado).

Cada endpoint é chamado pela Zaia via HTTP Request Tool com `Authorization: Bearer <INTERNAL_API_KEY>`.

## Stack

TypeScript · Node.js 24 · Fastify 5 · Zod · Pino · Vitest · Docker.

## Setup rápido

```bash
cp .env.example .env
# gere uma chave forte:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# cole em INTERNAL_API_KEY
npm install
npm run dev
```

Health:

```bash
curl http://localhost:8080/health
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe com hot-reload (tsx watch). |
| `npm run build` | Compila TypeScript para `dist/`. |
| `npm run start` | Roda produção (`node dist/index.js`). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm test` | Vitest run. |

## Docker

```bash
docker compose up --build
```

Sobe: `app` (porta 8080), `postgres` (5432), `redis` (6379).

## Estrutura

```
src/
  config/       env validation (Zod)
  lib/          errors, ids, helpers
  plugins/      auth, errorHandler, requestContext (Fastify plugins)
  routes/       endpoints HTTP
  server.ts     buildServer()
  index.ts      bootstrap + graceful shutdown
tests/          Vitest
ARCHITECTURE.md
Dockerfile
docker-compose.yml
```

## Fases

Ver [`ARCHITECTURE.md`](./ARCHITECTURE.md) e seção 37 da spec do produto. Progresso atual:

- [x] PHASE 1 — Scaffold + Fastify + config + auth + errors + logs
- [x] PHASE 2 — VehicleProvider + FIPE (interfaces + mock + Sivisweb; http-generic pendente)
- [ ] PHASE 3 — `/v1/vehicle/enrich`
- [ ] PHASE 4 — Document analysis
- [ ] PHASE 5 — Document verification
- [ ] PHASE 6 — ElevenLabs
- [ ] PHASE 7 — WhatsApp media
- [ ] PHASE 8 — Journey engine + lead score
- [ ] PHASE 9 — Webhooks + idempotency
- [ ] PHASE 10 — Zaia documentation
- [ ] PHASE 11 — Tests
- [ ] PHASE 12 — Docker + production hardening
- [x] PHASE 13 — Sivisweb QuoteProvider (login + vehicle lookup + quote chain via reverse-engineer do HAR)

## Sivisweb — como usar

Configure no `.env`:

```
QUOTE_PROVIDER=sivisweb
SIVISWEB_BASE_URL=https://portal.sivisweb.com.br
SIVISWEB_STORE_ID=028
SIVISWEB_USERNAME=<usuario-de-servico>
SIVISWEB_PASSWORD=<senha-forte>
SIVISWEB_SESSION_TTL_MINUTES=30
```

Endpoints ativos:

- `POST /v1/vehicle/lookup` — resolve placa via `BuscaPlaca` do portal.
- `POST /v1/quote/quick` — executa a cadeia salvarLead → buscarServicos → buscarCoberturas → updateLead → getModeloWhats e devolve `{quoteId, plan, whatsappMessage, portalUrl}`.

Ver `docs/ZAIA_TOOL_QUICK_QUOTE.md` para o payload esperado pela Zaia.

## Segurança

- Todas as rotas `/v1/*` exigem `Authorization: Bearer INTERNAL_API_KEY`.
- Rate limit global (@fastify/rate-limit).
- Pino com `redact` para authorization, cookies, CPF, tokens.
- Documentos brutos com retenção configurável (default: 0 min).
- Nunca loga documento, áudio bruto, senha, token, CPF.

## SDR MVP (WhatsApp via Baileys)

**⚠️ Baileys viola o ToS do WhatsApp.** Números conectados podem ser banidos pela Meta a qualquer momento, especialmente com alto volume de outbound. Use só com números que você aceita perder, aqueça-os, rotacione.

### Setup

```bash
# 1) Preencha .env
ANTHROPIC_API_KEY=sk-ant-...
INTERNAL_API_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
QUOTE_PROVIDER=sivisweb
SIVISWEB_USERNAME=...
SIVISWEB_PASSWORD=...
SDR_ENABLED=true
SDR_WHATSAPP_NUMBER_LABEL=loog-main

# 2) Rode o SDR
npm run sdr
```

Na primeira execução aparece um QR code no terminal — abra o WhatsApp no celular → **Aparelhos conectados** → **Conectar aparelho** → aponta pro QR. A sessão fica salva em `data/baileys/<label>/`.

### O que acontece no loop

1. Mensagem recebida via Baileys → orchestrator.
2. Store carrega/cria a conversa (`data/leads/<phone>.json`).
3. Agent constrói contexto: system prompt + prompt do estado atual + fatos + histórico + msg do lead.
4. Claude chama ferramentas conforme necessário (`lookup_vehicle_by_plate`, `create_quick_quote`, `advance_stage`, `mark_vehicle_confirmed`, `capture_pain`, `capture_objection`, `capture_documentation`, `request_human_handoff`).
5. Texto final da IA é enviado ao lead. Se acabou de gerar cotação, envia primeiro a `whatsappMessage` oficial do Sivisweb, depois o follow-up do agente.
6. Estado salvo. Se stage virou `HUMAN_HANDOFF/WON/LOST/NURTURE`, SDR não responde mais.

### Editar o "treino" do SDR

Prompts em Markdown, sem redeploy:

```
prompts/
├── system.md              # persona + regras invioláveis
└── states/
    ├── NEW_LEAD.md
    ├── GREETING.md
    ├── VEHICLE_CAPTURE.md
    ├── VEHICLE_CONFIRMATION.md
    ├── PAIN_DISCOVERY.md
    ├── PRE_QUOTE.md
    ├── QUOTE_PRESENTED.md
    ├── OBJECTION_HANDLING.md
    ├── CLOSING.md
    └── HUMAN_HANDOFF.md
```

Cache é limpo entre execuções — reinicie o processo pra pegar mudanças.

### Modelos usados

| Estado | Modelo default |
|---|---|
| Todos exceto abaixo | `claude-haiku-4-5-20251001` (barato, rápido) |
| `OBJECTION_HANDLING`, `CLOSING` | `claude-sonnet-5-5` (raciocínio maior) |

Override com `ANTHROPIC_MODEL_OVERRIDE=<model>` no .env.

### Limitações conhecidas do MVP

- **Um número por processo**. Multi-number = rodar mais processos com labels diferentes.
- **Sem warmup automático** — você precisa aquecer o número manualmente antes de escalar.
- **Sem follow-up agendado** — se o lead some, o SDR fica em silêncio até ele voltar.
- **Sem dashboard** — leitura é via `data/leads/*.json`.
- **Sem áudio** ainda — texto only. ElevenLabs entra em PHASE 6.
- **Sem PostgreSQL** — persistência em JSON. Prisma+Postgres entra em PHASE 9.
- **Não recebe áudio/imagem** — só texto. Se lead manda áudio, ignora silenciosamente.

## Próximos passos

- PHASE 3: `POST /v1/vehicle/enrich` (composição vehicle + FIPE via Sivisweb).
- PHASE 6+7: TTS ElevenLabs + envio de áudio via Baileys.
- PHASE 9: migrar persistência pra Postgres via Prisma.
- Dashboard admin web pra ver conversas + intervir.
- Multi-tenant: 1 processo controlando N números.
