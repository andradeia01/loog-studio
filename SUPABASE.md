# Configuração do Supabase (5 minutos)

O LOOG Studio usa Supabase para:

- **Auth** — cadastro/login dos consultores (email + senha)
- **DB** — perfis dos consultores, status de aprovação, catálogo de artes prontas
- **Storage** — armazenamento das artes prontas

## Passo 1 — Crie o projeto (grátis)

1. Acesse https://supabase.com e faça login.
2. **New project**:
   - Nome: `loog-studio` (ou o que preferir)
   - Password do DB: gere e guarde
   - Região: **South America (São Paulo)**
3. Espere ~1 min a provisão.

## Passo 2 — Rode o schema

1. No dashboard do projeto: **SQL Editor → New query**.
2. Abra o arquivo local **[supabase/schema.sql](supabase/schema.sql)**, copie tudo.
3. Cole no editor e clique **Run**.

Deve terminar sem erros. Cria:

- Tabelas: `profiles`, `ready_arts`, `generated_arts`
- Triggers (auto-cria profile quando alguém se cadastra)
- RLS (segurança em nível de linha)
- Buckets Storage: `consultant-photos` (privado), `ready-arts` (público)

## Passo 3 — Configure Auth

**Authentication → Providers → Email**:
- **Enable Email provider**: ON
- **Confirm email**: OFF (desliga confirmação por email — vai facilitar)

**Authentication → URL Configuration**:
- **Site URL**: `http://localhost:3005` (troque depois pra sua URL Netlify)
- **Redirect URLs**: adicione a URL Netlify quando tiver

## Passo 4 — Cole as chaves no `.env.local`

**Project Settings → API**:

Copie:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** (Project API Keys) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role secret** (Project API Keys) → `SUPABASE_SERVICE_ROLE_KEY`

Cole em `.env.local` (crie o arquivo se não existir):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi....
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi....
```

Reinicie o `npm run dev` para carregar as variáveis.

## Passo 5 — Crie o primeiro admin (Halisson)

O trigger cria o profile em `pending` + `consultant` por padrão. Você precisa
promover o primeiro admin manualmente:

1. Abra o app: `http://localhost:3005/signup`
2. Cadastre-se com o email do gestor principal (ex.: `halisson@loog.com.br`)
3. Volte ao Supabase → **SQL Editor**:

   ```sql
   update public.profiles
   set role = 'admin', status = 'approved', approved_at = now()
   where email = 'halisson@loog.com.br';
   ```

4. Volte em `/login`, entra com esse email → cai em `/admin`.

A partir daí você aprova outros consultores pela UI (`/admin/consultores`).

## Passo 6 — Deploy no Netlify

Cole as mesmas 3 vars em **Site settings → Environment variables** do
Netlify e faça o redeploy. Ajuste **Authentication → URL Configuration**
no Supabase pra apontar pra URL final do Netlify.

## Fluxo do consultor (depois de configurado)

1. Ele abre `https://<seu-site>.netlify.app` → clica **Sou consultor — cadastrar**
2. Preenche nome, telefone, cidade, Instagram (opcional), email + senha
3. Cai em `/pending` — vê a mensagem "aguardando aprovação"
4. Você (admin) vê o cadastro em `/admin/consultores` com badge vermelho
5. Clica **Aprovar** → o consultor recebe acesso
6. Consultor faz login → cai em `/studio` com 2 abas:
   - **Prontas pra baixar** — clica → baixa
   - **Personalizar** — dados + foto + template + preview + gerar PNG

## Solução de problemas

**Erro "Invalid API key" ao cadastrar**
Confira que o `NEXT_PUBLIC_SUPABASE_ANON_KEY` foi copiado inteiro (é bem
comprido). Reinicie o dev server após editar `.env.local`.

**Consultor logou e viu "aguardando aprovação" pra sempre**
Você não aprovou ainda em `/admin/consultores`. Após aprovar, o consultor
faz logout+login (ou espera até ~5 min pra o token dele revalidar).

**Upload de arte falha com "row-level security policy"**
O usuário logado não é admin. Confira `role = 'admin'` no profile dele.

**Reset total (apagar dados de teste sem apagar schema)**
```sql
truncate public.ready_arts cascade;
truncate public.generated_arts cascade;
delete from auth.users where email <> 'halisson@loog.com.br';
```
