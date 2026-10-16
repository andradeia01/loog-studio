# Spec: Vistoria por Vídeo 360° (apps/vistoria)

> Decisão: 2026-10-06 · Modo primário B (Vídeo 30s) + Modo consultor presencial sempre disponível + Checklist configurável por tipo de vistoria.
> Substitui o fluxo SIVIS web atual (10-15 min, 24 fotos, modo paisagem forçado) por **vídeo único de 30s + IA extrai os frames**.

---

## 1. Problema que estamos resolvendo

### 1.1 Fricções do SIVIS vistoria (medidas, não hipotéticas)

| # | Fricção | Fonte (doc) | Custo |
|---|---|---|---|
| 1 | Muro de 5 instruções antes da 1ª foto | [10-vistoria-web-app §3](sivis-exploration/10-vistoria-web-app.md) | ~1 min lendo |
| 2 | 24 slots de foto (del00..del23) | [05-erp-modulo-vistorias §8](sivis-exploration/05-erp-modulo-vistorias.md) | 8-10 min capturando |
| 3 | Modo paisagem forçado ("Imagem em modo retrato" rejeita) | [10-vistoria-web-app §3](sivis-exploration/10-vistoria-web-app.md) | Confusão + refazer |
| 4 | GPS por clique no mapa | [10-vistoria-web-app §3](sivis-exploration/10-vistoria-web-app.md) | Falha de permissão |
| 5 | "Procure saber onde está o CHASSI" | [10-vistoria-web-app §3](sivis-exploration/10-vistoria-web-app.md) | Pessoa não sabe |
| 6 | Zero feedback de qualidade em tempo real | Observado | Submete erro, descobre tarde |
| 7 | Digitação manual de placa + Km + chassi | [05-erp-modulo-vistorias §8](sivis-exploration/05-erp-modulo-vistorias.md) | 2 min + erro humano |

**Taxa de abandono estimada no SIVIS:** 30-45% (associado começa, desiste).

### 1.2 Meta do HUB

- Associado: < 2 min, zero digitação, zero refazer
- Consultor: fecha vistoria presencial em 3 min durante o aceite
- Admin: vê vistoria pronta para aprovação em até 2 min pós-submit (vídeo processado)
- Taxa de abandono: < 10%

---

## 2. Visão geral do fluxo

```
┌─────────────────────────────────────────────────────────┐
│                 FLUXO DO ASSOCIADO                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Admin dispara → gerado link único JWT no WhatsApp     │
│                                                         │
│         https://vistoria.loog.app.br/v/{token}         │
│                                                         │
│                        ↓                                │
│                                                         │
│  Tela 1 (3 segundos)                                   │
│  ┌───────────────────────────────────────────────┐     │
│  │ "Vamos vistoriar seu [MARCA MODELO]"          │     │
│  │ "1 vídeo de 30s. Caminhe ao redor do carro."  │     │
│  │ [COMEÇAR AGORA] ← cobalt CTA                  │     │
│  └───────────────────────────────────────────────┘     │
│                                                         │
│                        ↓                                │
│                                                         │
│  Tela 2 — GRAVAÇÃO (30s auto)                          │
│  ┌───────────────────────────────────────────────┐     │
│  │  🔴 00:12 / 00:30                              │     │
│  │                                               │     │
│  │  [câmera em tela cheia, modo vertical OK]     │     │
│  │                                               │     │
│  │  Overlay: "comece pela frente →"              │     │
│  │  (muda conforme tempo: lateral esq → trás →   │     │
│  │   lateral dir → frente novamente)             │     │
│  │                                               │     │
│  │  Indicador de luz baixa / tremedeira          │     │
│  │  (vibra celular se detecta ruim)              │     │
│  └───────────────────────────────────────────────┘     │
│                                                         │
│                        ↓ (auto 30s)                     │
│                                                         │
│  Tela 3 — Captura extra do CHASSI (overlay)            │
│  ┌───────────────────────────────────────────────┐     │
│  │  "Agora, foto do chassi"                      │     │
│  │  [overlay silhueta mostra 3 locais possíveis: │     │
│  │   cofre motor, coluna porta, paralama]        │     │
│  │  💡 "Toque num deles pra ver onde fica"       │     │
│  │  [TIRAR FOTO]                                 │     │
│  └───────────────────────────────────────────────┘     │
│                                                         │
│                        ↓                                │
│                                                         │
│  Tela 4 — Hodômetro                                    │
│  ┌───────────────────────────────────────────────┐     │
│  │  "Agora, foto do painel com Km visível"       │     │
│  │  [overlay mostra retângulo onde foto deve     │     │
│  │   enquadrar o display de Km]                  │     │
│  │  OCR em tempo real: Km detectado = 48.273     │     │
│  │  [CONFIRMAR] ou [REFAZER]                     │     │
│  └───────────────────────────────────────────────┘     │
│                                                         │
│                        ↓                                │
│                                                         │
│  Tela 5 — Processando                                  │
│  ┌───────────────────────────────────────────────┐     │
│  │  "Analisando seu vídeo…"                      │     │
│  │  [progress bar + preview dos ângulos achados] │     │
│  │  ◐ Frontal: ok (placa KYO-6I06 ✓)             │     │
│  │  ◐ Lateral esquerda: ok                       │     │
│  │  ◐ Traseira: ok                               │     │
│  │  ○ Lateral direita: ok                        │     │
│  │  ✓ Chassi: capturado                          │     │
│  │  ✓ Hodômetro: 48.273 Km                       │     │
│  │  (10-20 segundos)                             │     │
│  └───────────────────────────────────────────────┘     │
│                                                         │
│                        ↓                                │
│                                                         │
│  Tela 6 — Confirmação                                  │
│  ┌───────────────────────────────────────────────┐     │
│  │  ✓ Tudo certo!                                │     │
│  │  "Sua vistoria foi enviada. Prazo de análise: │     │
│  │   até 24h. Você vai ser avisado por WhatsApp" │     │
│  │  [FECHAR]                                     │     │
│  └───────────────────────────────────────────────┘     │
│                                                         │
│  TEMPO TOTAL ASSOCIADO: 90-120 segundos                │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Modos de operação

### 3.1 Modo A — Associado remoto (padrão)

Fluxo acima exatamente. Link enviado via WhatsApp pelo admin após o fechamento.

**Link format:**
```
https://vistoria.loog.app.br/v/{jwt_token}

JWT payload:
{
  "sub": "inspection_uuid",
  "mid": "member_uuid",
  "vid": "vehicle_uuid",
  "typ": "previa_carro",
  "exp": 1793567890,     // 72h de validade
  "iat": 1793393890
}
```

- JWT assinado com segredo rotacionado trimestralmente
- 72h de validade (configurável)
- Único — abrir 2x gera `sessionId` novo mas vincula ao mesmo `inspection_uuid`
- Após finalizado, link expira imediatamente (idempotência server-side)

### 3.2 Modo B — Vistoria presencial pelo consultor

**Dispara em:**
- `apps/consultor` tela da cotação aceita → botão "Fazer vistoria agora" → abre `apps/vistoria/presencial/{inspection_id}` no mesmo celular do consultor
- `apps/admin` ficha do associado → "Nova vistoria presencial"

**Diferenças UX:**
- Pula tela de boas-vindas (consultor já sabe o que vai fazer)
- Mostra identificação do associado em todas as telas (foto + nome)
- Pede confirmação do consultor no final: "Associado confirmou? [SIM]"
- Ao final, pede assinatura digital do associado no celular do consultor (canvas rápido)

**Vantagem comercial:** vistoria + aceite + assinatura + emissão de 1º boleto = **tudo na mesma sessão**. Zero risco de abandono.

### 3.3 Modo C — Fallback bot WhatsApp (futuro, fase 2+)

Se associado abriu link mas não finalizou em 24h, bot WhatsApp assume:

```
Bot: Oi [Nome], aqui é a LOOG. Vi que você começou a vistoria do seu KYO-6I06 e parou.
     Posso te ajudar aqui pelo WhatsApp mesmo. Me manda uma foto da frente do carro?

Associado: [foto frente]

Bot: ✓ Perfeito! Agora da lateral esquerda, por favor.

Associado: [foto lateral]

Bot: ✓ Ótimo! Agora da traseira...
```

Bot usa a **mesma API de upload** do app PWA. Associado nem percebe que entrou num fluxo alternativo.

---

## 4. Checklist configurável por tipo de vistoria

Baseado nos 9 tipos descobertos no SIVIS (`docs/sivis-exploration/11-erp-auxiliares-consolidado §1`):

### 4.1 Modelo `InspectionTemplate`

```ts
interface InspectionTemplate {
  id: string;
  tenantId: string;
  type: InspectionType;            // previa_carro, evento_abertura, inclusao_vidros, ...
  version: number;                 // snapshot — mudar versão não quebra vistorias antigas
  active: boolean;

  // Fluxo
  usesVideo: boolean;              // se false, usa fotos individuais em vez de vídeo
  videoMinSeconds: number;         // ex: 20 para moto, 30 para carro
  videoMaxSeconds: number;
  videoResolutionMin: '720p' | '1080p';

  // Ângulos a extrair do vídeo
  requiredVideoAngles: Angle[];    // ex: [FRONT, LEFT, REAR, RIGHT]
  optionalVideoAngles: Angle[];

  // Capturas EXTRAS fora do vídeo (fotos separadas)
  requiredExtraCaptures: ExtraCapture[];
  optionalExtraCaptures: ExtraCapture[];

  // OCR
  ocrPlateFrom: Angle[];           // ex: [FRONT, REAR] — tenta OCR em ambas
  ocrOdometerFromExtra: boolean;   // tenta OCR no extra 'ODOMETER'
  ocrChassisFromExtra: boolean;    // tenta OCR no extra 'CHASSIS'

  // Regras
  gpsRequired: boolean;
  gpsAccuracyMaxMeters: number;    // ex: 100
  landscapeOnly: boolean;          // DEFAULT: false (aceita vertical)
  flashAllowed: boolean;
  signatureRequired: boolean;      // Modo B presencial: true
}

type Angle =
  | 'FRONT'       | 'FRONT_LEFT'  | 'LEFT'   | 'REAR_LEFT'
  | 'REAR'        | 'REAR_RIGHT'  | 'RIGHT'  | 'FRONT_RIGHT'
  | 'INTERIOR'    | 'MOTOR';

type ExtraCapture =
  | 'CHASSIS'     | 'ODOMETER'    | 'CRLV'
  | 'DAMAGE_1'    | 'DAMAGE_2'    | 'DAMAGE_3'
  | 'POLICE_REPORT' | 'INVOICE'   | 'KEY'        // chaveiro para carro reserva
  | 'GLASS_DAMAGE' | 'NEW_PLATE_FRONT' | 'NEW_PLATE_REAR';
```

### 4.2 Configurações default por tipo

| Tipo (código SIVIS) | Vídeo | Extras obrigatórios | Opcionais | Tempo esperado |
|---|---|---|---|---|
| `previa_carro` (1) | 30s | CHASSIS, ODOMETER | CRLV | 90-120s |
| `previa_moto` (3) | 20s | CHASSIS, ODOMETER | CRLV | 70-90s |
| `reabilitacao_carro` (2) | 30s | ODOMETER | CRLV | 60-90s |
| `reabilitacao_moto` (4) | 20s | ODOMETER | — | 50-70s |
| `evento_abertura` (5) | 30s | DAMAGE_1, DAMAGE_2, ODOMETER, POLICE_REPORT | DAMAGE_3 | 180-240s |
| `evento_finalizado` (6) | — (só fotos) | ODOMETER + 4 fotos ângulos pós-reparo + INVOICE | — | 90-120s |
| `inclusao_vidros` (7) | — | FRONT (vidro), GLASS_DAMAGE | — | 30-45s |
| `inclusao_placa_carro` (8) | — | NEW_PLATE_FRONT, NEW_PLATE_REAR | ODOMETER | 30-45s |
| `inclusao_placa_moto` (9) | — | NEW_PLATE_REAR, CHASSIS | — | 30-45s |

### 4.3 Templates versionados

Admin pode editar template → sempre cria uma nova versão (não sobrescreve).

Vistorias antigas referenciam `template_version_id` fixo → mudar regra NÃO retroage.

---

## 5. Arquitetura técnica

### 5.1 Stack `apps/vistoria`

```
apps/vistoria/
├── app/
│   ├── v/[token]/page.tsx        ← fluxo associado (Modo A)
│   ├── presencial/[id]/page.tsx  ← fluxo consultor (Modo B)
│   └── api/
│       ├── upload-video/route.ts     (POST → Supabase Storage)
│       ├── upload-extra/route.ts     (POST foto extra)
│       ├── ocr/route.ts              (POST — chama vision IA)
│       └── finalize/route.ts         (POST — fecha vistoria)
├── components/
│   ├── video-recorder.tsx            (MediaRecorder API wrapper)
│   ├── camera-overlay.tsx            (overlay silhueta + alignment)
│   ├── ocr-feedback.tsx              (live display de OCR)
│   ├── chassi-helper.tsx             (desenho de onde fica)
│   └── odometer-crop.tsx             (recorte do painel)
└── lib/
    ├── ffmpeg-wasm.ts                (se extração client-side — opcional)
    ├── jwt-verify.ts                 (valida token)
    └── telemetry.ts                  (tracking de abandono)
```

### 5.2 Backend pipeline (Supabase Edge Function)

**Trigger:** POST em `apps/vistoria/api/upload-video` após upload terminar

```
┌─────────────────────────────────────────────────────────┐
│  Edge Function: process-inspection-video                │
└─────────────────────────────────────────────────────────┘

Input: inspectionId, videoUrl (Supabase Storage)
       templateId
       gpsLat, gpsLng
       deviceInfo

Steps:
  1. Load template (requiredVideoAngles, OCR rules)
  2. FFmpeg: extract frames @ 1fps → 30 frames
  3. For each frame:
     - Vision IA (Claude Opus 4.7 ou Haiku 4.5):
       Prompt: "Classifica este frame de uma vistoria veicular.
                Possíveis ângulos: FRONT, FRONT_LEFT, LEFT, REAR_LEFT,
                REAR, REAR_RIGHT, RIGHT, FRONT_RIGHT.
                Responde JSON: {angle, confidence, qualityScore}"
       Output: { angle: 'FRONT', confidence: 0.92, quality: 0.85 }
  4. Para cada ângulo requerido:
     - Pick frame com maior (confidence × quality)
     - Se maior < 0.7 → flag MISSING_ANGLE
  5. OCR placa (frames FRONT + REAR):
     - Vision IA com prompt dedicado "extraia a placa do veículo (7 chars)"
     - Cross-valida frente == trás (anti-fraude)
  6. OCR hodômetro (foto extra):
     - Prompt "Km atual do veículo neste display"
     - Reject se não detectar número
  7. OCR chassi (foto extra):
     - Prompt "número do chassi/VIN visível"
     - Valida padrão (17 chars alfanuméricos)
  8. Salvar como InspectionCapture[] + Inspection.status = PROCESSED
  9. Notificar admin (realtime channel)
  10. Notificar associado (push + WhatsApp "pronto!")

Total: 15-25 segundos. Associado espera com progress bar.
```

### 5.3 Fallbacks e tratamento de erro

| Cenário | Resposta |
|---|---|
| Internet caiu durante upload | Upload em chunks com retry (Supabase SDK suporta) |
| Vídeo < min seconds | "Vídeo muito curto, grave novamente" + volta pra gravação |
| Vídeo > max seconds | Backend corta primeiros N segundos |
| Vision IA erro / timeout | Retry 2x. Depois marca `requires_manual_review` + notifica admin |
| Ângulo necessário não detectado (quality < 0.7) | Volta pro associado: "Precisamos de uma foto da **lateral direita**" (apenas o ângulo faltante) |
| OCR placa não bate frente × trás | Flag `anti_fraud_mismatch` → admin revisa manualmente |
| GPS inacessível | Pede CEP manual |
| Permissão de câmera negada | Mostra tutorial de como habilitar + botão "Tentar de novo" |
| Dispositivo desktop | Mostra QR code pra abrir no celular (+ opcional: desktop com webcam) |

---

## 6. UX detalhada

### 6.1 Tela 1 — Boas-vindas (3s)

```
┌────────────────────────────┐
│       LOOG                 │
│                            │
│   Vamos vistoriar seu      │
│   HONDA CB 300F            │
│   KYO-6I06                 │
│                            │
│  📹 1 vídeo de 30 segundos │
│  📸 2 fotos (chassi + km)  │
│                            │
│   Total: ~2 minutos        │
│                            │
│   [ COMEÇAR AGORA ]  ← cobalt
│                            │
│   💡 Procure um local      │
│      iluminado             │
└────────────────────────────┘
```

**Decisões:**
- Mostra marca/modelo/placa (associado reconhece)
- Promessa de tempo clara (2 min)
- Breakdown rápido (1 vídeo + 2 fotos) — zero textão
- 1 dica apenas (iluminação) — não lista 10 regras

### 6.2 Tela 2 — Gravação de vídeo

**Pré-captura (2s):**
```
┌────────────────────────────┐
│  Como gravar:              │
│                            │
│  Fique a ~3m do carro      │
│  Comece pela FRENTE        │
│  Caminhe devagar ao redor  │
│  (30 segundos)             │
│                            │
│   [ GRAVAR ]  ← cobalt     │
└────────────────────────────┘
```

**Durante captura:**
```
┌────────────────────────────┐
│  🔴 00:12                  │
│                            │
│  [CÂMERA MOSTRA O CARRO]   │
│                            │
│  ← frente │ lateral esq →  │
│    (indicador suave do     │
│     ângulo esperado agora  │
│     baseado no tempo)      │
│                            │
│  💡 Mantenha o carro       │
│     centralizado           │
│                            │
│  [ PARAR AGORA ]           │
└────────────────────────────┘
```

**Pós-captura (preview):**
```
┌────────────────────────────┐
│  Prévia do vídeo:          │
│  [▶ player com thumbnails] │
│                            │
│  [ REFAZER ]  [ CONTINUAR ]│
└────────────────────────────┘
```

### 6.3 Tela 3 — Chassi

```
┌────────────────────────────┐
│  📸 Foto do chassi         │
│                            │
│  Onde fica em moto?        │
│  [ilustração destaca:      │
│   - COLUNA DO MOTOR        │
│   - ou PLACA ABAIXO DO     │
│     TANQUE]                │
│                            │
│  Tipo seu veículo:         │
│  ● Moto     ○ Carro        │
│                            │
│  (muda ilustração conforme │
│   seleção)                 │
│                            │
│  [ ABRIR CÂMERA ]          │
│                            │
│  💡 Precisa que o número   │
│     fique nítido e legível │
└────────────────────────────┘
```

**Durante captura do chassi:**
```
┌────────────────────────────┐
│  [CÂMERA]                  │
│                            │
│  Overlay: retângulo        │
│  destacando onde deve      │
│  centralizar o chassi      │
│                            │
│  OCR em tempo real:        │
│  "procurando chassi…"      │
│  → "CHASSI DETECTADO:      │
│     9C2PC410***"           │
│                            │
│  [ TIRAR FOTO ] ← auto se  │
│                   OCR OK   │
└────────────────────────────┘
```

### 6.4 Tela 4 — Hodômetro

```
┌────────────────────────────┐
│  📸 Foto do painel         │
│  mostrando Km              │
│                            │
│  [ilustração do painel     │
│   com destaque na área     │
│   do odômetro]             │
│                            │
│  💡 Enquadre o display     │
│     com os números nítidos │
│                            │
│  [ ABRIR CÂMERA ]          │
└────────────────────────────┘
```

**Durante:**
```
┌────────────────────────────┐
│  [CÂMERA]                  │
│                            │
│  Overlay: retângulo sobre  │
│  a área do odômetro        │
│                            │
│  OCR tempo real:           │
│  "Km detectado: 48.273"    │
│                            │
│  [ CONFIRMAR 48.273 Km ]   │
│  [ REFAZER ]               │
└────────────────────────────┘
```

### 6.5 Tela 5 — Processando

```
┌────────────────────────────┐
│  Analisando sua vistoria…  │
│                            │
│  [████████░░] 72%          │
│                            │
│  ✓ Vídeo recebido          │
│  ✓ Frontal: KYO-6I06       │
│  ✓ Lateral esquerda        │
│  ✓ Traseira: KYO-6I06      │
│  ○ Lateral direita…        │
│  ✓ Chassi: 9C2PC410***     │
│  ✓ Hodômetro: 48.273 Km    │
│                            │
│  Isso leva ~15 segundos    │
└────────────────────────────┘
```

### 6.6 Tela 6 — Resultado (sucesso)

```
┌────────────────────────────┐
│  ✓ Pronto!                 │
│                            │
│  Sua vistoria foi enviada  │
│  para análise.             │
│                            │
│  📱 Avisamos pelo WhatsApp │
│     em até 24h             │
│                            │
│  Resumo:                   │
│  • 4 ângulos capturados    │
│  • Placa confirmada        │
│  • Km registrado: 48.273   │
│                            │
│  [ FECHAR ]                │
└────────────────────────────┘
```

### 6.7 Tela 6 — Resultado (precisa refazer um ângulo)

```
┌────────────────────────────┐
│  ⚠ Quase lá!               │
│                            │
│  Precisamos de 1 foto      │
│  adicional:                │
│                            │
│  • Lateral direita         │
│    (sua lateral direita    │
│     ficou escura)          │
│                            │
│  [ TIRAR FOTO ]            │
└────────────────────────────┘
```

Reabre câmera com overlay guiando pro ângulo específico. Após captura, re-roda pipeline parcial (só pro ângulo refazer).

---

## 7. Dependências de implementação

### 7.1 Novas libs no monorepo

| Pacote | Papel |
|---|---|
| `@ffmpeg/ffmpeg` + `@ffmpeg/util` | Processamento de vídeo (opcional client-side, obrigatório server) |
| `tesseract.js` ou API vision | OCR do hodômetro + chassi (vision IA é mais robusta) |
| `@anthropic-ai/sdk` | Claude vision para classificação de ângulos |
| `mediarecorder-polyfill` | Suporte Safari iOS para gravação de vídeo |
| `@supabase/storage-js` | Upload resumable com chunks |

### 7.2 Supabase setup

- **Storage bucket** `inspections` (privado, policy por `jwt sub`)
- **Edge Function** `process-inspection-video` (Deno, FFmpeg via wasm ou API externa)
- **Realtime channel** `inspection:{id}` para notificação de progresso
- **DB tabelas** (seção 8)

### 7.3 Vision IA

Modelo: **Claude Haiku 4.5** por frame (barato, rápido) com fallback para **Claude Opus 4.7** quando confidence < 0.6.

Custos estimados:
- 30 frames × ~1500 tokens cada × Haiku = ~$0.001 por vistoria
- OCR extras × 3 chamadas × ~2000 tokens Haiku = ~$0.0005
- **Total: ~$0.0015 por vistoria em vision**

Alternativa gratuita: Tesseract.js para OCR (rodando no cliente/edge) — menos preciso.

---

## 8. Modelo de dados (atualização do schema HUB)

```ts
// Tabelas principais (extensão do que já tínhamos no SPEC)

Inspection {
  id              String   @id @default(uuid())
  tenantId        String
  memberId        String
  vehicleId       String
  templateId      String                     // referência à versão fixa
  templateVersion Int                        // snapshot
  type            InspectionType
  mode            InspectionMode             // REMOTE, PRESENCIAL, BOT_WA
  linkToken       String?  @unique           // JWT para modo REMOTE
  linkExpiresAt   DateTime?

  // Status workflow
  status          InspectionStatus
  startedAt       DateTime?                  // 1ª tela
  videoUploadedAt DateTime?
  processedAt     DateTime?
  submittedAt     DateTime?
  approvedAt      DateTime?
  rejectedAt      DateTime?
  rejectionReason String?

  // GPS da captura
  gpsLat          Float?
  gpsLng          Float?
  gpsAccuracyM    Float?

  // Device info (anti-fraude)
  deviceUA        String?
  deviceViewport  String?

  // Flags
  requiresManualReview Boolean @default(false)
  antiFraudMismatch    Boolean @default(false)

  // Relações
  captures        InspectionCapture[]
  consultantId    String?                    // quem fez (modo PRESENCIAL)
  approvedById    String?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

enum InspectionMode {
  REMOTE          // associado abre link WhatsApp
  PRESENCIAL      // consultor no celular dele
  BOT_WA          // bot WhatsApp conduziu
}

enum InspectionStatus {
  PENDING_LINK    // link enviado, não aberto ainda
  OPENED          // associado abriu
  IN_PROGRESS     // começou a gravar
  UPLOADED        // vídeo + extras enviados
  PROCESSING      // IA extraindo
  PROCESSED       // IA concluiu
  AWAITING_RETAKE // precisa refazer algum ângulo
  SUBMITTED       // associado confirmou
  APPROVED        // admin aprovou
  REJECTED        // admin rejeitou
  EXPIRED         // link expirou sem conclusão
  CANCELLED       // admin cancelou
}

InspectionCapture {
  id              String   @id @default(uuid())
  inspectionId    String
  angle           Angle?                     // null para extras
  extraType       ExtraCapture?              // null para ângulos
  source          CaptureSource
  mediaType       'IMAGE' | 'VIDEO'
  fileUrl         String                     // Supabase Storage
  fileHash        String                     // SHA-256
  width           Int
  height          Int
  orientation     'landscape' | 'portrait'
  qualityScore    Float?                     // IA pontuou
  aiConfidence    Float?                     // confidence do ângulo
  frameTimestampMs Int?                      // offset no vídeo original
  gpsLat          Float?
  gpsLng          Float?
  capturedAt      DateTime
  acceptedByAdmin Boolean?

  // OCR extraído
  ocrPlate        String?                    // frente/trás
  ocrOdometer     Int?                       // Km
  ocrChassis      String?                    // VIN 17 chars
  ocrRawText      String?                    // texto bruto
}

enum CaptureSource {
  VIDEO_EXTRACTED  // tirado do vídeo 360°
  PHOTO_EXTRA      // foto separada (chassi, Km, CRLV)
  RETAKE           // refazer de um ângulo
  BOT_WA           // vindo pelo bot
}

InspectionTemplate {
  // ver seção 4.1 acima
  id              String   @id @default(uuid())
  tenantId        String
  type            InspectionType
  version         Int                        // auto-incrementa ao editar
  active          Boolean  @default(true)

  usesVideo               Boolean
  videoMinSeconds         Int?
  videoMaxSeconds         Int?
  requiredVideoAngles     Angle[]
  optionalVideoAngles     Angle[]
  requiredExtraCaptures   ExtraCapture[]
  optionalExtraCaptures   ExtraCapture[]

  ocrPlateFrom            Angle[]
  ocrOdometerFromExtra    Boolean  @default(false)
  ocrChassisFromExtra     Boolean  @default(false)

  gpsRequired             Boolean  @default(true)
  gpsAccuracyMaxMeters    Int      @default(500)
  landscapeOnly           Boolean  @default(false)
  flashAllowed            Boolean  @default(true)
  signatureRequired       Boolean  @default(false)

  createdById             String
  createdAt               DateTime @default(now())
  deprecatedAt            DateTime?
}

@@unique([tenantId, type, version])

InspectionDamage {
  id              String   @id @default(uuid())
  inspectionId    String
  description     String
  position        String?                    // "lateral direita, para-choque"
  severity        'LIGHT' | 'MEDIUM' | 'HEAVY'
  photoUrl        String
  createdAt       DateTime @default(now())
}

InspectionAccessory {
  id              String   @id @default(uuid())
  inspectionId    String
  itemId          String                     // referência ao catálogo
  checked         Boolean
}
```

---

## 9. Métricas de sucesso (KPIs)

| KPI | Meta | Como medir |
|---|---|---|
| Tempo médio total | < 120s | `submittedAt - startedAt` |
| Taxa de abandono | < 10% | `(OPENED - SUBMITTED) / OPENED` |
| Taxa de refazer um ângulo | < 15% | `AWAITING_RETAKE / UPLOADED` |
| Taxa de aprovação admin sem edição | > 85% | `APPROVED / SUBMITTED` sem flag |
| Taxa de match placa frente == trás | > 95% | `antiFraudMismatch = false` |
| Custo IA por vistoria | < $0.005 | log Anthropic |
| Tempo processamento IA | P95 < 30s | `processedAt - videoUploadedAt` |

Dashboards no `apps/admin` + Supabase Realtime.

---

## 10. Vantagens vs SIVIS

| Dimensão | SIVIS web app | HUB vídeo 360° |
|---|---|---|
| Tempo total associado | 10-15 min | 90-120s (**6-10x mais rápido**) |
| Fotos tiradas pelo associado | 24 slots | 2 fotos (chassi + Km) + 1 vídeo |
| Modo paisagem obrigatório | sim | não (aceita vertical) |
| Instruções antes de começar | 5 blocos | 1 linha |
| Digitação de placa/Km/chassi | manual | OCR automático |
| Feedback de qualidade | pós-submit | tempo real |
| GPS por clique no mapa | sim | automático nativo |
| Guia visual pro chassi | textual ("procure") | ilustração + overlay |
| Service worker / offline | não | sim (fase 2) |
| Modo consultor presencial | não | sim |
| Fallback por abandono | não | bot WhatsApp (fase 2) |
| Anti-fraude placa frente×trás | manual | automático |
| Chain of custody | file-based | hash SHA-256 + GPS assinado |
| Checklist configurável | fixo | por tipo + versionado |

---

## 11. Roadmap de implementação (dentro do roadmap master)

Encaixa na **Fase 4 — Vistoria** do `ROADMAP.md`, mas simplifica drasticamente:

| Sub-fase | Dur. | Entrega |
|---|---|---|
| 4.1 — PWA skeleton + MediaRecorder | 3d | Grava vídeo + preview no celular |
| 4.2 — Upload resumable Supabase | 2d | Upload chunk + progress |
| 4.3 — Edge Function + FFmpeg wasm | 3d | Extrai frames server-side |
| 4.4 — Vision IA classificação ângulos | 3d | Picks 4-6 frames corretos |
| 4.5 — OCR placa/Km/chassi | 2d | Dados extraídos auto |
| 4.6 — UX refinamento (overlay, autocapture) | 3d | Polish |
| 4.7 — Modo consultor presencial | 2d | Fluxo PRESENCIAL + assinatura |
| 4.8 — Admin aprovação + flags | 2d | `apps/admin` tela de aprovação |
| 4.9 — Templates configuráveis | 3d | Admin cria templates por tipo |
| **Total Fase 4** | **~5 semanas** | fluxo end-to-end em produção |

Mesma duração do roadmap original — mas **entrega superior** (vídeo + IA vs 24 slots manuais).

---

## 12. Decisões em aberto

1. **FFmpeg no cliente ou servidor?**
   - Cliente (wasm): economiza compute servidor, mas pesa ~30 MB download inicial
   - Servidor (Edge Function): experiência mais leve, custo acumula com volume
   - **Recomendação:** servidor. Com Supabase Edge Function + FFmpeg API externa (ex: Shotstack, Mux). Validar na fase 4.3.

2. **Vision IA: Claude vs modelos abertos (LLaVA)?**
   - Claude: $0.005/vistoria, qualidade alta
   - LLaVA local: $0 marginal, mas infra, qualidade menor
   - **Recomendação:** Claude Haiku 4.5. Volume LOOG não justifica infra própria.

3. **Overlay silhueta real do carro ou genérico?**
   - Real (baseado no modelo/placa): mais caro de ilustrar
   - Genérico (silhueta de carro padrão): basta para alinhamento
   - **Recomendação:** genérico. Economiza 100 horas de design.

4. **Permitir upload de vídeo da galeria em vez de gravar?**
   - Sim: associado tira vídeo em outra hora e envia
   - Não: força captura ao vivo (anti-fraude mais forte)
   - **Recomendação:** não no MVP (anti-fraude). Reavaliar fase 7.

5. **Compressão de vídeo cliente antes de upload?**
   - Sim: reduz banda, mas pode degradar OCR
   - Não: qualidade original, upload mais pesado
   - **Recomendação:** compressão leve (CRF 28 H.264) na gravação, mantém OCR legível.

---

## 13. Próximas ações

1. **Validar com Halisson/Paulo** o checklist (seção 4.2) — especialmente INCLUSAO_VIDROS e EVENTO_ABERTURA que requerem fotos adicionais específicas
2. **Prototype em 1 semana** (fase 4.1 + 4.2) — PWA skeleton + MediaRecorder → testar com 2-3 associados
3. **Benchmark anti-fraude** — comparar vídeo 30s com fluxo SIVIS atual contra tentativas conhecidas de fraude (relatório da LOOG)
4. **Escolher provider FFmpeg server-side** (Mux × Shotstack × self-hosted)
5. **Design do overlay** (silhueta genérica) com designer da LOOG
