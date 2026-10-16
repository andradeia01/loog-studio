# Ativar a integração Sivisweb na Zaia — passo a passo

Este documento é operacional. Assumindo que você tem acesso admin ao painel da Zaia.

---

## Passo 0 — Pré-requisito: expor o Hub numa URL pública

A Zaia é SaaS e precisa alcançar o Hub por HTTPS público. Escolha um caminho:

### Opção A — Railway (recomendado pra ir ao ar em 10 minutos)

1. `https://railway.app` → **New Project** → **Deploy from GitHub repo** (suba este projeto num repo privado).
2. Adicione um **PostgreSQL** plugin (ficará em uso a partir da PHASE 9).
3. **Variables**:
   ```
   NODE_ENV=production
   PORT=8080
   INTERNAL_API_KEY=<gere: openssl rand -hex 32>
   MOCK_MODE=false
   QUOTE_PROVIDER=sivisweb
   SIVISWEB_BASE_URL=https://portal.sivisweb.com.br
   SIVISWEB_STORE_ID=028
   SIVISWEB_USERNAME=andrade@axencode.com.br
   SIVISWEB_PASSWORD=<a senha; troque depois pra usuário de serviço>
   SIVISWEB_SESSION_TTL_MINUTES=30
   DATABASE_URL=<Railway preenche automaticamente>
   ```
4. **Settings → Networking → Generate Domain**. Anote o URL, ex.: `https://loog-hub-production.up.railway.app`.
5. Teste:
   ```bash
   curl https://loog-hub-production.up.railway.app/health
   # esperado: { "status": "ok", ... }
   ```

### Opção B — Local + ngrok (só pra teste rápido, não use em produção)

```bash
cd "SDR - LOOG - PROTEÇÃO VEICULAR"
# preencha .env com as vars acima
npm run dev
# em outro terminal:
ngrok http 8080
```

Copie a URL `https://<xxx>.ngrok-free.app`. Vale pela sessão do ngrok.

### Opção C — VPS Docker

```bash
docker compose up -d
```

Coloque um Nginx/Caddy na frente com HTTPS.

---

## Passo 1 — Guardar a `INTERNAL_API_KEY`

A Zaia vai usá-la em toda chamada. Gere uma vez, guarde num gerenciador de segredos:

```bash
openssl rand -hex 32
# ou:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Cole no `.env` do Hub **e** guarde a mesma string pra usar no header da Zaia no próximo passo.

---

## Passo 2 — Criar a HTTP Tool no painel da Zaia

**Painel Zaia → Agentes → LOOG SDR MASTER → Ferramentas → Nova ferramenta HTTP**

### Aba: Configuração

| Campo | Valor |
|---|---|
| Nome interno | `create_quick_quote` |
| Rótulo visível | `Criar cotação rápida (Sivisweb)` |
| Descrição pro agente | Cria uma cotação rápida no sistema Sivisweb com o veículo e cliente já confirmados. Retorna o valor mensal, taxa de adesão e a mensagem pronta pra enviar ao lead. Use APENAS depois de: (1) o veículo estar confirmado pelo lead, (2) você ter nome e celular do lead, (3) ele ter demonstrado interesse em ver o preço. NUNCA invente valores. |
| Método | `POST` |
| URL | `https://<sua-url>/v1/quote/quick` |

### Aba: Headers

| Chave | Valor |
|---|---|
| `Authorization` | `Bearer <INTERNAL_API_KEY>` |
| `Content-Type` | `application/json` |

### Aba: Parâmetros (Body JSON)

Cole exatamente:

```json
{
  "idempotencyKey": "{{lead.id}}-{{timestamp}}",
  "leadId": "{{lead.id}}",
  "customer": {
    "name": "{{lead.nome}}",
    "phone": "{{lead.telefone}}",
    "sourceId": 29
  },
  "vehicle": {
    "plate": "{{lead.veiculo_placa}}",
    "brand": "{{lead.veiculo_marca}}",
    "brandCode": "{{lead.veiculo_marca_codigo}}",
    "model": "{{lead.veiculo_modelo}}",
    "modelCode": "{{lead.veiculo_modelo_codigo}}",
    "modelYear": {{lead.veiculo_ano}},
    "modelYearCode": "{{lead.veiculo_ano_codigo}}",
    "fuel": "{{lead.veiculo_combustivel}}",
    "fuelInitial": "{{lead.veiculo_sigla_combustivel}}",
    "vehicleType": 1,
    "fipeCode": "{{lead.fipe_codigo}}",
    "fipeValueCents": {{lead.fipe_valor_centavos}},
    "fipeMonth": "{{lead.fipe_mes_referencia}}"
  }
}
```

> Os `{{...}}` são placeholders da Contextual Memory / Table da Zaia — ajuste se sua nomenclatura for outra.

### Aba: Resposta (mapear pro agente)

Faça a Zaia salvar do JSON de resposta:

| Campo Zaia | JSON path |
|---|---|
| `lead.cotacao_id` | `data.quoteId` |
| `lead.cotacao_valor_mensal` | `data.plan.monthlyValueFormatted` |
| `lead.cotacao_taxa_adesao` | `data.plan.joinFeeFormatted` |
| `lead.cotacao_url_portal` | `data.portalUrl` |
| `lead.cotacao_mensagem_whatsapp` | `data.whatsappMessage` |

---

## Passo 3 — Ensinar o agente a usar

No prompt do agente da Zaia, adicione uma seção:

```
## Ferramenta: create_quick_quote

Você usa esta ferramenta quando:
- O veículo já está CONFIRMADO pelo lead ("sim, é esse mesmo").
- Você tem nome e celular do lead.
- O lead demonstrou interesse em saber o preço (perguntou valor, pediu cotação,
  ou você chegou naturalmente no PRE_QUOTE após qualificação).

Você NÃO usa quando:
- Veículo ainda não confirmado.
- Falta nome/telefone.
- O lead só perguntou "qual o preço?" sem contexto — primeiro qualifique.

Depois de chamar create_quick_quote:
- Envie ao lead a `cotacao_mensagem_whatsapp` que voltou.
- Não invente valores; use exatamente o que voltou.
- Se voltar erro, peça desculpa e informe que houve um problema técnico,
  não invente cotação.
```

---

## Passo 4 — Teste ponta a ponta

Na sandbox de conversa da Zaia:

```
Usuário: Quero uma cotação pro meu carro
Zaia:    Beleza, me passa a placa
Usuário: [placa]
Zaia:    [chama vehicle enrich, confirma o veículo]
         Confere que é um BMW 118i 2022?
Usuário: Sim
Zaia:    [chama create_quick_quote]
         [envia a whatsappMessage retornada]
```

Se der ruim, olhe os logs do Hub — cada request tem `requestId` no header `x-request-id`. Grep por ele no log do Railway/Docker mostra o request inteiro (sem senha/token, redação ativa).

---

## Passo 5 — Segurança operacional

1. **Troque as senhas expostas** (as duas: `13297416769` e `96761479231`).
2. **Crie usuário de serviço no Sivisweb** dedicado a essa automação. Peça permissão só pra: dashboard, portal, produto, CRM (criar/atualizar leads).
3. **Rotacione `INTERNAL_API_KEY`** trimestralmente.
4. **Delete os leads de teste** que ficaram no CRM da loja 028:
   - Lead 663 ("TESTE - LOOG SDR HUB")
   - Lead 665 ("TESTE - LOOG SDR HUB")
5. **Não coloque `INTERNAL_API_KEY` no repo Git** — .env já está no .gitignore.
6. **Monitore custo**: se o Sivisweb tiver rate-limit, o Hub cacheia sessão 30 min pra não relogar; ajuste `SIVISWEB_SESSION_TTL_MINUTES` se precisar.

---

## Se der erro na Zaia

| Erro do Hub | O que significa | Ação |
|---|---|---|
| `401 UNAUTHORIZED` | Header Authorization errado | Confira `Bearer <key>` no painel Zaia |
| `400 INVALID_PLATE` | Placa mal formada | O agente deve pedir de novo |
| `400 VALIDATION_ERROR` | Falta campo obrigatório | Cheque mapeamento dos `{{...}}` |
| `502 QUOTE_LOGIN_FAILED` | Credencial Sivisweb expirou | Troque no `.env` do Hub e reinicie |
| `502 QUOTE_PROVIDER_UNAVAILABLE` | Portal Sivisweb instável | Zaia deve retentar com backoff |

---

## Complemento — ferramenta `lookup_vehicle_by_plate`

Se quiser que a Zaia resolva placa antes de cotar, adicione uma segunda HTTP Tool com o mesmo padrão:

- Nome: `lookup_vehicle_by_plate`
- URL: `POST https://<sua-url>/v1/vehicle/lookup`
- Body: `{ "plate": "{{placa}}" }`
- Response salva: marca, modelo, ano, fipeCode etc — todos os campos que a `create_quick_quote` vai precisar depois.

Ou, mais direto: ensinar o agente a coletar `plate`, chamar `lookup_vehicle_by_plate`, confirmar com o lead, e só depois chamar `create_quick_quote`.
