# Mapa da API SIVIS — extraído do HAR

> **Fonte:** `C:\Users\admin.immuno\Downloads\portal.sivisweb.com.br.har` (3.8 MB, gravado em 29/09/2026 12:25)
> **Analisado em:** 27/10/2026
> **Loja analisada:** `028` (= LOOG Proteção Veicular)
> **Consultor logado:** NORBERTO ANDRADE MORAIS SILVA (id `142`, tipo `E`)
> **Backend observado:** Microsoft IIS 10.0 + ASP.NET + Plesk (PHP-style routing com `functionPage`)
>
> Este documento é a base pro `SivisHttpAdapter` da Fatia F do projeto "LOOG Studio = sistema completo".

---

## 1. Arquitetura observada

### Hosts
| Host | Papel |
|---|---|
| `portal.sivisweb.com.br` | SPA + API principal do consultor (`/loja/:id/api/...`) |
| `sivisweb.com.br` | Backend legacy — tabelas FIPE (`/Modulos/Seguro/ajax/fipejson.php`) |

### Padrão de endpoints

```
POST https://portal.sivisweb.com.br/loja/028/api/{portal|dashboard}/{entidade}
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Origin: https://portal.sivisweb.com.br
Referer: https://portal.sivisweb.com.br/loja/028/{pagina}

body: functionPage=<nome_da_acao>&campo1=val1&campo2=val2...
```

**Peculiaridades:**
- Body é SEMPRE `application/x-www-form-urlencoded` (não JSON)
- Primeiro campo é SEMPRE `functionPage` (roteia internamente qual lógica rodar)
- Response `Content-Type: text/html` mas o conteúdo é JSON string ou texto plano (`"true"`, `"[\"ok\"]"`, `{"id":"661"}`)
- Header `X-Requested-With: XMLHttpRequest` é **obrigatório** (o framework rejeita sem ele)
- `Origin` e `Referer` devem bater com `portal.sivisweb.com.br` (anti-CSRF leve)
- `Access-Control-Allow-Origin: *` do server-side (CORS liberado, mas não protege do server, que valida pelo cookie de sessão)

### Autenticação

- **Session cookie ASP.NET** — presumido mas **NÃO capturado no HAR** (Chrome exporta HAR sem cookies HttpOnly por default).
- **Nome provável:** `ASP.NET_SessionId` ou `ASPSESSIONID*` (padrão IIS/ASP.NET sessions).
- **Fluxo:**
  1. GET `/loja/028/login` → recebe cookie de sessão (anônimo)
  2. POST `/loja/028/api/portal/usuario` com `functionPage=restrictedArea&email=X&password=Y` → se OK responde `true`, servidor **promove** o cookie de sessão para autenticado
  3. POST `/loja/028/api/dashboard/funcionario` com `functionPage=criarSessaoConsultor` → finaliza sessão de consultor, responde `["ok"]`
  4. Daí em diante usa o mesmo cookie em todas as calls

**NÃO há:** JWT, Bearer token, CSRF/XSRF token, API key.

### Anti-abuse detectado
- `X-Requested-With: XMLHttpRequest` obrigatório
- Session cookie obrigatório (ASP.NET nativo)
- Checagem de `Origin`/`Referer` em algumas rotas (safe-guard CORS)
- Rate limit: **não detectado explicitamente** (nenhum header `X-RateLimit-*` ou `Retry-After`)

---

## 2. Endpoints mapeados (ordenados por relevância pro adapter)

### 2.1 LOGIN do consultor
```
POST /loja/028/api/portal/usuario
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest

body: functionPage=restrictedArea
      email=<consultor@email>
      password=<senha>

→ 200 "true"  (string literal, não JSON)
```
Depois disso o cookie de sessão vira "autenticado".

---

### 2.2 Criar sessão do consultor (pós-login)
```
POST /loja/028/api/dashboard/funcionario
Content-Type: application/x-www-form-urlencoded; charset=UTF-8

body: rapido=0
      functionPage=criarSessaoConsultor

→ 200 ["ok"]  (string literal "[\"ok\"]")
```
Rodado logo após login — provavelmente ativa flags de contexto do consultor na sessão.

---

### 2.3 Dados do consultor logado
```
GET /loja/028/api/dashboard/dashboard?functionPage=<action>

→ 200 {"usuario":{"id":"142","razao_social":"NORBERTO ANDRADE MORAIS SILVA","tipo":"E","cep":"27259-000","endereco":"Avenida Um","numero":"120","bairro":"...","complemento":"BELVED..."}}
```
Útil pra validar que o login funcionou e pegar `usuario.id` (= consultor_id interno SIVIS).

---

### 2.4 Config da loja/portal
```
GET /loja/028/api/portal/portal?functionPage=<action>

→ 200 {"nome":"LOOG","site_nome":"LOOG PROTEÇÃO VEICULAR","modelo":"seguro","mdl_what":true,"contrato":"028","unico":"0","image":"https://sivisweb.com.br/Pessoas/028/Empresa/logo_001.png"...}
```
Metadata da loja (cores, logo, modelo "seguro" vs "assistência").

---

### 2.5 FIPE — marcas / modelos / anos
```
GET https://sivisweb.com.br/Modulos/Seguro/ajax/fipejson.php
Query:
  contrato=028
  functionPage=<marcas|modelos|anos|valor>
  tipo=<1|2|3>              # 1=carro 2=moto 3=caminhão?
  tipoFipe=<carros|motos|caminhoes>
  codMarca=<id>
  codAno=<ano>
  codModelo=<id>
  valor=<fipeValue>

→ 200 [{"Label":"Acura","Value":"1"},{"Label":"Agrale","Value":"2"},...]
```
Base FIPE do SIVIS. Já temos a nossa cópia local no Supabase + PlacaFIPE — não precisamos usar essa, mas vale saber que existe.

---

### 2.6 CRIAR LEAD ⭐
```
POST /loja/028/api/portal/crm
Content-Type: application/x-www-form-urlencoded; charset=UTF-8

body: functionPage=salvarLead
      nome=Arthur Oliveira
      celular=<telefone>
      procedencia=29                       # ID da origem (fonte do lead)
      veiculo[valor]=R$ 52.435,00          # formato BRL com "R$ "
      veiculo[marca]=Ford
      veiculo[modelo]=Ka 1.5 Sedan SE 12V Flex 4p Mec.
      veiculo[ano_modelo]=2021
      veiculo[codigo_fipe]=003463-0
      veiculo[combustivel]=Flex
      veiculo[mes_referencia]=setembro de 2026
      veiculo[sigla_combustivel]=F
      veiculo[id]=
      veiculo[consulta_fipe]=0
      veiculo[tipo_veiculo]=1              # 1=carro, 2=moto, 3=caminhão...
      veiculo[placa]=<placa>

→ 200 {"id":"661"}  # ← ID do lead no SIVIS, salvar em leads.sivis_id
```

**Observações:**
- Serialização aninhada: `veiculo[marca]=X` (PHP-style array)
- `procedencia` = origem do lead (consultor, Instagram, Facebook, indicação) — precisamos descobrir o enum
- Valor em formato BR (`R$ 52.435,00`) — vírgula decimal, ponto milhar
- Response devolve só `{"id": "..."}` — guardar como `leads.sivis_id`

---

### 2.7 Buscar produtos/planos pro veículo (cotação)
```
POST /loja/028/api/portal/produto
Content-Type: application/x-www-form-urlencoded; charset=UTF-8

body: functionPage=buscarServicos
      tipo_veiculo=1
      valor=52435                          # FIPE em reais (sem "R$")
      marca=22                             # id da marca FIPE
      ano_modelo=2021

→ 200 {"produtos":[{"id":"5","nome":"COTA 3.0","descricao":"<p>O melhor programa...","benefícios":...}]}
```
Lista COTAs disponíveis pra esse veículo + FIPE. (A gente já implementa cotação local com nossa tabela — pode servir como fallback/validação.)

---

### 2.8 Buscar veículo pela placa
```
GET /loja/028/api/portal/veiculo?functionPage=X&id_veiculo=Y&placa=Z

→ 200 {"status":true,"data":[...]}        # quando acha
→ 404 {"erro":"..."}                       # quando não acha
```
No HAR deu 404 com body `{"erro":"{\"status\":true,\"data\":[]}"}` — provavelmente placa nova que ainda não existe no banco SIVIS.

---

### 2.9 Template de mensagem WhatsApp
```
GET /loja/028/api/portal/crm?functionPage=<action>

→ 200 {"data":"*LOOG PROTEÇÃO VEICULAR*\n\nOlá ||A_nomp||, tudo bem?\n\n(i008) Você está prestes a fazer parte da Melhor Associação de Proteção Veicular..."}
```
Template oficial (com placeholders `||A_nomp||` que o backend substitui). A gente já tem nosso próprio PDF/mensagem — não precisa usar essa, mas é referência.

---

## 3. 🔴 O que FALTA no HAR

Esse HAR foi gravado durante uma sessão parcial. **Não contém:**

| Falta | Impacto no adapter | Como mapear |
|---|---|---|
| **Upload de documentos** (CNH, CRLV, comprov. residência) | Alto — bloqueia Fatia F completa | Gravar HAR fazendo upload no SIVIS |
| **Lista de pendências** do lead | Alto — não sabemos endpoint pra ler | Pedir pendências de um lead no SIVIS |
| **Resolver pendência** (automático via doc enviado) | Alto — não sabemos como marcar resolvida | HAR durante resolução de pendência |
| **Mudança de status** (lead → prospect → cliente) | Alto — crítico pro fluxo | HAR durante conversão de lead |
| **Lista de leads/propostas** do consultor | Médio — bom pra UI de carteira | HAR na tela principal |
| **Enum de `procedencia`** (origem do lead) | Baixo — vem do config | HAR na criação de lead variando origem |
| **Enum de `tipo_veiculo`** (1,2,3,4,5...) | Baixo — podemos inferir testando | Confirmar com HAR variado |
| **Cookie `ASP.NET_SessionId`** real | Alto — precisa pra validar login | HAR com DevTools modo "Preserve log" + checkbox "Include third-party cookies" |

---

## 4. Design proposto do `SivisHttpAdapter`

```typescript
// src/lib/sivis/http-adapter.ts
import { CookieJar } from "tough-cookie";
import { fetch as fetchWithCookies } from "fetch-cookie";

const BASE = "https://portal.sivisweb.com.br";
const LOJA = "028"; // LOOG

export interface SivisSession {
  jar: CookieJar;            // guarda ASP.NET_SessionId
  consultorId: string;       // dashboard/dashboard → usuario.id
  loja: string;              // "028"
}

export interface SivisCredentials {
  email: string;
  password: string;          // decryptado em memoria, nunca persistido no adapter
}

export class SivisHttpAdapter {
  async login(creds: SivisCredentials): Promise<SivisSession> {
    const jar = new CookieJar();
    const client = fetchWithCookies(fetch, jar);

    // 1. GET /loja/028/login — recebe cookie anonimo
    await client(`${BASE}/loja/${LOJA}/login`);

    // 2. POST login
    const loginRes = await this._post(client, "/api/portal/usuario", {
      functionPage: "restrictedArea",
      email: creds.email,
      password: creds.password,
    });
    const ok = (await loginRes.text()).trim();
    if (ok !== "true") throw new SivisAuthError("Login SIVIS recusou");

    // 3. POST criar sessao
    await this._post(client, "/api/dashboard/funcionario", {
      rapido: "0",
      functionPage: "criarSessaoConsultor",
    });

    // 4. GET dashboard pra pegar consultorId
    const dash = await client(`${BASE}/loja/${LOJA}/api/dashboard/dashboard?functionPage=index`, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    }).then((r) => r.text());
    const consultorId = JSON.parse(dash).usuario.id;

    return { jar, consultorId, loja: LOJA };
  }

  async createLead(s: SivisSession, lead: LeadInput): Promise<{ sivisLeadId: string }> {
    const res = await this._post(s, "/api/portal/crm", {
      functionPage: "salvarLead",
      nome: lead.contratante.nome,
      celular: this._stripPhone(lead.contratante.telefone),
      procedencia: lead.procedencia ?? "29",
      "veiculo[valor]": this._brl(lead.veiculo.valorFipeCents),
      "veiculo[marca]": lead.veiculo.marca,
      "veiculo[modelo]": lead.veiculo.modelo,
      "veiculo[ano_modelo]": String(lead.veiculo.anoModelo),
      "veiculo[codigo_fipe]": lead.veiculo.fipeCode,
      "veiculo[combustivel]": lead.veiculo.combustivel ?? "",
      "veiculo[mes_referencia]": lead.veiculo.mesReferenciaFipe ?? "",
      "veiculo[sigla_combustivel]": lead.veiculo.siglaCombustivel ?? "",
      "veiculo[id]": "",
      "veiculo[consulta_fipe]": "0",
      "veiculo[tipo_veiculo]": this._mapTipoVeiculo(lead.veiculo.tipo),
      "veiculo[placa]": lead.veiculo.placa,
    });
    const body = JSON.parse(await res.text());
    return { sivisLeadId: body.id };
  }

  async uploadDocument(s: SivisSession, sivisLeadId: string, doc: DocumentInput) {
    // TODO: ENDPOINT A DESCOBRIR (gravar HAR durante upload)
    throw new Error("not_implemented_yet");
  }

  async listPendencias(s: SivisSession, sivisLeadId: string) {
    // TODO: ENDPOINT A DESCOBRIR
    throw new Error("not_implemented_yet");
  }

  async resolvePendencia(s: SivisSession, sivisLeadId: string, pendenciaId: string, docId: string) {
    // TODO: ENDPOINT A DESCOBRIR
    throw new Error("not_implemented_yet");
  }

  async updateStatus(s: SivisSession, sivisLeadId: string, newStatus: "lead" | "prospect" | "cliente") {
    // TODO: ENDPOINT A DESCOBRIR
    throw new Error("not_implemented_yet");
  }

  // --- internals
  private async _post(s: SivisSession | typeof fetch, path: string, body: Record<string, string>) {
    const bodyStr = new URLSearchParams(body).toString();
    const client = typeof s === "function" ? s : fetchWithCookies(fetch, s.jar);
    return client(`${BASE}/loja/${LOJA}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": BASE,
        "Referer": `${BASE}/loja/${LOJA}/cliente`,
        "Accept": "application/json, text/javascript, */*; q=0.01",
      },
      body: bodyStr,
    });
  }

  private _brl(cents: number) {
    return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  private _stripPhone(phone: string) {
    return phone.replace(/\D/g, "");
  }
  private _mapTipoVeiculo(t: "carro" | "moto" | "utilitario" | "eletrico" | "caminhao"): string {
    const map = { carro: "1", moto: "2", utilitario: "4", eletrico: "5", caminhao: "3" };
    return map[t] ?? "1";
  }
}
```

### Como vai ser plugado no worker de sync (Fatia F)

```typescript
// sivis_sync_queue worker — rodando como cron Netlify / Supabase Edge Function
for (const job of pending) {
  const creds = await decryptSivisCreds(job.consultor_id); // AES-256
  const adapter = new SivisHttpAdapter();
  const session = await adapter.login(creds);              // cookie em memoria
  switch (job.action) {
    case "create_lead": {
      const r = await adapter.createLead(session, job.payload);
      await supabase.from("leads").update({ sivis_id: r.sivisLeadId, sivis_sync_status: "synced" }).eq("id", job.lead_id);
      break;
    }
    case "upload_doc": /* ... */ break;
    // ...
  }
}
```

Session **nunca** é persistida — vive apenas durante o job. Isso simplifica o modelo e evita vazamento se o banco der leak.

---

## 5. 🚨 Segurança — ações imediatas pro Luís

1. **Trocar a senha do SIVIS AGORA.** A senha foi digitada em chat anteriormente e também está no HAR exportado.
2. **Deletar os HARs antigos** do `Downloads/` depois que eu terminar a análise — eles contêm sessão + senha em texto claro.
3. O **cookie de sessão ASP.NET** do HAR (29/09) provavelmente já expirou, mas por garantia: **logar e deslogar** do SIVIS pelo menos uma vez após trocar a senha pra forçar nova sessão.

---

## 6. Próximos passos pra fechar o adapter

**Opção A — Mapeamento guiado via browser interno (rápido, 15-30min):**
1. Luís abre https://portal.sivisweb.com.br/loja/028/login no browser interno
2. Luís digita a senha
3. Claude navega e abre: cliente novo → upload CNH → upload CRLV → vira prospect → resolve pendência
4. Claude extrai os endpoints via DevTools Network

**Opção B — Novo HAR complementar (independente):**
1. Luís abre Chrome com DevTools → Network → "Preserve log" ✅ + "Include third-party cookies" ✅
2. Faz fluxo completo: login → novo lead → upload de 3 docs → promover a prospect → resolver uma pendência → voltar pra lead → mudar pra cliente
3. Exporta HAR → me manda

**Opção C — Documentação oficial:**
Se o SIVIS tem API documentada (contato com dev deles), seria o caminho mais seguro.

---

## 7. Resumo em uma frase

**O SIVIS é um app ASP.NET/IIS legacy com API `application/x-www-form-urlencoded` roteada por `functionPage`, autenticada por session cookie, loja `028`. Login + criação de lead já estão mapeados. Falta mapear upload de doc, pendências e mudança de status — resolvemos isso com 1 HAR complementar ou 30min de mapeamento no browser interno.**
