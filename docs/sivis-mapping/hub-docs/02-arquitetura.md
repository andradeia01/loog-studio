# Arquitetura — LOOG HUB

> Decisões técnicas, stack, segredos, infra. Documento vivo.

---

## 1. Topologia alto nível

```
                 Internet
                    │
    ┌───────────────┼───────────────────────────┐
    ▼               ▼                           ▼
┌───────────┐  ┌───────────┐  ┌──────────────────────────┐
│  Vercel   │  │  Netlify  │  │  Supabase (Postgres+Auth)│
│           │  │           │  │                          │
│  admin    │  │  portal   │  │  Postgres 16 + RLS       │
│  consultor│  │  vistoria │  │  Auth (JWT)              │
└─────┬─────┘  └─────┬─────┘  │  Storage (S3-compat)     │
      │              │        │  Edge Functions          │
      └──────┬───────┘        └──────────────────────────┘
             │                            ▲
             ▼                            │
    ┌─────────────────────┐               │
    │   Server Actions    │───────────────┘
    │   /api/webhooks     │
    └─────────┬───────────┘
              │
    ┌─────────┴──────────────────────────┐
    ▼             ▼         ▼            ▼
┌─────────┐  ┌──────┐  ┌────────┐  ┌────────────┐
│  Asaas  │  │ Meta │  │ FIPE   │  │ Anthropic  │
│ pagam.  │  │ WABA │  │ Parall.│  │ Claude     │
└─────────┘  └──────┘  └────────┘  └────────────┘

                 Durante transição SIVIS:
                        │
                        ▼
                 ┌──────────────┐
                 │  SIVIS portal│  (adapter em packages/adapters/sivis)
                 └──────────────┘
```

---

## 2. Apps (Next.js 15)

| App | Deploy | Rota raiz | Auth | Público |
|---|---|---|---|---|
| **admin** | Vercel | `admin.loog.app.br` | Supabase Auth + MFA | Equipe interna LOOG |
| **consultor** | Vercel | `vendas.loog.app.br` | Supabase Auth (email+senha) | Consultores + corretoras parceiras |
| **portal** | Netlify (PWA) | `app.loog.com.br` | Supabase Auth (OTP WhatsApp preferido) | Associados LOOG |
| **vistoria** | Netlify (PWA) | `vistoria.loog.app.br` | Supabase Auth + token one-time | Vistoriadores terceirizados |

Todas as apps compartilham:

- `packages/db` (Prisma client)
- `packages/core` (domínio)
- `packages/adapters` (integrações)
- `packages/ui` (shadcn skinnado)

---

## 3. Monorepo

Decisão: **pnpm 9 workspaces + Turbo**.

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

```json
// turbo.json (highlights)
{
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "typecheck": { "outputs": [] },
    "lint": { "outputs": [] },
    "test": { "outputs": ["coverage/**"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

Comandos:

```bash
pnpm install
pnpm --filter admin dev
pnpm --filter db exec prisma migrate dev
pnpm turbo build        # tudo
pnpm turbo lint test typecheck --filter=...[main]
```

---

## 4. Banco de dados

**Supabase Postgres 16** (plano Pro $25/mês para dev + staging + produção MVP).

Convenções:

- Nomes em `snake_case` (padrão Postgres)
- Toda tabela: `id uuid pk default gen_random_uuid()`, `tenant_id uuid not null`, `created_at timestamptz`, `updated_at timestamptz`
- Soft-delete em entidades que precisam de histórico: `deleted_at timestamptz`
- RLS ativo em TODAS as tabelas desde o dia 1
- Policy base: `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`
- Policies específicas por role em cima da base

Prisma schema vive em `packages/db/prisma/schema.prisma`.

Migrations: `pnpm --filter db exec prisma migrate dev --name <nome>` → gera SQL em `packages/db/prisma/migrations/`.

Seeds: `packages/db/scripts/seed.ts` — cria tenant LOOG, usuários de teste, coberturas padrão, planos ficcionais.

---

## 5. Auth

**Supabase Auth** com três providers:

1. **Email + senha** (admin, consultor)
2. **OTP via WhatsApp** (associado) — custom SMS provider apontando pra Meta Cloud API
3. **Magic link** (fallback para associado sem WhatsApp)

JWT custom claims (via Database Function `auth.custom_access_token_hook`):

- `tenant_id`
- `role` (admin, consultor, associado, vistoriador, convidado)
- `member_id` (quando associado)
- `consultant_id` (quando consultor)

Server-side: `createServerClient` do `@supabase/ssr`.

RBAC em `packages/core/auth`:

```ts
export const permissions = {
  member: ['view', 'create', 'update', 'delete', 'export'],
  billing: ['view', 'create', 'write-off', 'cancel'],
  claim: ['view', 'open', 'approve', 'deny', 'pay'],
  inspection: ['view', 'perform', 'approve'],
  // ...
} as const;
```

---

## 6. Pagamentos (Asaas primeiro)

Por quê Asaas:

- Boleto híbrido com QR Pix nativo (requisito LOOG+)
- Split de pagamento para comissão do consultor (nativo, sem gambiarra)
- API REST documentada
- Preço: 1,99% + R$1,99 por transação de boleto (comparável ou melhor que Pagar.me)
- Suporte PT-BR

Configuração:

- **Assinaturas** para mensalidades recorrentes
- **Webhook** em `apps/admin/api/webhooks/asaas` com HMAC validation
- **Idempotência** por `invoice_id` + `settlement_id`
- **Split** configurado por consultor (percentual do valor mensal)

Fallback futuro: Pagar.me (API muito similar, abstract bem).

---

## 7. Variáveis de ambiente

### 7.1 Padrões

- `.env.example` em cada app com todas as chaves (vazias)
- `.env.local` em dev local (nunca commitado)
- **Produção**: Vercel/Netlify dashboard
- **Secrets**: Supabase Vault para keys de servidor

### 7.2 Lista mínima por app

**`apps/admin/.env.example`**

```bash
# Supabase (compartilhado)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=  # SERVIDOR ONLY, nunca expor

# Database (Supabase connection pooler)
DATABASE_URL=postgresql://...@aws-...pooler.supabase.com/postgres
DIRECT_URL=postgresql://...@aws-...supabase.com/postgres  # para migrations

# Asaas (production)
ASAAS_API_KEY=
ASAAS_WEBHOOK_SECRET=
ASAAS_ENV=sandbox|production

# WhatsApp (Meta Cloud API)
META_WABA_TOKEN=
META_WABA_PHONE_NUMBER_ID=
META_WABA_VERIFY_TOKEN=

# Vision IA
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-opus-5-5

# FIPE
FIPE_PROVIDER=parallelum
PARALLELUM_BASE_URL=https://parallelum.com.br/fipe/api/v1

# SIVIS (migração)
SIVISWEB_BASE_URL=https://portal.sivisweb.com.br
SIVISWEB_STORE_ID=028
SIVISWEB_USERNAME=
SIVISWEB_PASSWORD=
SIVISWEB_SESSION_TTL_MINUTES=30

# Observabilidade
SENTRY_DSN=
SENTRY_ORG=loog
SENTRY_PROJECT=admin

# Operacional
NODE_ENV=production
LOG_LEVEL=info
```

**`apps/portal/.env.example`** (subset — sem SERVICE_ROLE, sem SIVIS, sem Asaas secreto)

**`apps/consultor/.env.example`** (admin + split config)

**`apps/vistoria/.env.example`** (subset mínimo + Supabase Storage)

---

## 8. CI/CD

**GitHub Actions**:

- `ci.yml`: lint + typecheck + test em todo push + PR
- `preview.yml`: Vercel preview URL em cada PR
- `migrations.yml`: aplica migrations Prisma em staging automaticamente após merge na `main`

**Vercel**:

- Projetos: `loog-admin`, `loog-consultor`
- Branch deploy: `main` → produção, outras → preview
- Env vars: dashboard (sem commit)

**Netlify**:

- Projetos: `loog-portal`, `loog-vistoria`
- Mesma estratégia

---

## 9. Observabilidade

- **Sentry** (free tier → Team quando passar de 5k events/mês)
- **Vercel Analytics** para Core Web Vitals
- **Supabase Dashboard** para query performance
- **Pino** structured logs em server actions (JSON)
- **Grafana Cloud** (fase 7, com Loki+Tempo) para traces distribuídos

---

## 10. LGPD / Segurança

- Política em `apps/portal/legal/privacidade.pdf` (gerada do markdown versionado)
- DPO: Andrade (fase MVP), transferir para membro da LOOG na fase 7
- **Exportar meus dados** em `apps/portal/configuracoes/privacidade` — gera ZIP com JSON do associado + PDF resumo
- **Excluir conta** com confirmação dupla + hard-delete em 30 dias (anonymiza antes)
- Fotos de vistoria + B.O. sinistro: retenção 10 anos (requisito regulatório + prescrição civil)
- Credenciais SIVIS: Supabase Vault + rotação trimestral
- WhatsApp templates: aprovação formal + sem claims médicas/financeiras

---

## 11. Decisões em aberto

- [ ] Dropar `turbo` e usar `nx`? Mais features, mais complexidade. Fica turbo por ora.
- [ ] Edge functions do Netlify para PWA offline-sync? Vale um POC na fase 4.
- [ ] Usar Supabase Realtime para notificações em tempo real no admin? Depende do volume de eventos; se > 10 eventos/segundo, considerar.
- [ ] Preview deploy do banco em cada PR? Supabase branching ($10/mês cada). Avaliar na fase 2.

---

## 12. Diagramas detalhados

Em `docs/arquitetura/*.excalidraw.svg` (a criar). Enquanto não existir, cada módulo tem o diagrama no seu `docs/0x-dominio-*.md`.
