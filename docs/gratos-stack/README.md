# Gratos Stack — ferramentas open source na VPS LOOG

Stack instalado em `/opt/gratos-stack/` na VPS Hostinger (srv1995983.hstgr.cloud, 2.25.189.22).
Rodando desde 2026-10-16, docker compose v2.

## Serviços instalados (6 containers)

| Serviço | Função | Porta local (bind 127.0.0.1) | Subdomínio futuro |
|---|---|---|---|
| postgres | Banco compartilhado (n8n + docuseal + plausible) | 5432 interno | — |
| clickhouse | Analytics DB pro Plausible | 8123/9000 interno | — |
| n8n | Automações workflow (triggers → ações) | 5678 | n8n.loogstudio.tech |
| docuseal | Assinatura eletrônica (DocuSign free) | 3010 | docs.loogstudio.tech |
| stirling-pdf | Toolkit PDF server-side (60+ ferramentas) | 3011 | pdf.loogstudio.tech |
| plausible | Analytics LGPD-safe (GA free) | 3012 | analytics.loogstudio.tech |

## Como acessar agora (sem Caddy ainda)

**Via SSH tunnel** (laptop):
```bash
ssh -L 5678:127.0.0.1:5678 \
    -L 3010:127.0.0.1:3010 \
    -L 3011:127.0.0.1:3011 \
    -L 3012:127.0.0.1:3012 \
    root@2.25.189.22
# Agora acesse:
#   http://localhost:5678  (n8n)
#   http://localhost:3010  (docuseal)
#   http://localhost:3011  (stirling)
#   http://localhost:3012  (plausible)
```

As credenciais iniciais (user admin + senha gerada) estão em `/opt/gratos-stack/.env` na VPS.

## Expor publicamente (passos futuros)

### 1. DNS wildcard
Painel DNS do loogstudio.tech → criar registro A:
```
*.loogstudio.tech    A    2.25.189.22    (TTL 300)
```
Ou individuais: `n8n`, `docs`, `pdf`, `analytics` apontando pra 2.25.189.22.

### 2. Adicionar blocos no Caddyfile
Em `/etc/caddy/Caddyfile` da VPS, adicionar:
```
n8n.loogstudio.tech {
    reverse_proxy 127.0.0.1:5678
    encode gzip
    header { Strict-Transport-Security "max-age=31536000; includeSubDomains" }
}

docs.loogstudio.tech {
    reverse_proxy 127.0.0.1:3010
    encode gzip
    header { Strict-Transport-Security "max-age=31536000; includeSubDomains" }
}

pdf.loogstudio.tech {
    reverse_proxy 127.0.0.1:3011
    encode gzip
    header { Strict-Transport-Security "max-age=31536000; includeSubDomains" }
}

analytics.loogstudio.tech {
    reverse_proxy 127.0.0.1:3012
    encode gzip
    header { Strict-Transport-Security "max-age=31536000; includeSubDomains" }
}
```

Depois: `sudo systemctl reload caddy` — Let's Encrypt gera SSL automaticamente.

### 3. Primeira configuração de cada tool
- **n8n**: login admin + criar workflows (ex: "cotacao criada → envia e-mail")
- **DocuSeal**: criar conta admin via UI + primeiro template de adesão LOOG
- **Stirling PDF**: funciona sem conta — API usada direto do Studio
- **Plausible**: criar organização LOOG + site loogstudio.netlify.app → trocar snippet GA

## Observabilidade

```bash
# Logs
cd /opt/gratos-stack
docker compose logs -f <serviço>

# Status
docker compose ps

# Restart serviço
docker compose restart <serviço>

# Update imagens
docker compose pull && docker compose up -d
```

## Backup
PostgreSQL compartilhado é backupeado automaticamente pelo GitHub Action do Studio? **NÃO** — aquele backup é só do Supabase. Pra backup deste Postgres local:

```bash
# Adicionar ao crontab da VPS: dump semanal
0 4 * * 0 docker exec gratos-stack-postgres-1 pg_dumpall -U gratos | gzip > /opt/backups/gratos-$(date +\%F).sql.gz
```

(Pendência H2 — adicionar à automação de infra)

## Custos
Zero. Tudo roda na VPS Hostinger que já pagamos (R$ 50/mês). As ferramentas são 100% self-hosted open source.
