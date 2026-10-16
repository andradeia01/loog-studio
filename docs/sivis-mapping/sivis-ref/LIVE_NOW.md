# 🟢 Hub NO AR — URL NOVA (cloudflared, mais estável)

## Credenciais desta sessão

```
Base URL:          https://url-raising-movements-shade.trycloudflare.com
INTERNAL_API_KEY:  ba29fb3702de652add8f18ca542885455b7276582e71bdace32e24def3e5493e
```

URL atual sempre salva em `data/tunnel/current-url.txt`.

## ⚠️ Ação imediata na Zaia

**Substitua a URL na ferramenta `enrich_vehicle`** que você já começou:

Trocar de:
```
https://5774454f46f12a.lhr.life/v1/vehicle/enrich
```

Para:
```
https://url-raising-movements-shade.trycloudflare.com/v1/vehicle/enrich
```

Depois clique em **Testar Requisição** de novo com a mesma placa. Agora vai bater no Hub.

## Persistência (o que fiz)

Cloudflared quick tunnel é muito mais estável que localhost.run — dificilmente cai. Mas se cair (ou você reiniciar a máquina), rode:

```
start-hub-persistent.bat
```

(dou duplo-clique no arquivo da raiz do projeto). Ele abre 2 janelas:
- **LOOG Hub** — `npm start` (Fastify na porta 8090)
- **LOOG Tunnel** — cloudflared com **auto-restart**: se ele morrer, sobe de novo em 3s

⚠️ **A URL do trycloudflare muda cada vez que o cloudflared reinicia.** Se você fechou o tunnel e abriu de novo, olhe `data/tunnel/current-url.txt` pra pegar a nova URL e atualize na Zaia.

## Solução DEFINITIVA (recomendado dentro de dias)

Cloudflared quick tunnel é bom pra dev/teste, mas pra produção você quer:
- **Railway** (5-10 min): URL permanente, HTTPS, auto-scaling, grátis pra low traffic
- **Render** ou **VPS Docker**: similares

Guia: [docs/ZAIA_ACTIVATION_GUIDE.md § Passo 0](docs/ZAIA_ACTIVATION_GUIDE.md#passo-0-pré-requisito-expor-o-hub-numa-url-pública). Aí você troca a URL uma última vez na Zaia e nunca mais mexe.

---

## Ferramenta 1: `enrich_vehicle` — atualização da URL

Só isso muda:

```
URL: https://url-raising-movements-shade.trycloudflare.com/v1/vehicle/enrich
```

Resto continua igual (Método POST, Headers JSON com Bearer, Body com `{"plate":"{{plate}}"}`, Property `plate` string obrigatória).

Clique **Testar Requisição** com uma placa real do seu banco Sivisweb.

- Se voltar `data.vehicle.brand` → ✅ criar ferramenta
- Se voltar 404 `VEHICLE_NOT_FOUND` → placa não está no banco Sivisweb, tente outra
- Se voltar erro de tunnel → me avisa que ajusto

---

## Ferramenta 2: `create_quick_quote` — quando quiser criar

### Configuração

| Campo | Valor |
|---|---|
| Nome | `create_quick_quote` |
| Descrição | `Cria cotação rápida oficial LOOG (bundle padrão fixo: COTA 3.0 + Roubo + Colisão + Danos Terceiros 30k + Carro Reserva 10d + Vidros). Retorna quoteId, valor mensal, adesão e mensagem WhatsApp pronta. Só chame com vehicle_confirmed=true, nome e whatsapp preenchidos.` |
| Método | `POST` |
| URL | `https://url-raising-movements-shade.trycloudflare.com/v1/quote/quick` |

### Headers (JSON)

```json
{
  "Authorization": "Bearer ba29fb3702de652add8f18ca542885455b7276582e71bdace32e24def3e5493e",
  "Content-Type": "application/json"
}
```

### Propriedades (defina 13, todas string exceto onde marcado)

| Nome | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `leadId` | string | sim | Id do lead na Zaia |
| `customerName` | string | sim | Nome do lead |
| `customerPhone` | string | sim | Celular no formato 55DDNXXXXNNNN |
| `plate` | string | sim | Placa normalizada |
| `brand` | string | sim | Marca do veículo |
| `brandCode` | string | não | Código Sivisweb da marca |
| `model` | string | sim | Modelo completo do veículo |
| `modelCode` | string | não | Código Sivisweb do modelo |
| `modelYear` | number | sim | Ano do modelo (ex: 2021) |
| `modelYearCode` | string | não | Código Sivisweb do ano |
| `fuelInitial` | string | não | Letra do combustível (F, G, D, E) |
| `fipeCode` | string | sim | Código FIPE (ex: 003463-0) |
| `fipeValueCents` | number | sim | Valor FIPE em centavos |
| `fipeMonth` | string | sim | Mês de referência FIPE (ex: setembro de 2026) |

### Body (JSON)

```json
{
  "idempotencyKey": "{{leadId}}-{{$now}}",
  "leadId": "{{leadId}}",
  "customer": {
    "name": "{{customerName}}",
    "phone": "{{customerPhone}}",
    "sourceId": 29
  },
  "vehicle": {
    "plate": "{{plate}}",
    "brand": "{{brand}}",
    "brandCode": "{{brandCode}}",
    "model": "{{model}}",
    "modelCode": "{{modelCode}}",
    "modelYear": {{modelYear}},
    "modelYearCode": "{{modelYearCode}}",
    "fuelInitial": "{{fuelInitial}}",
    "vehicleType": 1,
    "fipeCode": "{{fipeCode}}",
    "fipeValueCents": {{fipeValueCents}},
    "fipeMonth": "{{fipeMonth}}"
  }
}
```

> Se a Zaia não tiver `{{$now}}`, use qualquer string única — vale timestamp gerado pelo agente ou até `{{leadId}}-manual` (não vai gerar duplicata dentro de 24h por idempotência do Hub).

### Query

Vazio.

### Ativar em

Toggle ON no agente **Luis Otávio**.

### Testar

Preencha manualmente todas as propriedades na tela "Testar Requisição". Sugestão usar dados do Ford Ka que já testamos:

- leadId: `test-manual-001`
- customerName: `TESTE FERRAMENTA ZAIA`
- customerPhone: `5511999999999`
- plate: `TST1L23`
- brand: `Ford`
- brandCode: `22`
- model: `Ka 1.5 Sedan SE 12V Flex 4p Mec.`
- modelCode: `8445`
- modelYear: `2021`
- modelYearCode: `2021-5`
- fuelInitial: `F`
- fipeCode: `003463-0`
- fipeValueCents: `5243500`
- fipeMonth: `setembro de 2026`

Retorno esperado: JSON com `data.plan.monthlyValueFormatted: "R$ 216,90"` e `data.whatsappMessage` grande.

**Cria um lead real no CRM da loja 028** — lembre de deletar depois.

---

## Checklist

- [x] Hub rodando (npm start pid 1055)
- [x] Túnel cloudflared ativo (pid 1102) com URL: **https://url-raising-movements-shade.trycloudflare.com**
- [x] URL salva em `data/tunnel/current-url.txt`
- [x] Watchdog `start-hub-persistent.bat` na raiz do projeto
- [ ] Atualizar URL na ferramenta `enrich_vehicle` na Zaia
- [ ] Testar `enrich_vehicle` com placa real → confirmar success
- [ ] Criar `create_quick_quote` com config acima
- [ ] Testar cotação → confirmar R$ 216,90 (Ford Ka fixture)
- [ ] Deploy definitivo Railway (para URL persistente que não muda)
