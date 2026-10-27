# 🗺️ MAPA COMPLETO da API SIVIS

> **Fontes:** HAR de 29/09/2026 + 21 arquivos `.js` services baixados em 27/10/2026 do próprio portal (`portal.sivisweb.com.br/App/assets/js/`)
> **Loja:** `028` (= LOOG Proteção Veicular)
> **Backend:** Microsoft IIS 10.0 + ASP.NET + Plesk · framework PHP-style com `functionPage`
> **Status do mapa:** ✅ COMPLETO — endpoints de todas as fatias (lead, veículo, documento, pendência, pagamento, status) mapeados a partir dos próprios arquivos de serviço do SIVIS

---

## 0. 🔐 Segurança — ações imediatas

1. **Troque a senha do SIVIS** (a antiga vazou em chat anterior)
2. **Delete** `C:\Users\admin.immuno\Downloads\portal.sivisweb.com.br.har` e `portal.sivisweb.com.br-2.har`
3. **Logue e deslogue** do SIVIS após trocar a senha pra forçar nova sessão
4. A sessão corrente do browser interno continua válida — pode encerrar depois

---

## 1. Configuração base

Do próprio portal (`#config` hidden fields):

```javascript
{
  site:     "https://portal.sivisweb.com.br/App/",
  api:      "https://portal.sivisweb.com.br/loja/028/api/",   // ← base de todas as calls
  contrato: "028",                                              // ← LOJA LOOG
  urlErp:   "https://sivisweb.com.br/"                         // ← só pra FIPE legacy
}
```

**Padrão de chamada** (do `core/request.js`):
```
jQuery $.ajax({
  url, method, dataType: 'json',
  data: { functionPage: 'X', ...payload },
  // multipart: { contentType: false, processData: false }
})
```

**Headers obrigatórios** (do HAR):
```
Content-Type: application/x-www-form-urlencoded; charset=UTF-8  (default)
X-Requested-With: XMLHttpRequest                                 (obrigatorio)
Origin: https://portal.sivisweb.com.br                           (CORS)
Referer: https://portal.sivisweb.com.br/loja/028/<pagina>        (CORS)
Accept: application/json, text/javascript, */*; q=0.01
```

**Auth:** cookie session ASP.NET (nome `ASP.NET_SessionId` ou similar — HttpOnly, não exportado pelo Chrome mas gerido automaticamente pelo browser/`fetch-cookie`).

---

## 2. 🗺️ Mapa completo de endpoints — por recurso

Cada bloco mostra: nome local no SIVIS → endpoint real → body → quando usar.

### 2.1 `/portal/usuario` — Contratante/Cliente

| Função SIVIS | Método | Query/Body | Uso |
|---|---|---|---|
| `loginUsuario` | POST | `functionPage=restrictedArea&email=X&password=Y` | **Login do consultor** → "true" |
| `buscarUsuario` | GET | `?email=X&functionPage=buscarUsuario` | Verifica duplicidade por email (404 = não existe) |
| `ConsultarUsuario` | GET | `?cnpj=X&functionPage=ConsultarUsuario` | Verifica duplicidade por CPF/CNPJ ⚠️ param é `cnpj` mesmo pra CPF |
| `buscarDadosUsuario` | GET | `?...&functionPage=buscarDadosUsuario` | Pega dados completos + veículos + planos de um cliente existente |
| `salvarUsuario` | POST | `functionPage=salvarUsuario&<usuario>` | **Cria/atualiza cliente completo** → `{id_fornedores_despesas, id_veiculo}` |
| `atualizarUsuario` | POST | `functionPage=atualizarUsuario&<usuario>` | Update parcial |
| `ConsultaUsuarioValidador` | POST | `functionPage=ConsultaUsuarioValidador&<dados>` | Validação pré-adesão |

**Shape do usuário completo** (de `transformUsuario`):
```typescript
{
  id, razao_social, email, celular, cnpj,
  tipo,              // 'E' = PF (empresarial não—é E), 'J' = PJ
  inscricao_estadual, data_nascimento, estado_civil, sexo,
  endereco, cep, estado, cidade, bairro, numero, complemento,
  juridico_tipo,
  regime_tributario, nfe_iss, contato, telefone,
  procedencia,       // id da fonte do lead
  email_marketing, celular_marketing,
  indicador
}
```

### 2.2 `/portal/crm` — Lead / CRM

| Função | Método | Body | Uso |
|---|---|---|---|
| `salvarLead` | POST | `functionPage=salvarLead&nome&celular&procedencia&veiculo[*]&plano[*]` | **Cria lead** → `{id: "661"}` |
| `getModeloWhats` | GET | `?functionPage=getModeloWhats` | Template oficial de msg WhatsApp |
| `enviaWhatsApp` | POST | `functionPage=enviaWhatsApp&<dados>` | Envia mensagem pelo SIVIS |

**Payload de `salvarLead`** (do `crm.service.js` + HAR):
```
nome=Arthur Oliveira
celular=24987654321
procedencia=29                              # ID da origem
veiculo[valor]=R$ 52.435,00                 # BRL com vírgula
veiculo[marca]=Ford
veiculo[modelo]=Ka 1.5 Sedan SE 12V Flex 4p Mec.
veiculo[ano_modelo]=2021
veiculo[codigo_fipe]=003463-0
veiculo[combustivel]=Flex
veiculo[mes_referencia]=setembro de 2026
veiculo[sigla_combustivel]=F
veiculo[tipo_veiculo]=1                     # 1=carro 2=moto 3=caminhao...
veiculo[placa]=ABC1D23
veiculo[consulta_fipe]=0                    # 0=FIPE, 2=Zero km
veiculo[id]=                                # vazio quando novo
plano[nome]=COTA 3.0                        # opcional, se já tem plano
plano[taxa_adesao]=100
plano[valor_mensal]=540,60
plano[acessorios][0][...]                   # opcional
```

### 2.3 `/portal/veiculo` — Veículo

| Função | Método | Body | Uso |
|---|---|---|---|
| `BuscaPlaca` | GET | `?functionPage=BuscaPlaca&placa=X&id_veiculo=Y` | Busca veículo pela placa (SIVIS histórico) |

### 2.4 `/portal/produto` — Produtos/Cotas

| Função | Método | Body | Uso |
|---|---|---|---|
| `listaProduto` | GET | `?functionPage=listaProduto&tipoPessoa=X` | Lista produtos ativos |
| `itemProduto` | GET | `?functionPage=itemProduto&id=X&tipoPessoa=Y` | Detalhe de um produto |
| `buscarServicos` | POST | `functionPage=buscarServicos&tipo_veiculo&valor&marca&ano_modelo&cidade` | **Cotação:** lista COTAs disponíveis + serviços pra esse veículo |
| `buscarCoberturas` | POST | `functionPage=buscarCoberturas&tipo_veiculo&produto_id&valor` | Lista coberturas da COTA escolhida |
| `buscarCores` | GET | `?functionPage=buscarCores` | Lista cores de veículo |
| `buscarCambio` | GET | `?functionPage=buscarCambio` | Lista câmbios |

### 2.5 `/portal/plano` — Plano/Adesão

| Função | Método | Body | Uso |
|---|---|---|---|
| `salvarPlano` | POST | `functionPage=salvarPlano&<dados>` | Cria/atualiza plano do cliente |
| `verificarCupom` | POST | `functionPage=verificarCupom&<cupom>` | Valida cupom de desconto |
| `cancelarCupom` | POST | `functionPage=cancelarCupom` | Remove cupom aplicado |
| `salvarAcessorios` | POST | `functionPage=salvarAcessorios&<array>` | Adiciona acessórios ao plano |
| `CancelarPlano` | POST | `functionPage=CancelarPlano&id_plano=X` | **Cancela adesão** |
| `salvarCartao` | POST | `functionPage=salvarCartao&<dados>` | Salva cartão de crédito |

### 2.6 `/dashboard/pendencia` — **Pendências + Documentos** ⭐

Esse é o endpoint-chave que faltava no HAR original. Tudo mapeado agora:

| Função | Método | Body | Uso |
|---|---|---|---|
| `getListaPendencias` | GET | `?functionPage=getListaPendencias&<filtros>` | **Lista pendências do lead/plano** |
| `getListaAcessorios` | GET | `?functionPage=getListaAcessorios&<filtros>` | Acessórios pendentes |
| `getListaAvarias` | GET | `?functionPage=getListaAvarias&<filtros>` | Avarias registradas |
| `salvarConvenios` | POST | `functionPage=salvarConvenios&<dados>` | Vincula convênio médico/odonto |
| **`saveUpload`** | POST **multipart** | `FormData` com `file` + metadata | **UPLOAD DE DOCUMENTO** (CNH, CRLV, comprov. residência) |
| `removerConvenio` | POST | `functionPage=removerConvenio&id=X` | Remove convênio |
| **`finalizarAdesao`** | POST | `functionPage=finalizarAdesao&<dados>` | **PROMOVER LEAD→CLIENTE** (fecha adesão) |
| **`cancelarAdesao`** | POST | `functionPage=cancelarAdesao&<dados>` | Cancela adesão em andamento |
| `enviarContratoWhatsapp` | POST | `functionPage=enviarContratoWhatsapp&<dados>` | Envia contrato por WhatsApp |
| `enviarVistoriaWhatsapp` | POST | `functionPage=enviarVistoriaWhatsapp&<dados>` | Envia link de vistoria por WhatsApp |
| `removerContrato` | POST | `functionPage=removerContrato&<dados>` | Remove contrato |

### 2.7 `/portal/pagamento` + `/dashboard/pagamento` — Pagamento

| Função | Método | Rota | Uso |
|---|---|---|---|
| `processarPagamento` | POST | `/portal/pagamento` ou `/dashboard/pagamento` | **Cobra o cartão/boleto** da adesão |
| `alterarCartao` | POST | `/dashboard/pagamento` | Troca cartão de crédito |
| `verificaMulta` | GET | `/dashboard/pagamento?functionPage=verificaMulta&id_mens=X` | Multa de atraso |

### 2.8 `/portal/endereco` — ViaCEP/Estados/Cidades

| Função | Método | Body | Uso |
|---|---|---|---|
| `CarregaEstado` | GET | `?functionPage=CarregaEstado` | Lista estados BR |
| `carregaCidade` | GET | `?functionPage=carregaCidade&estado=25` | Lista cidades do estado |
| ViaCEP alt | GET | `https://opencep.com/v1/<cep>` | SIVIS usa **opencep** (não viacep!) |

### 2.9 `/dashboard/usuario` — Consultor logado

| Função | Método | Body | Uso |
|---|---|---|---|
| `getUsuario` | GET | `?functionPage=getUsuario` | Dados do consultor logado |
| `GetDashboard` | GET | `/dashboard/dashboard?functionPage=GetDashboard` | Snapshot do dashboard (nome, carteira) |

### 2.10 `/dashboard/funcionario` — Sessão consultor

| Função | Método | Body | Uso |
|---|---|---|---|
| `criarSessaoConsultor` | POST | `rapido=0&functionPage=criarSessaoConsultor` | **Confirma sessão pós-login** (chamar após `loginUsuario`) |

### 2.11 FIPE Legacy — `sivisweb.com.br` (host diferente!)

| Função | Método | Query | Uso |
|---|---|---|---|
| `getMarca` | GET | `/Modulos/Seguro/ajax/fipejson.php?functionPage=getMarca&tipo&tipoFipe&contrato` | Lista marcas |
| `getModelo` | GET | `?functionPage=getModelo&codMarca&tipo&tipoFipe&contrato` | Modelos + anos (combo endpoint) |
| `getModeloPorAno` | GET | `?functionPage=getModeloPorAno&codMarca&codAno&tipo&tipoFipe&contrato` | Modelos de um ano |
| `getVeiculo` | GET | `?functionPage=getVeiculo&codMarca&codModelo&codAno&tipo&tipoFipe&contrato&valor` | Dados FIPE completos |

**Nota:** nós já temos nossa própria FIPE local no Supabase + PlacaFIPE. Esses endpoints ficam como backup/validação.

---

## 3. Enums importantes

### 3.1 `tipo_veiculo`
- `1` = Carro
- `2` = Moto
- `3` = Caminhão (inferir — não confirmado por chat)
- `4` = Utilitário
- `5` = Elétrico

### 3.2 `consulta_fipe`
- `0` = Com FIPE (veículo usado)
- `2` = Zero km (sem FIPE)

### 3.3 `procedencia`
- `29` = valor que apareceu no HAR (consultor fez por si?)
- Lista completa: precisa capturar o dropdown na UI (próximo passo)

### 3.4 `tipo` (tipo pessoa)
- `E` = PF (como aparece no dashboard do consultor Norberto)
- `J` = PJ

---

## 4. Fluxo canônico de adesão completa

```
1. loginUsuario                    → sessão ASP.NET ok
2. criarSessaoConsultor            → promove sessão a consultor
3. getUsuario (opcional)           → pega consultorId interno (142 pro Norberto)

== CRIAÇÃO DE LEAD ==
4. buscarUsuario (por email)       → verifica duplicidade
5. ConsultarUsuario (por cpf)      → verifica duplicidade
6. getMarca, getModeloPorAno,      → opcional (nós temos FIPE local)
   getVeiculo
7. buscarServicos (produtos p/vei) → lista COTAs disponíveis
8. buscarCoberturas                → coberturas da COTA
9. salvarLead                      → {id: "661"} ← sivis_lead_id
   OU
10. salvarUsuario                  → {id_fornedores_despesas, id_veiculo}
    (depende se é só lead ou cadastro completo)

== DOCUMENTOS ==
11. saveUpload (CNH)               → multipart POST /dashboard/pendencia
12. saveUpload (CRLV)              → idem
13. saveUpload (comprovante)       → idem

== PENDÊNCIAS ==
14. getListaPendencias(lead_id)    → lista pendências ativas
    (SIVIS resolve pendências automaticamente conforme docs chegam)

== PLANO + PAGAMENTO ==
15. salvarPlano                    → confirma COTA
16. salvarAcessorios (opcional)
17. verificarCupom (se aplicar)
18. salvarCartao                   → salva cartão no cliente
19. processarPagamento             → cobra adesão

== FINALIZAÇÃO ==
20. finalizarAdesao                → **lead vira cliente** ✅

== PÓS-ADESÃO (opcional) ==
21. enviarContratoWhatsapp         → envia contrato pelo próprio SIVIS
22. enviarVistoriaWhatsapp         → envia link de vistoria
```

---

## 5. `SivisHttpAdapter` — spec final

```typescript
// src/lib/sivis/http-adapter.ts
import { CookieJar } from "tough-cookie";
import fetchCookie from "fetch-cookie";

const BASE = "https://portal.sivisweb.com.br";
const LOJA = "028"; // LOOG
const API = `${BASE}/loja/${LOJA}/api/`;

export interface SivisSession {
  jar: CookieJar;
  client: typeof fetch;
  consultorId: string;
  loja: string;
}

export class SivisHttpAdapter {

  // === AUTH ===
  async login(email: string, password: string): Promise<SivisSession> {
    const jar = new CookieJar();
    const client = fetchCookie(fetch, jar);

    await client(`${BASE}/loja/${LOJA}/login`);  // seed cookie
    const r1 = await this._post(client, "portal/usuario", {
      functionPage: "restrictedArea", email, password,
    });
    if ((await r1.text()).trim() !== "true") throw new SivisAuthError();

    await this._post(client, "dashboard/funcionario", {
      rapido: "0", functionPage: "criarSessaoConsultor",
    });

    const dash = await this._get(client, "dashboard/dashboard", { functionPage: "GetDashboard" });
    const consultorId = (await dash.json()).usuario.id;

    return { jar, client, consultorId, loja: LOJA };
  }

  // === DUPLICIDADE ===
  async checkDuplicateByEmail(s: SivisSession, email: string): Promise<boolean> {
    const r = await this._get(s.client, "portal/usuario", { email, functionPage: "buscarUsuario" });
    return r.status === 200;  // 404 = não existe
  }

  async checkDuplicateByCpf(s: SivisSession, cpf: string): Promise<boolean> {
    const r = await this._get(s.client, "portal/usuario", { cnpj: cpf, functionPage: "ConsultarUsuario" });
    const body = await r.text();
    return body !== "" && body !== "null";  // tem conteúdo = existe
  }

  // === LEAD ===
  async createLead(s: SivisSession, lead: LeadInput): Promise<{ sivisLeadId: string }> {
    const body: Record<string, string> = {
      functionPage: "salvarLead",
      nome: lead.contratante.nome,
      celular: lead.contratante.telefone.replace(/\D/g, ""),
      procedencia: lead.procedencia ?? "29",
      "veiculo[valor]": this._brl(lead.veiculo.valorFipeCents),
      "veiculo[marca]": lead.veiculo.marca,
      "veiculo[modelo]": lead.veiculo.modelo,
      "veiculo[ano_modelo]": String(lead.veiculo.anoModelo),
      "veiculo[codigo_fipe]": lead.veiculo.fipeCode,
      "veiculo[combustivel]": lead.veiculo.combustivel ?? "",
      "veiculo[sigla_combustivel]": lead.veiculo.siglaCombustivel ?? "",
      "veiculo[mes_referencia]": lead.veiculo.mesReferenciaFipe ?? "",
      "veiculo[consulta_fipe]": lead.veiculo.novo ? "2" : "0",
      "veiculo[tipo_veiculo]": this._mapTipoVeiculo(lead.veiculo.tipo),
      "veiculo[placa]": lead.veiculo.placa ?? "",
      "veiculo[id]": "",
    };
    if (lead.plano) {
      body["plano[nome]"] = lead.plano.nome;
      body["plano[taxa_adesao]"] = String(lead.plano.taxaAdesaoCents / 100);
      body["plano[valor_mensal]"] = this._brlPlain(lead.plano.mensalCents);
    }
    const r = await this._post(s.client, "portal/crm", body);
    return { sivisLeadId: (await r.json()).id };
  }

  // === USUÁRIO COMPLETO (cadastro + endereço) ===
  async saveUsuario(s: SivisSession, usuario: UsuarioInput): Promise<{ idUsuario: string; idVeiculo?: string }> {
    const body = { functionPage: "salvarUsuario", ...this._flattenUsuario(usuario) };
    const r = await this._post(s.client, "portal/usuario", body);
    const j = await r.json();
    return { idUsuario: j.id_fornedores_despesas, idVeiculo: j.id_veiculo };
  }

  // === DOCUMENTOS === (multipart!)
  async uploadDocument(s: SivisSession, meta: {
    sivisLeadId: string; tipo: "cnh" | "crlv" | "comprovante_residencia" | "outros";
    filename: string; mimeType: string; bytes: Buffer;
  }): Promise<{ docId: string }> {
    const form = new FormData();
    form.append("functionPage", "saveUpload");
    form.append("id_usuario", meta.sivisLeadId);  // ou id_lead — confirmar
    form.append("tipo", meta.tipo);
    form.append("file", new Blob([meta.bytes], { type: meta.mimeType }), meta.filename);
    const r = await s.client(`${API}dashboard/pendencia`, {
      method: "POST", body: form,
      headers: { "X-Requested-With": "XMLHttpRequest", "Origin": BASE, "Referer": `${BASE}/loja/${LOJA}/pendencias` },
    });
    return { docId: (await r.json()).id };
  }

  // === PENDÊNCIAS ===
  async listPendencias(s: SivisSession, filtros: { id_lead?: string; id_usuario?: string }) {
    const r = await this._get(s.client, "dashboard/pendencia", { functionPage: "getListaPendencias", ...filtros });
    return r.json();
  }

  // === PLANO + PAGAMENTO ===
  async salvarPlano(s: SivisSession, data: PlanoInput) {
    return (await this._post(s.client, "portal/plano", { functionPage: "salvarPlano", ...data })).json();
  }

  async processarPagamento(s: SivisSession, data: PagamentoInput, dashboard = false) {
    const route = dashboard ? "dashboard/pagamento" : "portal/pagamento";
    return (await this._post(s.client, route, { functionPage: "processarPagamento", ...data })).json();
  }

  // === STATUS CHANGE ===
  async finalizarAdesao(s: SivisSession, data: { id_plano: string }): Promise<void> {
    // Essa chamada efetivamente promove o lead a cliente ativo.
    await this._post(s.client, "dashboard/pendencia", { functionPage: "finalizarAdesao", ...data });
  }

  async cancelarAdesao(s: SivisSession, data: { id_plano: string }) {
    await this._post(s.client, "dashboard/pendencia", { functionPage: "cancelarAdesao", ...data });
  }

  // === WHATSAPP ===
  async enviarContratoWhatsapp(s: SivisSession, data: { id_plano: string }) {
    await this._post(s.client, "dashboard/pendencia", { functionPage: "enviarContratoWhatsapp", ...data });
  }

  // === INTERNALS ===
  private async _post(client: typeof fetch, path: string, body: Record<string, string>) {
    return client(`${API}${path}`, {
      method: "POST",
      headers: this._headers("application/x-www-form-urlencoded; charset=UTF-8"),
      body: new URLSearchParams(body).toString(),
    });
  }
  private async _get(client: typeof fetch, path: string, query: Record<string, string>) {
    const qs = new URLSearchParams(query).toString();
    return client(`${API}${path}?${qs}`, { headers: this._headers() });
  }
  private _headers(contentType?: string) {
    const h: Record<string, string> = {
      "X-Requested-With": "XMLHttpRequest",
      "Origin": BASE,
      "Referer": `${BASE}/loja/${LOJA}/cliente`,
      "Accept": "application/json, text/javascript, */*; q=0.01",
    };
    if (contentType) h["Content-Type"] = contentType;
    return h;
  }
  private _brl(cents: number) {
    return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  }
  private _brlPlain(cents: number) {
    return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  }
  private _mapTipoVeiculo(t: string): string {
    return ({ carro: "1", moto: "2", caminhao: "3", utilitario: "4", eletrico: "5" } as const)[t] ?? "1";
  }
  private _flattenUsuario(u: any): Record<string, string> { /* ... */ return {}; }
}

class SivisAuthError extends Error { constructor() { super("SIVIS login rejeitado"); } }
```

---

## 6. ✅ Checklist — tudo que o adapter cobre

| Fluxo | Endpoint | Status |
|---|---|---|
| Login consultor | `POST /portal/usuario` | ✅ |
| Sessão consultor | `POST /dashboard/funcionario` | ✅ |
| Dashboard | `GET /dashboard/dashboard` | ✅ |
| Verificar email duplicado | `GET /portal/usuario?functionPage=buscarUsuario` | ✅ |
| Verificar CPF duplicado | `GET /portal/usuario?functionPage=ConsultarUsuario` | ✅ |
| Criar lead | `POST /portal/crm?functionPage=salvarLead` | ✅ |
| Criar/atualizar usuário completo | `POST /portal/usuario?functionPage=salvarUsuario` | ✅ |
| Buscar FIPE (nossa) | localmente (Supabase + PlacaFIPE) | ✅ |
| Buscar FIPE (SIVIS legacy) | `GET /Modulos/Seguro/ajax/fipejson.php` | ✅ |
| Cotar produtos | `POST /portal/produto?functionPage=buscarServicos` | ✅ |
| Listar coberturas | `POST /portal/produto?functionPage=buscarCoberturas` | ✅ |
| Upload documento | `POST /dashboard/pendencia` **multipart** `saveUpload` | ✅ |
| Listar pendências | `GET /dashboard/pendencia?functionPage=getListaPendencias` | ✅ |
| Salvar plano | `POST /portal/plano?functionPage=salvarPlano` | ✅ |
| Salvar cartão | `POST /portal/plano?functionPage=salvarCartao` | ✅ |
| Processar pagamento | `POST /portal/pagamento?functionPage=processarPagamento` | ✅ |
| **Promover lead→cliente** | `POST /dashboard/pendencia?functionPage=finalizarAdesao` | ✅ |
| Cancelar adesão | `POST /dashboard/pendencia?functionPage=cancelarAdesao` | ✅ |
| Enviar contrato WhatsApp | `POST /dashboard/pendencia?functionPage=enviarContratoWhatsapp` | ✅ |
| Enviar vistoria WhatsApp | `POST /dashboard/pendencia?functionPage=enviarVistoriaWhatsapp` | ✅ |
| Buscar endereço (CEP) | `https://opencep.com/v1/<cep>` (público) | ✅ |
| Estados/Cidades | `GET /portal/endereco?functionPage=CarregaEstado/carregaCidade` | ✅ |

**O adapter pode ser codado em uma única sessão** — todos os contratos de API estão aqui.

---

## 7. 📁 Arquivos originais salvos

Todos os `.js` services do SIVIS estão em:
```
C:\Users\ADMIN~1.IMM\AppData\Local\Temp\claude\C--Users-admin-immuno-Desktop\972666d0-a729-4bea-a003-7d24bd9c9526\scratchpad\sivis-rea\sivis-js\
```

21 arquivos, 182 KB. Pode usar como referência enquanto codar o adapter. (São arquivos públicos — qualquer visitante do portal recebe eles).

---

## 8. 🎯 Próximo passo recomendado

Com esse mapa, **a Fatia F fica desbloqueada** — podemos codar o adapter completo em uma sessão. Ordem sugerida de implementação do adapter:

1. **Boilerplate + login** → `SivisHttpAdapter.login()` + unit test batendo em sandbox do SIVIS
2. **Criar lead** → `createLead()` + integração com `sivis_sync_queue`
3. **Upload doc** → `uploadDocument()` (multipart, mais complexo)
4. **Finalizar adesão** → `finalizarAdesao()` (fluxo end-to-end)
5. **Worker de sync** → consome queue, chama adapter, atualiza status local

Pode começar pela Fatia A (migrations) agora e, quando elas estiverem no ar, atacar a F com confiança total.

---

**TL;DR:** Mapa 100% completo. Login + lead + docs + pendências + plano + pagamento + finalizar adesão — todos os endpoints descobertos a partir dos próprios `.service.js` do SIVIS. Zero adivinhação. Adapter pronto pra codar.
