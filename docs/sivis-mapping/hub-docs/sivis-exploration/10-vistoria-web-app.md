# SIVIS — App Web de Vistoria (vistoria.sivisweb.com.br)

> O "APP Visto" da SIVIS não é um app nativo — é uma **PWA React mobile-only** acessível via link.
> Capturado em `https://vistoria.sivisweb.com.br/324/028` · 2026-10-06
> Vistoria real analisada: #324 · Associado CAIO HENRIQUE CAMARINHO NOGUEIRA · Placa KYO-6I06 · PRÉVIA CARRO

---

## 1. Arquitetura descoberta

| Item | Valor |
|---|---|
| **Domínio** | `vistoria.sivisweb.com.br` (subdomínio dedicado) |
| **URL pattern** | `/{inspection_id}/{store_id}` → ex: `/324/028` |
| **Stack cliente** | React SPA (webpack build) · Material UI · Leaflet (mapa) · OpenStreetMap (tiles) |
| **Bundle único** | `/static/js/main.{hash}.js` (~574 KB) + `/static/css/main.{hash}.css` |
| **Router SPA** | `react-router-dom` com rota única `/:id/:contrato` + fallback `*` |
| **Build year** | 2023 (footer "2023 © SIVIS TECNOLOGIA") |
| **Mobile-only** | Detecta viewport desktop e bloqueia: "Utilize um dispositivo móvel para prosseguir com a vistoria." |
| **Co-branding** | Logo LOOG + "LOOG SOLUCOES VEICULARES" no header (branding por tenant) |
| **Theme color** | `#000000` (meta tag) — herda identidade LOOG All Black |
| **Description meta** | "Faça suas vistorias de forma rápida e remota!" |
| **Service worker** | Não ativado nessa página (sem PWA offline real) |
| **Manifest** | — (não detectado) |

---

## 2. API backend

**Endpoint único:** `POST https://sivisweb.com.br/Modulos/Seguro/Api/AmdApi.php`

**Formato:** JSON body com `functionPage` + parâmetros contextuais:

```json
{
  "functionPage": "<action>",
  "id": 324,
  "contrato": "028",
  ...dados específicos da action
}
```

**Autenticação:** nenhum header de Authorization. Validação implícita no backend por par `(id, contrato)`.

**Backend stack (vazado em erro):**
- **Microsoft SQL Server** via **ODBC**
- Usuário DB: `erp`
- Erro de credencial escapa para o response body (vulnerabilidade de informação)

### 2.1 Actions descobertas

| Action | Propósito | Dispara quando |
|---|---|---|
| `config` | Carrega configuração da vistoria (tipos de foto, labels, regras, obrigatoriedades) | Entrada no app |
| `vistoriaList` | Lista slots de foto já capturados | Entrada + após cada save |
| `avariasList` | Lista avarias já cadastradas | Aba Avarias |
| `acessoriosList` | Lista acessórios já marcados | Aba Acessórios |
| `vistoriaSave` | Salva uma foto (upload) | Após captura de foto |
| `observacaoSave` | Salva observação textual | Submissão de observação |
| `avariasSave` | Salva avaria (descrição + foto) | Submissão de avaria |
| `acessoriosSave` | Salva marcação de acessório | Toggle de checkbox |

> As 4 operações de **list** são carregadas em **paralelo** no mount do app (padrão Suspense):
> ```js
> // bi(e) retorna { vistoria, config, avaria, acessorios } (promise de cada)
> const t = fetch(url, {method:'POST', body: JSON.stringify({...e, functionPage:'vistoriaList'})}).then(r=>r.json());
> const n = fetch(url, {method:'POST', body: JSON.stringify({...e, functionPage:'config'})}).then(r=>r.json());
> const r = fetch(url, {method:'POST', body: JSON.stringify({...e, functionPage:'avariasList'})}).then(r=>r.json());
> const i = fetch(url, {method:'POST', body: JSON.stringify({...e, functionPage:'acessoriosList'})}).then(r=>r.json());
> ```

---

## 3. Fluxo de vistoria descoberto

Baseado em UI, strings do bundle e endpoints:

```
1. Associado recebe link via WhatsApp (enviado pelo Pendencia/dashboard do SIVIS)
   https://vistoria.sivisweb.com.br/{inspection_id}/{store_id}
   ↓
2. App detecta se é mobile; se desktop → bloqueia
   ↓
3. Carrega paralelo: config + vistoriaList + avariasList + acessoriosList
   ↓
4. Header mostra: Logo LOOG + "LOOG SOLUCOES VEICULARES"
   + Vistoria: PRÉVIA - CARRO
   + Associado: {nome}
   + Placa: {placa}
   ↓
5. Tela 1 — Localização (Leaflet + OSM)
   - Mapa interativo
   - Pede permissão GPS do navegador
   - "Clique no mapa para adicionar sua localização, em seguida clique em PRÓXIMA"
   - Instruções: GPS ligado + permitir localização
   + "LEIA ATENTAMENTE ANTES DE INICIAR SUA VISTORIA"
   + Checklist 3 pontos:
     ✓ Fotos e vídeos em modo paisagem
     ✓ Saber onde está o CHASSI
     ✓ Local iluminado, não garagem/apertado, sem FLASH
   ↓
6. Tela 2+ — Captura de fotos (slots do config)
   - Cada slot tem label (ex: "Dianteira", "Lateral Esquerda", "CHASSI", etc.)
   - Validação: "Imagem em modo retrato." → rejeita se não paisagem
   - "foto obrigatória" (quando pulada e requerida)
   - Suporta foto E vídeo
   - "Seu browser não suporta vídeos" (fallback)
   - no-image.png como placeholder
   - Botões anterior / próximo (assets dedicados)
   - Save: vistoriaSave (upload file + metadados)
   ↓
7. Tela N — Avarias (opcional)
   - avaria.png como ícone
   - Form: descrição + foto do dano
   - Validação: "Preencha o campo de descrição!"
   - Save: avariasSave
   ↓
8. Tela N+1 — Acessórios
   - Checkbox list dos equipamentos existentes
   - Save: acessoriosSave (toggle por item)
   ↓
9. Tela final — Confirmação / Envio
   - Observação opcional
   - Save: observacaoSave + marca como concluída
```

### Strings UI em pt-BR confirmadas (do bundle)

- "Utilize um dispositivo móvel para prosseguir com a vistoria."
- "Leia atentamente antes de iniciar sua vistoria"
- "Fotos e vídeos devem ser feitos em modo paisagem."
- "Procure saber onde está localizado o número do CHASSI do seu veículo."
- "Cetifique-se que o GPS do seu SmartPhone está ligado." *(typo intencional — "Certifique-se")*
- "Clique no mapa para adicionar sua localização, em seguida clique em PRÓXIMA"
- "Imagem em modo retrato."
- "Preencha o campo de descrição!"
- "Seu browser não suporta vídeos"
- "Iniciar vistoria"

### Assets de UI (`static/media/*.png`)

- `proximo.{hash}.png` — botão próximo
- `anterior.{hash}.png` — botão anterior
- `voltar.{hash}.png` — botão voltar
- `avaria.{hash}.png` — ícone avaria
- `no-image.{hash}.png` — placeholder foto vazia
- `ICONE.{hash}` — ícone genérico
- `maps.{hash}` — ícone de mapa (visto na tela inicial)

---

## 4. Insights estratégicos para o LOOG HUB

### 4.1 Confirmação: vistoria é PWA mobile remota

Já estava hipotetizado em `docs/01-sivis-inventory.md` e no SPEC. **Confirmado agora com evidência direta.** HUB `apps/vistoria`:

- Deploy independente (subdomínio próprio: `vistoria.loog.app.br`)
- Mobile-only (bloqueia desktop com mensagem)
- Deep link enviado via WhatsApp do admin / do consultor
- Rota única parametrizada: `/vistoria/[id]` ou `/[tenant]/vistoria/[id]`

### 4.2 Config dinâmico driveada pelo backend

A API `config` entrega os slots de foto por tipo de vistoria. Isso significa:

- SIVIS gerencia a configuração por: tipo de vistoria (PRÉVIA_CARRO, PRÉVIA_MOTO, FINAL, etc.) + regras por loja
- O HUB precisa de:
  - `InspectionTemplate` versionado no DB
  - `InspectionSlot` por template (slot + label + obrigatório + tipo foto/video)
  - UI gerada a partir do template

### 4.3 Diferenciais que o HUB entrega sobre essa vistoria

| Dimensão | SIVIS vistoria | HUB `apps/vistoria` |
|---|---|---|
| Service Worker | Não ativo | PWA offline-first (fila sync) |
| GPS watermark | Metadata EXIF (não mencionado) | Watermark visível + hash assinado (chain of custody) |
| Autenticação | Par `(id, contrato)` no body — enumerável | JWT token com escopo e expiração |
| Backend | SQL Server legacy com credencial expondo em erro | Postgres via Prisma com error boundaries |
| Modo paisagem | Validação cliente ("Imagem em modo retrato") | Validação cliente + servidor (reject + reupload) |
| Assinatura | Não vista | Canvas de assinatura obrigatório |
| Chassi | Instrução textual | OCR do número do chassi (vision IA) |
| Flash guard | Instrução textual | Detecção automática via brightness |
| Multi-tenant | Path-based (`contrato=028`) | subdomain + JWT tenant claim |
| Theming | Logo + "LOOG" no header | Design system LOOG completo |
| Timeout | Não vista | Expiração do link após N dias |
| Idempotência | ? | Idempotency key por slot |
| Audit log | ? | Log imutável (quem, quando, de onde) |

### 4.4 Modelo de dados ampliado

```ts
interface InspectionTemplate {
  id: string;
  type: InspectionType;              // PREVIA_CARRO, PREVIA_MOTO, ...
  version: number;                   // snapshot
  requiredSlots: InspectionSlot[];
  optionalSlots: InspectionSlot[];
  acceptsAvarias: boolean;
  acceptsAcessorios: boolean;
  acceptsVideo: boolean;
  acceptsObservacao: boolean;
  landscape: boolean;                // força modo paisagem
  requireChassiVisible: boolean;
  flashAllowed: boolean;
  gpsRequired: boolean;
  gpsAccuracyMeters?: number;        // tolerância
}

interface InspectionSlot {
  id: string;
  templateId: string;
  position: number;                  // ordem
  label: string;                     // "Dianteira", "CHASSI"
  mediaType: 'photo' | 'video' | 'photo_or_video';
  required: boolean;
  minDurationSeconds?: number;       // só video
  maxDurationSeconds?: number;
  minResolution?: { width: number; height: number };
  helpText?: string;
  helpImageUrl?: string;             // overlay de referência
}

interface InspectionCapture {
  id: string;
  inspectionId: string;
  slotId: string;
  fileUrl: string;
  fileHash: string;                  // SHA-256 do arquivo bruto
  mediaType: 'photo' | 'video';
  width: number;
  height: number;
  orientation: 'landscape' | 'portrait';
  gpsLat?: number;
  gpsLng?: number;
  gpsAccuracyMeters?: number;
  capturedAt: Date;
  deviceInfo?: { userAgent: string; viewportSize: string };
  isAccepted: boolean;               // validação servidor
  rejectReason?: string;
}

interface InspectionDamage {       // avaria
  id: string;
  inspectionId: string;
  description: string;
  photoUrl: string;
  position?: string;                 // "Lateral Direita", "Para-choque"
  severity: 'light' | 'medium' | 'heavy';
  createdAt: Date;
}

interface InspectionAccessory {    // acessório marcado
  id: string;
  inspectionId: string;
  itemId: string;                    // referência ao catálogo
  checked: boolean;
}
```

---

## 5. Vulnerabilidades notadas (para NÃO replicar no HUB)

1. **SQL error vaza:** `[Microsoft][ODBC SQL Server Driver][SQL Server]Login failed for user 'erp'.` — nunca retornar erro de infra na resposta HTTP.
2. **IDs sequenciais previsíveis** (`324`) — enumeração de vistorias de outros associados possível se validação do `contrato` for frouxa. HUB usa UUID.
3. **Sem rate limit visível** no endpoint único polimórfico.
4. **Sem CSRF token** (pode ser aceitável se autenticação for Bearer, mas aqui não há auth evidente).
5. **Build de 2023** — bundle não atualizado há 2+ anos; sem fixes de segurança do React/MUI.
6. **Config dinâmica sem versionamento aparente** — se SIVIS mudar o template, vistorias antigas podem ficar inconsistentes com histórico.

---

## 6. Integração HUB (quando substituir)

### 6.1 Durante transição (fase 4-6 do roadmap)

- `enviarVistoriaWhatsapp` do pendencia.service.js (portal) dispara link SIVIS
- HUB intercepta esse momento: substitui o link enviado por `vistoria.loog.app.br/{uuid}`
- Vistorias finalizadas sincronizam de volta ao Pendência no SIVIS via adapter (dual-write) OU param de ir ao SIVIS após ponto de corte

### 6.2 Pós-migração

- HUB emite link `apps/vistoria` nativo
- Vistorias ficam no HUB (Supabase)
- Admin aprova no `apps/admin` → vira InspectionStatus = APPROVED
- Associado é notificado via WhatsApp (template oficial)

### 6.3 Migração de vistorias antigas

Fotos vivem em `/Pessoas/028/Vistorias/{id}/{file}` no servidor SIVIS.
Script `scripts/migrate-sivis-inspections.ts`:

1. Enumera vistorias no SIVIS admin (via rota `Vistorias_server_processing.php`)
2. Para cada vistoria:
   - Download das fotos
   - Upload para Supabase Storage `inspections/{tenantId}/{uuid}/`
   - Insert em `Inspection` + `InspectionCapture`
3. Validação: contagem + hash

---

## 7. Pendente

- [ ] Shape JSON real das 4 operações `*List` (precisa interceptar com GPS permissão ou simular)
- [ ] Shape da action `config` — catálogo completo de slots por tipo de vistoria
- [ ] Formato do `vistoriaSave` POST (multipart? JSON com base64? FormData?)
- [ ] Catálogo real de acessórios (ckb_31..ckb_37 vistos no ERP) + mapeamento para labels
- [ ] Fluxo de assinatura (se existir — bundle não mencionou canvas de assinatura)
- [ ] Fluxo de finalização / conclusão (botão "Enviar" no final?)
- [ ] Comportamento quando link expira / inspection já finalizada
- [ ] Comportamento quando link é aberto 2x (idempotência)
