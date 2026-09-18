# LOOG Studio

Gerador de artes personalizadas para os **consultores da LOOG Proteção Veicular**.

O consultor abre uma página, coloca sua foto, informa nome/telefone/@ e gera
um post pronto — sem Canva, sem Photoshop. As artes originais permanecem
intactas: o sistema apenas insere as camadas variáveis (foto, textos) por cima
ou entre elas.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS** (tema dark automotivo premium)
- **Sharp** para composição server-side em alta resolução
- **react-easy-crop** para o enquadramento no cliente
- **Zod** para validação
- **Supabase** (opcional) para persistência em nuvem

## Como iniciar

```bash
npm install
npm run seed:templates   # gera 3 backgrounds/thumbnails de exemplo
npm run dev              # http://localhost:3005
```

Rotas:

- `/` — home
- `/studio` — área do consultor (fluxo completo)
- `/admin` — listagem de templates
- `/admin/new` — criar template (editor visual)
- `/admin/[slug]` — editar template

## Estrutura

```
LOOG-STUDIO/
├── public/
│   └── templates/                  ← artes ficam aqui
│       ├── template-001/
│       │   ├── background.png      ← ARTE ORIGINAL DA LOOG
│       │   ├── foreground.png      ← overlay opcional (fica NA FRENTE da foto)
│       │   ├── thumbnail.jpg       ← miniatura para a galeria
│       │   └── config.json         ← posições e estilos
│       ├── template-002/...
│       └── template-003/...
├── scripts/
│   └── generate-placeholders.ts    ← gera artes-placeholder para dev
└── src/
    ├── app/
    │   ├── page.tsx                ← landing
    │   ├── studio/page.tsx         ← área do consultor
    │   ├── admin/                  ← área do gestor
    │   └── api/
    │       ├── generate/route.ts   ← composição via Sharp
    │       ├── templates/          ← CRUD dos templates
    │       └── upload/route.ts     ← upload de assets
    ├── components/
    │   ├── studio/                 ← ConsultantForm, PhotoUploader, Gallery, Preview
    │   ├── admin/                  ← TemplateEditor, DraggableBox
    │   └── ui/
    └── lib/
        ├── types.ts                ← schemas Zod (Template, Layer, Consultant)
        ├── templates.ts            ← store filesystem
        ├── storage.ts              ← localStorage do consultor
        ├── supabase.ts             ← opcional
        ├── auth.ts                 ← ADMIN_TOKEN guard
        ├── utils.ts
        └── image/
            ├── generate.ts         ← pipeline Sharp
            └── text.ts             ← SVG dinâmico com autofit
```

## Como trocar por suas artes reais

Para cada template:

1. Substitua o `background.png` pela **sua arte original da LOOG** (dimensão exata).
2. Se sua arte tem elementos gráficos que precisam ficar **na frente da foto do
   consultor** (ex.: brilho, faixa), exporte-os separadamente e coloque como
   `foreground.png` no mesmo diretório — depois adicione uma camada `image` no
   `config.json` acima da `consultantPhoto`.
3. Ajuste `thumbnail.jpg` (uma versão comprimida para a galeria).
4. Edite `config.json` (ou use o editor visual em `/admin/[slug]`) para
   posicionar foto e textos.

Você também pode subir tudo direto pela interface: **/admin → Novo template**.

## Como criar um novo template pelo admin

1. Acesse `/admin/new`
2. Dê um nome, escolha o formato (Feed 1:1, Feed 4:5 ou Story 9:16).
3. Faça upload da arte de fundo em **Assets → Arte de fundo**.
4. Clique em **+ Foto** para adicionar a área da foto do consultor — arraste
   sobre a arte, redimensione pelas alças.
5. Clique em **+ Texto**, escolha o campo (Nome, Telefone, Instagram, Cidade)
   e ajuste fonte/tamanho/cor no painel direito.
6. Salve. Ele aparece imediatamente na galeria do `/studio`.
7. Use **Testar template** para gerar uma prévia com dados fictícios.

### Alterar posição de foto/nome depois

Duas opções:

- **Pelo admin visual**: arraste a caixa sobre a arte no editor.
- **Editando o JSON**: em `public/templates/<slug>/config.json`, mude
  `x`, `y`, `width`, `height` — os valores estão em **pixels reais do template**
  (não do preview). Ex.: para uma arte 1080×1350, `x: 60, y: 1110` posiciona o
  texto a 60px da esquerda e 1110px do topo.

## Camadas (order matters)

O array `layers` é renderizado **em ordem** — do fundo para o topo. Exemplo:

```json
"layers": [
  { "type": "background", "src": "background.png" },
  { "type": "consultantPhoto", "x": 620, "y": 480, "width": 380, "height": 650 },
  { "type": "image", "src": "foreground.png", "x": 0, "y": 0, "width": 1080, "height": 1350 },
  { "type": "text", "source": "consultantName", "x": 60, "y": 1200, "width": 700, "style": {...} }
]
```

Aqui a foto do consultor fica **entre** o background e o overlay gráfico —
os efeitos do foreground passam por cima dela. Depois vêm os textos.

## Variáveis de ambiente

Copie `.env.example` para `.env.local`. Todas são **opcionais**:

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave admin — **jamais expor no cliente** |
| `ADMIN_TOKEN` | Se definido, `/admin` exige `x-admin-token` no header |

Sem Supabase, o sistema usa filesystem + localStorage. Suficiente para o MVP.

## Rate limit

`/api/generate` tem rate limit em memória: 20 gerações por IP por minuto.
Ao mover para produção com múltiplas instâncias, troque por Redis/Upstash.

## Segurança

- Uploads validados: só `image/png|jpeg|webp`, máx. 15 MB, sanitizados via Sharp.
- Foto do consultor: máx. 10 MB no cliente, recortada antes de enviar.
- Textos: escapados como XML antes de irem para o SVG.
- Endpoints admin protegidos por `ADMIN_TOKEN` opcional.

## Pendências que exigem credenciais externas

1. **Supabase** — se quiser migrar de filesystem/localStorage para nuvem
   (perfis, templates, histórico de artes geradas). Schema sugerido em
   `src/lib/supabase.ts`.
2. **WhatsApp Business API** — mencionada no brief como futura; hoje o botão
   de compartilhar usa a Web Share API nativa do mobile.

## O que **não** foi feito neste MVP (e por quê)

- **Login por telefone/WhatsApp**: intencionalmente adiado — o brief pede que a
  V1 rode sem login. Estrutura preparada em `lib/supabase.ts` + `lib/storage.ts`.
- **Push notifications, geração em lote, favoritos, campanhas**: fora do escopo
  do MVP. Arquitetura de templates é aditiva — nada disso exige refactor.
