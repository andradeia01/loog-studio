# Zaia → LOOG SDR MASTER — Playbook das Ferramentas de Requisição HTTP

Você já tem: agente pronto, 3 tabelas (`loog_leads`, `loog_vehicle_data`, `loog_sales_state`), 9 ferramentas de tabela, journey definida. Faltam as **HTTP Request tools** que conectam a Zaia ao nosso Hub.

Este doc dá o **passo a passo cirúrgico** pra criar cada uma.

## Regra de ouro sobre "qual API veicular escolher"

Você **não precisa escolher API externa**. O Hub que construímos JÁ É a fachada. Ele encapsula Sivisweb (login + BuscaPlaca + FIPE + cotação). Todas as ferramentas HTTP da Zaia apontam pro Hub — nada mais.

Base URL única: `https://<seu-dominio-do-hub>` (Railway/VPS — ver [ZAIA_ACTIVATION_GUIDE.md](./ZAIA_ACTIVATION_GUIDE.md#passo-0)).

## Ferramentas na ordem em que aparecem na jornada

| # | Nome interno na Zaia | Endpoint no Hub | Quando o agente usa |
|---|---|---|---|
| 1 | `enrich_vehicle` | `POST /v1/vehicle/enrich` | Lead mandou a placa. Retorna veículo + FIPE numa chamada só. **Este é o principal** — pule o `lookup_vehicle_by_plate` isolado. |
| 2 | `create_quick_quote` | `POST /v1/quote/quick` | Veículo confirmado + nome + intenção. Gera cotação Sivisweb + mensagem WhatsApp pronta. |
| 3 | `lookup_fipe` | `POST /v1/fipe/lookup` | (Opcional) Casos raros em que o lead deu códigos FIPE mas não a placa. |
| 4 | `lookup_vehicle_by_plate` | `POST /v1/vehicle/lookup` | (Opcional) Se quiser separar "vi veículo" de "peguei FIPE". Prefira `enrich_vehicle`. |

**Você só precisa criar #1 e #2 pra ter o fluxo operando.** #3 e #4 são complementos.

---

## Ferramenta 1 — `enrich_vehicle`

Ela é o coração. Quando o lead manda a placa, essa chamada volta com marca, modelo, ano, código FIPE e valor FIPE — tudo que o agente precisa pra confirmar veículo.

### Aba Configuração

```
Nome interno:    enrich_vehicle
Rótulo visível:  Consultar veículo + FIPE por placa
Método:          POST
URL:             https://<seu-hub>/v1/vehicle/enrich
```

### Descrição pro agente (cole exato)

```
Consulta o veículo pela placa e traz junto o valor FIPE mais atual.
Use SEMPRE que o lead mandar uma placa (formato ABC1234 ou ABC1D23,
com ou sem hífen). NÃO invente marca, modelo ou valor — se essa
ferramenta falhar ou retornar VEHICLE_NOT_FOUND, avise o lead e peça
pra ele conferir a placa.
Após receber a resposta, MOSTRE ao lead o veículo identificado e
peça confirmação explícita ("confere?") ANTES de marcar
vehicle_confirmed=true e avançar a jornada.
```

### Aba Headers

| Chave | Valor |
|---|---|
| `Authorization` | `Bearer {{env.INTERNAL_API_KEY}}` |
| `Content-Type` | `application/json` |

### Aba Body (JSON)

```json
{
  "plate": "{{input.plate}}"
}
```

Onde `{{input.plate}}` é o parâmetro que a Zaia coleta do lead.

### Aba Parâmetros de entrada

| Nome | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `plate` | string | sim | Placa do veículo enviada pelo lead. Aceita ABC-1234, abc1234, ABC 1D23, etc. |

### Aba Mapeamento de saída → Tabelas

O agente chama Search em `loog_leads` por `whatsapp`; se não achar, Insert; senão Update. Mesma coisa em `loog_vehicle_data`.

Grave em `loog_leads`:

| Campo tabela | JSON path |
|---|---|
| `vehicle_plate` | `data.vehicle.plate` |
| `vehicle_brand` | `data.vehicle.brand` |
| `vehicle_model` | `data.vehicle.model` |
| `vehicle_year_model` | `data.vehicle.modelYear` |
| `vehicle_fipe_value` | `data.fipe.valueCents` (divida por 100 se quiser reais) |

Grave em `loog_vehicle_data`:

| Campo tabela | JSON path |
|---|---|
| `vehicle_version` | `data.vehicle.version` |
| `vehicle_year_manufacture` | `data.vehicle.manufactureYear` |
| `vehicle_fuel` | `data.vehicle.fuel` |
| `vehicle_fipe_code` | `data.vehicle.fipeCode` |
| `vehicle_fipe_reference` | `data.fipe.referenceMonth` |

**Não grave `vehicle_confirmed` aqui.** Fica `false` até o lead confirmar por texto/botão.

### Resposta exemplo

```json
{
  "success": true,
  "data": {
    "vehicle": {
      "plate": "ABC1D23",
      "brand": "BMW",
      "model": "320i M Sport 2.0 Turbo",
      "modelYear": 2022,
      "fuel": "Gasolina",
      "fipeCode": "009XXX-X"
    },
    "fipe": {
      "fipeCode": "009XXX-X",
      "brand": "BMW",
      "model": "320i M Sport",
      "modelYear": 2022,
      "referenceMonth": "setembro de 2026",
      "valueCents": 21648000,
      "formattedValue": "R$ 216.480,00"
    }
  },
  "confidence": 1.0,
  "plateFormat": "mercosul"
}
```

### Erros possíveis

| Status | code | Instrução ao agente |
|---|---|---|
| 400 | `INVALID_PLATE` | Peça a placa de novo, sem julgar. |
| 404 | `VEHICLE_NOT_FOUND` | Diga que não achou e ofereça: "confere pra mim se a placa é exatamente essa?" |
| 502 | `VEHICLE_PROVIDER_UNAVAILABLE` | Diga que houve instabilidade e vai tentar de novo em segundos. |

---

## Ferramenta 2 — `create_quick_quote`

Dispara a cotação rápida no Sivisweb depois que veículo está confirmado + nome do cliente coletado + intenção sinalizada.

### Aba Configuração

```
Nome interno:    create_quick_quote
Rótulo visível:  Criar cotação rápida
Método:          POST
URL:             https://<seu-hub>/v1/quote/quick
```

### Descrição pro agente

```
Cria uma cotação rápida no sistema Sivisweb com o veículo já
CONFIRMADO pelo lead. Retorna quoteId, valor mensal, taxa de adesão,
URL da cotação no portal e a mensagem oficial de WhatsApp pra
enviar ao lead.

Chame APENAS quando:
- vehicle_confirmed = true
- lead_leads.name e lead_leads.whatsapp preenchidos
- lead demonstrou intenção de ver preço (perguntou valor, pediu
  cotação, ou você chegou naturalmente ao PRE_QUOTE após qualificação)

NUNCA chame quando faltar veículo, nome ou intenção.
NUNCA invente valor — use exatamente o whatsappMessage que voltar
e envie ao lead.
```

### Headers

Iguais à ferramenta 1.

### Body (JSON)

```json
{
  "idempotencyKey": "{{lead.lead_id}}-{{timestamp}}",
  "leadId": "{{lead.lead_id}}",
  "customer": {
    "name": "{{lead.name}}",
    "phone": "{{lead.whatsapp}}",
    "sourceId": 29
  },
  "vehicle": {
    "plate": "{{lead.vehicle_plate}}",
    "brand": "{{lead.vehicle_brand}}",
    "brandCode": "{{vehicle_data.brand_code}}",
    "model": "{{lead.vehicle_model}}",
    "modelCode": "{{vehicle_data.model_code}}",
    "modelYear": {{lead.vehicle_year_model}},
    "modelYearCode": "{{vehicle_data.model_year_code}}",
    "fuel": "{{vehicle_data.vehicle_fuel}}",
    "fuelInitial": "{{vehicle_data.fuel_initial}}",
    "vehicleType": 1,
    "fipeCode": "{{vehicle_data.vehicle_fipe_code}}",
    "fipeValueCents": {{lead.vehicle_fipe_value}},
    "fipeMonth": "{{vehicle_data.vehicle_fipe_reference}}"
  }
}
```

**Sobre `brandCode`, `modelCode`, `modelYearCode`, `fuelInitial`**: não estão nas suas tabelas hoje. Adicione esses campos em `loog_vehicle_data` (todos string) — vêm no retorno do `enrich_vehicle` acima. O Hub aceita mesmo se vierem vazios, mas o resultado é melhor com eles.

### Mapeamento de saída → Tabelas

Grave em `loog_sales_state` (Search por `lead_id`, se existir Update, senão Insert):

| Campo tabela | JSON path | Nota |
|---|---|---|
| `quote_value` | `data.plan.monthlyValueCents` | valor mensal em centavos |
| `quote_status` | (fixo) `"ready"` | estado no seu enum |
| `next_action` | (fixo) `"present_quote_to_lead"` | |

Grave também no `loog_leads` (Update):
| `journey_stage` | (fixo) `"QUOTE_READY"` | avance a jornada |
| `buying_intent` | +10 pontos (regra sua) | opcional |

### O que o agente faz com o retorno

1. Envia AO LEAD o `data.whatsappMessage` **exatamente como veio** (é o template oficial da LOOG preenchido com os dados do plano). Não reescreve.
2. Espera 1 segundo (agente já faz isso).
3. Manda uma pergunta curta de continuidade: "O que achou?" ou "Faz sentido pra você?"
4. Atualiza `journey_stage = QUOTE_PRESENTED` em `loog_leads` (via `loog_leads Update`).

### Resposta exemplo

```json
{
  "success": true,
  "data": {
    "quoteId": "665",
    "provider": "sivisweb",
    "plan": {
      "productId": "487",
      "name": "COTA 9.0",
      "monthlyValueCents": 3490,
      "monthlyValueFormatted": "R$ 34,90",
      "joinFeeValueCents": 10000,
      "joinFeeFormatted": "R$ 100,00"
    },
    "whatsappMessage": "*LOOG PROTEÇÃO VEICULAR*\n\nOlá {nome}, tudo bem?\n\n...",
    "portalUrl": "https://portal.sivisweb.com.br/loja/028/cliente/665"
  }
}
```

### Erros

| code | Ação do agente |
|---|---|
| `VEHICLE_NOT_CONFIRMED` | Ele tentou cotar sem confirmar. Volte pra `VEHICLE_CONFIRMATION`. |
| `VEHICLE_INCOMPLETE` | Falta campo. Reveja `loog_vehicle_data`. |
| `QUOTE_PROVIDER_UNAVAILABLE` | Portal Sivisweb instável. Peça desculpa, aguarde 30s, tente de novo. |

---

## Ferramentas nativas da Zaia que você já pode wirear em paralelo

Olhando seu screenshot, essas resolvem coisas que estavam na spec do Hub original mas ficam melhores nativas na Zaia:

| Ferramenta Zaia | Uso na jornada |
|---|---|
| **Envio de mensagens** | Follow-up automático 30min / 2h / 24h se lead sumiu em cada estado. |
| **Follow Up** | Se a Zaia tem essa nativa, é o mesmo — sequência de reengajamento. |
| **Etiquetagem** | Tag por estado (`QUOTE_READY`, `OBJECTION`, `HOT`) — o time humano filtra depois. |
| **Criação de Ticket** | Handoff pro humano — cria ticket na seção de atendimentos. |
| **Memória Contextual** | Guardar coisas que o agente aprende do lead ao longo de várias conversas. |
| **Leitor de PDF** | Quando lead manda CRLV em PDF — pré-processa antes de chamar `analyze_vehicle_document` (que virá em PHASE 4). |

Não recrie essas no Hub. Deixa nativo.

---

## Roteiro de configuração em ordem (30-45 min)

1. **Adicionar campos em `loog_vehicle_data`** (string, todos):
   - `brand_code`
   - `model_code`
   - `model_year_code`
   - `fuel_initial`
2. **Deploy do Hub** (siga [ZAIA_ACTIVATION_GUIDE.md#passo-0](./ZAIA_ACTIVATION_GUIDE.md#passo-0-pré-requisito-expor-o-hub-numa-url-pública)).
3. **Gerar `INTERNAL_API_KEY`** e guardar como Environment Variable na Zaia (se ela suporta) OU como variável de contexto do agente.
4. **Criar ferramenta 1** `enrich_vehicle` conforme acima.
5. **Testar isoladamente**: na sandbox de conversa da Zaia, mande "abc1d23". O agente deve chamar `enrich_vehicle` e voltar com BMW 320i.
6. **Criar ferramenta 2** `create_quick_quote`.
7. **Testar fluxo completo** na sandbox:
   ```
   Você: oi
   SDR:  [greeting]
   Você: quero cotar meu carro, placa RTA6C42
   SDR:  [enrich_vehicle → mostra veículo → pede confirmação]
   Você: sim, confere
   SDR:  [update loog_leads vehicle_confirmed=true]
         [pergunta dor / nome]
   Você: chama Arthur, preciso de proteção pra colisão
   SDR:  [update loog_leads name + main_pain]
         [PAIN_DISCOVERY → PRE_QUOTE]
   Você: me manda a cotação
   SDR:  [create_quick_quote]
         [envia whatsappMessage oficial]
         "O que achou?"
   ```
8. **Só depois** de ter isso funcionando: adicione condicionais de follow-up, botões, áudio ElevenLabs.

---

## Anti-padrões a evitar

- ❌ Chamar `create_quick_quote` sem `vehicle_confirmed=true`. Vai retornar erro.
- ❌ Deixar o agente inventar valor FIPE porque a chamada demorou 3s. **Ele espera**.
- ❌ Enviar o veículo detectado como "certeza" sem pedir confirmação. Sivisweb às vezes retorna versão levemente errada; lead corrige.
- ❌ Duplicar linhas em `loog_leads`. Sempre Search por `whatsapp`, depois Insert/Update.
- ❌ Colocar `INTERNAL_API_KEY` no prompt do agente. Vai vazar em logs. Use var de ambiente/contexto.

---

## Próxima fase (depois desses 2 tools funcionando)

Ainda vou implementar do lado do Hub:
- `analyze_vehicle_document` (PHASE 4-5) — CRLV via OpenAI/Claude Vision
- `send_strategic_audio` (PHASE 6-7) — ElevenLabs + envio pelo canal (Zaia ou Baileys)
- `calculate_lead_score` (PHASE 8) — regras de score
- `get_next_action` (PHASE 8) — journey engine determinística

Cada um vira mais uma HTTP Tool na Zaia, seguindo o mesmo padrão desses dois primeiros.
