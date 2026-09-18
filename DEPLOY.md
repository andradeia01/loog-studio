# Deploy no Netlify — LOOG Studio

Este projeto é **Next.js 15 com SSR** (a API `/api/generate` roda em Node.js
com Sharp para compor as artes). O Netlify hospeda tudo automaticamente via
o plugin oficial `@netlify/plugin-nextjs` — cada API route vira uma Netlify
Function; o restante é servido como CDN.

---

## O que os consultores vão acessar

Depois do deploy, você compartilha **um único link** com a rede:

```
https://<seu-site>.netlify.app/studio
```

Nessa página o consultor:

1. Preenche nome, telefone, (opcional) Instagram e cidade.
2. Sobe a foto e ajusta o enquadramento.
3. Escolhe uma arte no catálogo.
4. Vê a prévia em tempo real.
5. Aperta **Gerar minha arte** → recebe o PNG pronto pra postar/compartilhar.

Os dados dele ficam salvos no navegador (localStorage), então nas próximas
vezes ele não precisa preencher de novo.

---

## Método 1 — Deploy via Git (recomendado)

**Pré-requisito:** conta no GitHub/GitLab/Bitbucket e conta no Netlify.

1. **Suba o projeto no seu Git**
   ```bash
   cd LOOG-STUDIO
   git init
   git add .
   git commit -m "chore: initial LOOG Studio"
   git branch -M main
   git remote add origin <URL_DO_SEU_REPO>
   git push -u origin main
   ```

2. **No Netlify** → **Add new site → Import from Git**
   - Escolha o provedor (GitHub etc.), autorize e selecione o repo.
   - O Netlify detecta automaticamente a config em `netlify.toml`:
     - Build command: `npm run build`
     - Publish directory: `.next`
     - Runtime: `Node 20`
   - Não precisa mexer em mais nada. Clique **Deploy site**.

3. **Aguarde o build (~2 min).** No fim aparece a URL:
   ```
   https://<random-name>.netlify.app
   ```
   Personalize em **Site settings → Change site name**.

4. **Compartilhe com os consultores** a URL `/studio`.

Cada `git push` para `main` faz redeploy automático.

---

## Método 2 — Netlify CLI (upload direto do seu PC)

Sem precisar de Git.

1. **Instale o CLI** (uma vez, global):
   ```bash
   npm install -g netlify-cli
   ```

2. **Faça login:**
   ```bash
   netlify login
   ```

3. **Na pasta do projeto, primeira vez:**
   ```bash
   cd LOOG-STUDIO
   netlify init      # escolhe: Create & configure a new site
   ```

4. **Deploy pra produção:**
   ```bash
   netlify deploy --prod --build
   ```
   O CLI roda o build local, faz upload dos artefatos e devolve a URL.

Cada release: `netlify deploy --prod --build`.

---

## Método 3 — Deploy from folder (arrastar pasta no dashboard)

Se você não quiser Git nem CLI:

1. Rode o build local:
   ```bash
   cd LOOG-STUDIO
   npm install
   npm run build
   ```

2. No dashboard do Netlify: **Add new site → Deploy manually** e arraste
   a pasta **inteira** do projeto (não apenas `.next`).
   O Netlify vai executar o build de novo no ambiente Linux dele para pegar
   o binário correto do Sharp — isso é essencial.

Alternativa mais leve: use o método 2 (CLI).

---

## Variáveis de ambiente

Todas **opcionais** para o MVP. Se você definir, faça em
**Site settings → Environment variables**:

| Variável | Efeito |
|---|---|
| `ADMIN_TOKEN` | Se definido, exige header `x-admin-token` em `/api/templates` e `/api/upload`. Recomendado em produção. |
| `NEXT_PUBLIC_SUPABASE_URL` | Habilita o cliente Supabase (leitura de perfis/histórico). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública. |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave admin — **nunca** exponha no frontend. |

Sem nenhuma dessas: o app funciona normalmente. Templates vêm dos arquivos
em `public/templates/` empacotados no build. Dados do consultor ficam
apenas no navegador dele.

---

## O que funciona em produção

- ✅ **`/`** — home
- ✅ **`/studio`** — fluxo completo do consultor (foto, dados, escolha, preview, geração, download, compartilhar)
- ✅ **`POST /api/generate`** — gera o PNG via Sharp
- ✅ **`GET /api/templates`** e **`GET /api/templates/[slug]`** — leitura
- ✅ **`/admin`** e **`/admin/[slug]`** — visualização dos templates

## O que só funciona local (dev)

- ⚠️ **`POST /api/templates`, `PUT /api/templates/[slug]`, `DELETE`**
- ⚠️ **`POST /api/upload`** (upload de background/foreground/thumbnail)
- ⚠️ **Salvar template** no editor visual

Motivo: **o disco das Netlify Functions é volátil.** O que você grava
some no próximo request. Para adicionar/editar templates em produção,
o fluxo é:

1. Edite local (`npm run dev` → `/admin`), salve.
2. `git push` (Método 1) ou `netlify deploy --prod --build` (Método 2).

Templates entram no repo, viram parte do bundle, servidos pra sempre.

Quando quiser admin em nuvem: implemente o [Supabase Storage](src/lib/supabase.ts)
para persistir `templates` — o schema sugerido já está no arquivo.

---

## Gerar o .zip do projeto

Para arquivar/enviar por outro canal:

```bash
npm run package:netlify
```

Sai em `dist/loog-studio-netlify-<timestamp>.zip` (contém `src/`, `public/`,
`scripts/`, configs — sem `node_modules`, sem `.next`, sem `.env`).

---

## Troubleshooting

**Build falha com erro do Sharp**
Confira que o `NODE_VERSION` no `netlify.toml` está em 20+. Se persistir:
force reinstall clicando em **Deploys → Trigger deploy → Clear cache and
deploy site**.

**`/api/generate` retorna 500**
Veja os logs em **Functions → api-generate → Recent invocations**. Costuma
ser template inexistente (slug errado) ou timeout (imagem > 4K).

**Fontes com acento faltam glifos**
As fontes usadas pelo Sharp vêm do sistema Linux do Netlify. `Arial` e
`sans-serif` estão sempre disponíveis. Se você quiser usar uma fonte
específica (a exata da identidade LOOG), coloque o `.ttf` em
`public/fonts/` e ajuste o `font-family` do template para o nome exato
do arquivo (ex.: `"LOOGDisplay"`).

**Rate limit**
`/api/generate` tem limite de 20 gerações/min por IP. Para escalar,
substitua a implementação em [src/app/api/generate/route.ts](src/app/api/generate/route.ts) por Upstash Redis.
