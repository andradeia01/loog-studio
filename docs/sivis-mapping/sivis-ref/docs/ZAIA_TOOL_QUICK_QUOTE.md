# Zaia HTTP Tool — `create_quick_quote`

Envia uma cotação rápida no portal Sivisweb (loja `028`) e devolve o `quoteId`, o plano recomendado, valor mensal e (quando disponível) a mensagem de WhatsApp modelo para o lead.

## Configuração

| Campo | Valor |
|---|---|
| Nome | `create_quick_quote` |
| Método | `POST` |
| URL | `${APP_URL}/v1/quote/quick` |
| Headers | `Authorization: Bearer ${INTERNAL_API_KEY}`<br>`Content-Type: application/json` |

## Quando o agente chama

Chame **depois** de:
1. Placa do lead confirmada pelo usuário (fluxo `VEHICLE_CONFIRMED`).
2. Nome e celular capturados.
3. Estágio da jornada ≥ `QUOTE_REQUEST` (o próprio lead pediu cotação, ou entrou no gatilho `READY_FOR_QUOTE`).

**Não chame** quando:
- O veículo ainda não foi confirmado.
- Falta nome ou telefone válido do lead.
- O usuário ainda está em `PRICE_ONLY` sem qualificação (evitar chamada só para "descobrir preço" sem contexto).

## Request body

```json
{
  "idempotencyKey": "quote-{leadId}-{timestamp}",
  "leadId": "lead_abc123",
  "customer": {
    "name": "Arthur Oliveira",
    "phone": "5524998844557",
    "sourceId": 29
  },
  "vehicle": {
    "plate": "RTF6F84",
    "brand": "Ford",
    "brandCode": "22",
    "model": "Ka 1.5 Sedan SE 12V Flex 4p Mec.",
    "modelYear": 2021,
    "modelYearCode": "2021-5",
    "fuel": "Flex",
    "fuelInitial": "F",
    "vehicleType": 1,
    "fipeCode": "003463-0",
    "fipeValueCents": 5243500,
    "fipeMonth": "setembro de 2026"
  },
  "productId": 5
}
```

Notas:
- `idempotencyKey` obrigatória. Mesma chave → devolve a mesma cotação, header `x-idempotent-replay: true`.
- `sourceId` = campo `procedencia` do Sivisweb (`29` = LOOG/Zaia; ajustar conforme configuração da loja).
- Todos os campos de `vehicle` vêm do resultado de `/v1/vehicle/enrich` (ver `PHASE 3`). O agente **nunca inventa** esses valores.
- `productId` opcional: se omitido, escolhe o primeiro produto disponível para o veículo.

## Response — 200

```json
{
  "success": true,
  "data": {
    "quoteId": "661",
    "provider": "sivisweb",
    "plan": {
      "productId": 5,
      "name": "COTA 3.0",
      "monthlyValueCents": 39990
    },
    "whatsappMessage": "Olá Arthur, sua cotação COTA 3.0 é R$ 399,90/mês...",
    "portalUrl": "https://portal.sivisweb.com.br/loja/028/cliente/661"
  },
  "requestId": "req_..."
}
```

## Erros comuns

| HTTP | code | O que fazer |
|---|---|---|
| 400 | `INVALID_PLATE` | Pedir a placa novamente ao lead. |
| 400 | `VALIDATION_ERROR` | Verificar campos obrigatórios. |
| 401 | `UNAUTHORIZED` | Corrigir `INTERNAL_API_KEY` na Zaia. |
| 502 | `QUOTE_LOGIN_FAILED` | Credenciais do portal expiradas — não retentar; alertar operador. |
| 502 | `QUOTE_PROVIDER_UNAVAILABLE` | Portal instável — retentar com backoff exponencial. |

## Fluxo interno (para debugging)

O Hub executa, por trás:
1. `POST /loja/028/api/portal/usuario` (`restrictedArea`) — login com cookies de sessão cacheados por até `SIVISWEB_SESSION_TTL_MINUTES` (default 30 min).
2. `GET /loja/028/dashboard` — ativa a sessão.
3. `POST /loja/028/api/dashboard/funcionario` (`criarSessaoConsultor` + `rapido=1`) — cria sessão do consultor no modo cotação rápida.
4. `POST /loja/028/api/portal/crm` (`salvarLead`) — cria o lead com o veículo, retorna `id`.
5. `POST /loja/028/api/portal/produto` (`buscarServicos`) — lista produtos elegíveis.
6. `POST /loja/028/api/portal/produto` (`buscarCoberturas`) — coberturas do produto escolhido, seleciona padrões.
7. `POST /loja/028/api/portal/crm` — atualiza o lead com o plano montado.
8. `GET /loja/028/api/portal/crm?functionPage=getModeloWhats` — pega a mensagem de WhatsApp modelo.

Toda essa cadeia é encapsulada por um único POST no Hub.
