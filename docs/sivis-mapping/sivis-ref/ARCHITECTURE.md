# LOOG AI SDR Integration Hub — Arquitetura

## Papel do sistema

Camada backend HTTP determinística que a Zaia consome via HTTP Request Tools.
Não substitui Zaia: fornece cálculos, integrações e recursos externos.

- Zaia = cérebro conversacional (SDR, CRM, memória, workflows, handoff).
- Hub = APIs pequenas, tipadas, idempotentes, observáveis, testáveis.

## Componentes

```
                            ┌──────────────────────────────┐
                            │            Zaia              │
                            │  (SDR, WhatsApp, Memory)     │
                            └───────────────┬──────────────┘
                                            │ HTTP + Bearer
                                            ▼
┌────────────────────────────────────────────────────────────────┐
│                    LOOG AI SDR Integration Hub                 │
│                                                                │
│   Fastify + Zod + Pino                                         │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ vehicle  │  │  fipe    │  │ document │  │ audio +      │    │
│  │ routes   │  │  routes  │  │  routes  │  │ whatsapp     │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘    │
│       │             │             │               │            │
│       ▼             ▼             ▼               ▼            │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              Provider Interfaces                        │    │
│  │  Vehicle / Fipe / Vision / Tts / WhatsApp / Storage /   │    │
│  │  Quote                                                  │    │
│  └────────────────────────────────────────────────────────┘    │
│       │             │             │               │            │
│       ▼             ▼             ▼               ▼            │
│  ┌────────┐   ┌────────┐   ┌────────┐   ┌────────────────┐     │
│  │ Mock / │   │ Mock / │   │ OpenAI │   │ Meta / TwiCloud│     │
│  │ HTTP   │   │ HTTP   │   │ Claude │   │ ElevenLabs     │     │
│  └────────┘   └────────┘   └────────┘   └────────────────┘     │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │          Journey engine (state machine + score)         │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  ┌────────────────┐    ┌───────────────┐   ┌───────────────┐   │
│  │  PostgreSQL    │    │  Redis (opt)  │   │  S3-compat    │   │
│  │  (Prisma)      │    │  cache/idem   │   │  temp storage │   │
│  └────────────────┘    └───────────────┘   └───────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

## Fronteiras

| Fronteira | Regra |
|---|---|
| Zaia → Hub | Autenticação `Bearer INTERNAL_API_KEY`. Payload Zod. Idempotency-Key nas operações de envio. |
| Hub → Zaia | Só via retorno HTTP (sem push). Webhooks recebem eventos da Zaia em `/webhooks/zaia`. |
| Hub → Providers externos | Interfaces tipadas. Sempre timeout + retry + circuit breaker. Erros normalizados para códigos do domínio. |
| Hub → Postgres | Prisma. Modelos mínimos (idempotência, auditoria, cache). Não replicar CRM. |
| Hub → Storage | Documentos brutos com TTL curto ou exclusão imediata. |

## Fluxo de dados de uma consulta veicular

```
Zaia → POST /v1/vehicle/enrich { plate }
  → normalizeBrazilianPlate()
  → VehicleProvider.lookupByPlate(plate)      # via env: mock | http-generic | ...
  → FipeProvider.lookup(fipeCode, modelYear)  # cacheado por (code, year, refMonth)
  → merge & normalize
  ← { vehicle, fipe, confidence }
```

## Fluxo de análise de documento

```
Zaia → POST /v1/document/vehicle/verify (multipart)
  → save temp (TTL)
  → VisionProvider.extract(image|pdf)         # OpenAI/Claude vision
  → normalize + confidence por campo
  → VehicleProvider.lookupByPlate(extracted.plate)
  → FipeProvider.lookup(...)
  → cross-check → recommendedAction
  → delete temp file
  ← { document, registry, fipe, validation, recommendedAction }
```

## Decisões importantes

1. **Provider por interface + factory por env.** Nenhum controller conhece o fornecedor. Trocar `VEHICLE_API_PROVIDER=mock → sinesp` não altera código de rota.
2. **Idempotência obrigatória em envio.** `POST /v1/whatsapp/audio/send` valida `idempotencyKey` em Postgres/Redis; segunda chamada retorna o resultado da primeira, não reenvia.
3. **Confidence é dado de primeira classe.** Documentos e verificações retornam confidence por campo + overall. Nunca "true/false" seco.
4. **State machine determinística.** `POST /v1/journey/next-action` é regra pura, testável. IA só entra em `communication-decision` para casos ambíguos.
5. **Zero PII em logs.** Pino redactor global. Plate mascarada (`ABC1***`). CPF nunca logado. Documento bruto jamais serializado.
6. **Retenção mínima.** `DOCUMENT_RETENTION_MINUTES=0` default. Áudio: URL assinada com TTL curto.
7. **Cache orientado por semântica.** FIPE cacheia por `(fipeCode, modelYear, referenceMonth)`. Vehicle lookup cacheia com TTL do fornecedor. Documento bruto nunca cacheia.
8. **Erro é payload, não exception.** `{ success:false, error:{ code, message, retryable }, requestId }`. Códigos estáveis para a Zaia rotear.
9. **Sivisweb (cotação) entra como QuoteProvider.** Sessão cacheada em Redis, credenciais em secrets, escopo mínimo.

## Interfaces principais

```ts
interface VehicleProvider {
  lookupByPlate(plate: string): Promise<VehicleLookupResult>;
}
interface FipeProvider {
  lookup(input: FipeLookupInput): Promise<FipeResult>;
}
interface VisionProvider {
  extractVehicleDocument(source: DocumentSource): Promise<DocumentExtraction>;
}
interface TtsProvider {
  synthesize(input: TtsInput): Promise<TtsResult>;
}
interface WhatsAppProvider {
  sendAudio(input: SendAudioInput): Promise<SendResult>;
}
interface StorageProvider {
  putTemp(bytes: Buffer, meta: TempMeta): Promise<{ url: string; key: string }>;
  delete(key: string): Promise<void>;
}
interface QuoteProvider {
  createQuickQuote(input: QuickQuoteInput): Promise<QuickQuoteResult>;
}
```

## Fases

Ver seção 37 da spec original. Estado atual: **PHASE 1**.
