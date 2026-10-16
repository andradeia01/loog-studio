# Design System — LOOG HUB

> Herda e expande as decisões do doc 15 (`HALISSON - LOOG/15-loog-brand-visual-spec.md`) e do protótipo em `/APP Loog/`. Aplicado via Tailwind CSS tokens + shadcn/ui skinnado.

---

## 1. Princípios

1. **All Black editorial.** Preto `#000000` como 90% da tela. Cromo nos textos. Cobalto `#0053FF` como acento único por tela.
2. **Infinito como arquitetura.** Logo é o `∞ LOOG` (chrome + cobalto). Nunca distorcido.
3. **Mobile-first.** Portal e vistoria são mobile primeiro. Admin e consultor são desktop primeiro mas 100% responsivos.
4. **Zero emoji colorido.** Ícones monocromáticos cromados ou cobalto. Semáforo verde/amarelo/vermelho só em estados técnicos (status de boleto): usar `chrome` positivo, `cobalt` atenção, `graphite` negativo.
5. **Matemática viva.** Todo número importante é o número maior da tela (ver `NumberHero`).

---

## 2. Tokens (Tailwind config)

```ts
// packages/ui/tailwind.tokens.ts
export const colors = {
  black:       '#000000',
  graphite:    '#17181F',    // panel LOOG (herda do /APP Loog/)
  surface:     '#1F222C',    // cards
  chromeHi:    '#E8E8EA',
  chromeMid:   '#9CA0A6',
  chromeLo:    '#4A4E56',
  cobalt:      '#0053FF',    // azul oficial LOOG (herdado /APP Loog/)
  cobaltGlow:  'rgba(0,83,255,0.35)',
  white:       '#F5F5F7',
  // semantic (status)
  success:     '#E8E8EA',    // chrome (não verde)
  attention:   '#0053FF',    // cobalt (não amarelo)
  danger:      '#4A4E56',    // graphite escuro (não vermelho corporativo)
  // só para boleto / status técnico:
  statusPaid:    '#2DBF78',  // verde discreto
  statusPending: '#E8A33D',  // âmbar discreto
  statusLate:    '#D64545',  // vermelho discreto
};

export const fonts = {
  display: ['Aeonik Pro', 'Eurostile Extended', 'ui-sans-serif'],
  mono:    ['JetBrains Mono', 'ui-monospace'],
  body:    ['Inter Tight', 'Inter', 'system-ui'],
  // compat com /APP Loog/:
  header:  ['Manrope', 'ui-sans-serif'],
  text:    ['Inter', 'system-ui'],
};

export const space = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128];
export const radius = { sm: 8, md: 12, lg: 20, pill: 999 };

export const motion = {
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  duration: { instant: 120, base: 240, slow: 420, cine: 800 },
};
```

---

## 3. Mapeamento shadcn → LOOG

Toda UI nasce de **shadcn/ui** copy-paste. Instale uma vez, reskin em `packages/ui/components/*`.

| shadcn | Variante LOOG | Regra visual |
|---|---|---|
| `<Button variant="default">` | **Cobalt CTA** | bg `cobalt`, hover: highlight sweep 240ms |
| `<Button variant="outline">` | **Chrome Button** | border chrome-lo, hover: gradient chrome |
| `<Button variant="ghost">` | **Ghost** | chrome-mid → chrome-hi no hover |
| `<Card>` | **Elevation 1** | bg `surface`, border split (chrome-lo top / #000 bottom) |
| `<Sheet>` | **Bottom sheet / side panel** | drag handle chrome, backdrop blur 20px |
| `<Dialog>` | **Modal cinemático** | entrada 420ms, easing LOOG |
| `<Badge>` | **HUD chip** | mono font, chrome ou cobalto |
| `<Input>` | **Metal escovado** | border chrome-lo, focus: outer glow cobalto |
| `<Tabs>` | **Bottom nav / segmentado** | underline cobalto 2px na ativa |
| `<Progress>` | **Barra HUD** | trilha chrome-lo, fill cobalto |
| `<Toast>` (Sonner) | **HUD Notification** | mono font, slide-in chrome |
| `<Skeleton>` | **Shimmer cromado** | gradient sweep chrome-lo → chrome-mid |

### Componentes 100% custom (não vêm do shadcn)

- `<InfinityLogo />` — SVG oficial LOOG (branco+cobalto). ViewBox `0 0 725.17 124.52`. 97×17 em app headers.
- `<NumberHero />` — Número gigante com cifrão mono à esquerda. Hero: 56 mobile / 96 desktop.
- `<VehicleIcon type="car|truck|motorcycle" />` — Lucide base (`car`, `truck`, `motorbike`).
- `<InvoiceStatusBadge status="paid|pending|late" />` — único lugar com semáforo.
- `<QrPix />` — QR + copia-e-cola do Pix hibrido.
- `<SignaturePad />` — Canvas para vistoria.

---

## 4. Layout canônico — Portal (mobile)

Herda do `/APP Loog/`:

- **Barra de status + cabeçalho:** pretos `#000000`.
- **Painel inferior grafite** (`#17181F`) com cantos superiores arredondados.
- **Cards:** superfície `#1F222C`.
- **Logo:** 97×17 no cabeçalho.
- **Card flutuante:** 50% preto / 50% grafite (fórmula: `.sheet { padding-top: 38px }` + `.wrap { margin-top: -(38 + altura/2) }`).

### Telas (herdadas)

| Tela | Status |
|---|---|
| Login | Portado de `/APP Loog/loog-app-login.html` |
| Avaliação atendimento (1º acesso) | Portado |
| Home | Portado — saudação, chip cota ativa, dropdown veículo, assistência 24h, grid 4 (meus veículos, pagamentos, meus dados, documentos), próxima fatura, sino, drawer |
| Meus Veículos | Portado |
| Meus Pagamentos | Portado — Pix, 2ª via boleto, cartão |
| Meus Dados | Portado — CPF/email bloqueados |
| Documentos | Portado — regulamento + apólice por veículo |
| Notificações | Portado — agrupadas por data |
| Modais (Sucesso/Erro/Aviso/Confirmação) | Portado |

**Novas telas no HUB (fase 5):**

- Abrir sinistro (foto + B.O. + descrição + GPS)
- Acionamento 24h (tipo + GPS + status em tempo real)
- Rede de atendimento (mapa + lista)
- Vantagens e benefícios
- Avaliação pós-atendimento (NPS)

---

## 5. Layout canônico — Admin (desktop)

- **Max width:** 1440px centralizado
- **Grid:** 12 colunas, gutter 24px
- **Sidebar:** 240px esquerda, chrome-lo border, navegação por módulo (Associados, Veículos, Financeiro, Cobrança, Vistorias, Sinistros, Assistência, Rede, Fornecedores, Eventos, Comunicação, Config)
- **Top bar:** 64px, breadcrumb + usuário + notificações
- **Content:** cards sobre fundo preto, tabela densa com paginação server-side
- **Motion:** generoso em transições de página (420ms), discreto em ações (240ms)

---

## 6. Layout canônico — Consultor (desktop)

- **Hero principal:** NumberHero com valor total vendido no mês
- **Grid 3:** pipeline de leads (kanban), nova cotação (CTA), extrato comissão
- **Novo cotação (modal full):** wizard placa → FIPE → cliente → gerar (3 steps)

---

## 7. Layout canônico — Vistoria (mobile PWA)

- **Fullscreen checklist:** passo a passo (foto frontal, traseira, lateral, chassi, hodômetro, interior)
- **Captura de foto:** câmera nativa + watermark GPS + timestamp
- **Assinatura:** canvas fullscreen
- **Status offline:** barra superior indica "offline — X fotos na fila"
- **Sync automático** quando volta online

---

## 8. Acessibilidade

- **WCAG AA** nos 4 apps.
- Contraste chrome `#E8E8EA` sobre preto `#000000` = 13.98 (AAA).
- Contraste cobalto `#0053FF` sobre preto = 3.95 (AA large). Nunca cobalto sobre preto em texto pequeno — usa chrome.
- Haptic feedback no mobile em botões críticos (vibrate 10ms).
- Voice-over labels em todo botão/input.
- Zoom até 200% sem quebrar layout.
- Teclado: navegável por Tab + Enter + Esc.

---

## 9. Setup

```bash
# Em packages/ui:
pnpm add -D tailwindcss postcss autoprefixer
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card sheet dialog form input badge skeleton toast tabs progress

# Em cada app:
# tailwind.config.ts importa de packages/ui/tailwind.tokens.ts
```

Google Fonts (via `<link>` ou `next/font`):

- Manrope 500/600/700 (headers)
- Inter 400/500/600 (body)
- JetBrains Mono 400/600 (mono)

---

## 10. Reutilização entre apps

**Regra:** se um componente aparece em 2+ apps, ele vive em `packages/ui/components/`. Senão, fica local no app.

Exemplos de **compartilhados**:

- `<InfinityLogo />`, `<VehicleIcon />`, `<InvoiceStatusBadge />`
- `<Button>`, `<Card>`, `<Input>` (shadcn skinnados)
- `<NumberHero />`, `<Pagination>`, `<DataTable>`
- `<InvoiceCard />` (portal + admin)
- `<SignaturePad />` (vistoria + futuro aceite digital)

Exemplos **locais**:

- `<KanbanBoard>` (só consultor)
- `<CoverageEditor>` (só admin)
- `<InspectionChecklist>` (só vistoria)

---

## 11. Validação

Antes de qualquer tela ir pra produção:

1. **5 perguntas do checklist do doc 15** respondidas SIM
2. **WCAG AA** contrast validado (axe-core)
3. **Fonte oficial** (não substituir por fallback silencioso)
4. **∞ LOOG** no header (nunca sem logo)
5. **Preto 90%** da tela (nunca mais que 10% de outra cor fora do cobalto)
