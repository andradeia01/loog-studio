# SIVIS — Portal Services JS Inventory

> Capturado via `fetch('/App/assets/js/service/*.service.js')` com sessão de consultor logada.
> O portal SIVIS expõe módulos JavaScript (ESM) com os endpoints hardcoded. Engenharia reversa 10x mais rápida.
> Data: 2026-10-06 · Perfil usado: consultor (NORBERTO ANDRADE / id=142)

---

## 1. Arquitetura descoberta

Duas APIs backend separadas:

| Variável | Base URL | O que serve |
|---|---|---|
| `config.api` | `https://portal.sivisweb.com.br/loja/028/api/` | Portal consultor + associado (todas as rotas /portal/* e /dashboard/*) |
| `config.urlErp` | `https://sivisweb.com.br/` | ERP backend. Serve FIPE (`Modulos/Seguro/ajax/fipejson.php`). Provável sede de dados pesados (financeiro, sinistros, vistorias full) |

Config é injetado via inputs hidden na página:

```html
<input id="site" value="https://portal.sivisweb.com.br/App/" />
<input id="api" value="https://portal.sivisweb.com.br/loja/028/api/" />
<input id="contrato" value="028" />
<input id="erp" value="https://sivisweb.com.br/" />
<input id="cor_primaria" />  <!-- white-label por loja -->
<input id="cor_secundaria" />
<input id="cor_destaque" />
```

Padrão de request (todos services usam o core `./../core/request.js` — jQuery AJAX internamente):

- `GET` quando leitura, com `functionPage` como query param
- `POST` quando mutação, com `functionPage` no form body
- Resposta geralmente JSON (mesmo quando Content-Type vem `text/html`)

---

## 2. Services visíveis para perfil consultor

### 2.1 `portal.service.js` — autenticação e sessão

| Função | Verbo | Endpoint | functionPage |
|---|---|---|---|
| `getInfoPortal` | GET | `/portal/portal` | `getInfo` |
| `verificaSessaoUsuario(id_usuario)` | POST | `/portal/portal` | `verificaSessao` |
| `logout` | GET | `/portal/portal` | `logout` |

### 2.2 `dashboard.service.js` — dashboard

| Função | Verbo | Endpoint | functionPage |
|---|---|---|---|
| `getInfoDashboard` | GET | `/dashboard/dashboard` | `GetDashboard` |

### 2.3 `funcionario.service.js` — consultor + leads

| Função | Verbo | Endpoint | functionPage |
|---|---|---|---|
| `criarSessaoConsultor(data)` | POST | `/dashboard/funcionario` | `criarSessaoConsultor` |
| `convertLeadProspect(data)` | POST | `/dashboard/funcionario` | `convertLeadProspect` |
| `inativarUsuario(data)` | POST | `/dashboard/funcionario` | `inativarUsuario` |
| `verificaEmail(email)` | GET | `/dashboard/funcionario` | `verificaEmail` |

**Também observado em network** (não no .service.js mas disparado pela página de comissão):

- `GET /dashboard/funcionario?functionPage=GetComissaoFuncionario` — comissão do funcionário (DataTables server-side)
- `GET /dashboard/funcionario?functionPage=getProspectLead` — lista de leads/prospects

### 2.4 `veiculo.service.js` — veículo + FIPE

| Função | Verbo | Endpoint | functionPage |
|---|---|---|---|
| `getMarca(callback,...)` | GET | `{urlErp}Modulos/Seguro/ajax/fipejson.php` | `getMarca` |
| `getModeloOuAno(marca)` | GET | `{urlErp}Modulos/Seguro/ajax/fipejson.php` | `getModelo` |
| `getModeloPorAno(marca, ano)` | GET | `{urlErp}Modulos/Seguro/ajax/fipejson.php` | `getModeloPorAno` |
| `getInfoVeiculo(marca, ano, modelo, valor)` | GET | `{urlErp}Modulos/Seguro/ajax/fipejson.php` | `getVeiculo` |
| `getBuscaPlaca(placa)` | GET | `{api}portal/veiculo` | `BuscaPlaca` |

**Payload da FIPE (sivisweb.com.br/Modulos/Seguro/ajax/fipejson.php):**

Query comum: `tipo` (passeio=1, moto=2, caminhão=3?), `tipoFipe` (1=carro, 2=zero km), `contrato` (028)

Resposta de `getVeiculo`:
```json
{
  "Marca": "Fiat",
  "Modelo": "Siena 1.0/EX 1.0 mpi Fire/Fire Flex 8v",
  "AnoModelo": 2007,
  "Combustivel": "Gasolina",
  "SiglaCombustivel": "G",
  "CodigoFipe": "...",
  "Valor": "R$ 22.846,00",
  "MesReferencia": "outubro de 2026",
  "TipoVeiculo": 1
}
```

### 2.5 `produto.service.js` — planos e coberturas

| Função | Verbo | Endpoint | functionPage |
|---|---|---|---|
| `getListaProdutos(tipoPessoa)` | GET | `/portal/produto` | `listaProduto` |
| `getItemProduto({id, tipoPessoa})` | GET | `/portal/produto` | `itemProduto` |
| `getListaServicos({tipo_veiculo, valor, marca, ano_modelo, cidade, ...})` | POST | `/portal/produto` | `buscarServicos` |
| `getListaCoberturas({tipo_veiculo, produto_id, valor})` | POST | `/portal/produto` | `buscarCoberturas` |
| `getListaCores` | GET | `/portal/produto` | `buscarCores` |
| `getListaCambio` | GET | `/portal/produto` | `buscarCambio` |

### 2.6 `plano.service.js` — plano escolhido pelo cliente

| Função | Verbo | Endpoint | functionPage |
|---|---|---|---|
| `salvarPlano(data)` | POST | `/portal/plano` | `salvarPlano` |
| `verificarCupom(data)` | POST | `/portal/plano` | `verificarCupom` |
| `cancelarCupom(data)` | POST | `/portal/plano` | `cancelarCupom` |
| `salvarAcessorios(data)` | POST | `/portal/plano` | `salvarAcessorios` |
| `cancelarPlanoUsuario(id_plano)` | POST | `/portal/plano` | `CancelarPlano` |

### 2.7 `crm.service.js` — CRM (lead + WhatsApp)

| Função | Verbo | Endpoint | functionPage |
|---|---|---|---|
| `salvarLead(data)` | POST | `/portal/crm` | `salvarLead` |
| `getModeloWhats` | GET | `/portal/crm` | `getModeloWhats` |
| `enviaWhatsApp(data)` | POST | `/portal/crm` | `enviaWhatsApp` |

### 2.8 `pagamento.service.js` — pagamento

| Função | Verbo | Endpoint | functionPage |
|---|---|---|---|
| `processarPagamento(data, dashboard=0)` | POST | `/portal/pagamento` ou `/dashboard/pagamento` | `processarPagamento` |
| `alterarCartao(data)` | POST | `/dashboard/pagamento` | `alterarCartao` |
| `getVerificaMulta(id_mens)` | GET | `/dashboard/pagamento` | `verificaMulta` |

### 2.9 `pendencia.service.js` — pendências e adesão

| Função | Verbo | Endpoint | functionPage |
|---|---|---|---|
| `getListaPendencias(data)` | GET | `/dashboard/pendencia` | `getListaPendencias` |
| `getListaAcessorios(data)` | GET | `/dashboard/pendencia` | `getListaAcessorios` |
| `getListaAvarias(data)` | GET | `/dashboard/pendencia` | `getListaAvarias` |
| `salvarConvenios(data)` | POST | `/dashboard/pendencia` | `salvarConvenios` |
| `saveUpload(data)` | POST | `/dashboard/pendencia` | upload de arquivo (multipart) |
| `finalizarAdesao(data)` | POST | `/dashboard/pendencia` | `finalizarAdesao` ★ chave: converte pendência em associado |
| `cancelarAdesao(data)` | POST | `/dashboard/pendencia` | `cancelarAdesao` |
| `removerConvenio(data)` | POST | `/dashboard/pendencia` | `removerConvenio` |
| `enviarContratoWhatsapp(data)` | POST | `/dashboard/pendencia` | `enviarContratoWhatsapp` |
| `enviarVistoriaWhatsapp(data)` | POST | `/dashboard/pendencia` | `enviarVistoriaWhatsapp` ★ link de vistoria pelo WhatsApp |
| `removerContrato(data)` | POST | `/dashboard/pendencia` | `removerContrato` |

### 2.10 `endereco.service.js` — ViaCEP + estados/cidades

| Função | Verbo | Observação |
|---|---|---|
| `buscarEstado`, `buscarEstados`, `carregaCidade`, `buscarCidadesPorEstado` | — | Catálogo IBGE |
| `buscarPorCep(cep)` | GET | Integração ViaCEP |
| `popularEnderecoViaCep`, `popularEndereco`, `transformEndereco` | — | Helpers |

### 2.11 `storage.service.js` — localStorage wrapper

`setItem(key, val)` · `getItem(key)` · `removeItem(key)` — persistência de rascunhos de cotação por consultor.

---

## 3. Insights estratégicos para o LOOG HUB

### 3.1 O ERP está num servidor separado

`sivisweb.com.br/Modulos/Seguro/ajax/fipejson.php` cheira a **ERP legado em PHP** (padrão `.php?functionPage=X`). A base de dados (associados, boletos, sinistros, vistorias) provavelmente mora ali. O portal `portal.sivisweb.com.br` é só a camada de apresentação pros consultores e associados.

**Impacto no HUB:** quando formos migrar dados, o endpoint-fonte dos registros reais é o ERP, não a API do portal.

### 3.2 Fluxo real de adesão SIVIS

```
Lead (salvarLead) → Pendencia (buscarServicos + buscarCoberturas + salvarAcessorios + salvarPlano)
                   ↓
                   saveUpload (contrato + vistoria)
                   ↓
                   enviarContratoWhatsapp / enviarVistoriaWhatsapp
                   ↓
                   finalizarAdesao → Associado ativo
                   ↓ (ou)
                   cancelarAdesao
```

**Vistoria no SIVIS é feita por WhatsApp** (`enviarVistoriaWhatsapp`): o consultor envia um link e o associado faz o checklist por lá. **Isso explica por que não vi menu "Vistoria" no perfil consultor** — ele dispara via WhatsApp.

### 3.3 Processamento de pagamento tem dupla rota

- `/portal/pagamento` = contexto associado (pagando mensalidade)
- `/dashboard/pagamento` = contexto consultor/admin (processando pagamento em nome do cliente, ex: adesão)

Flag `dashboard = 0|1` muda a rota. Serializar isso bem no `packages/adapters/sivis`.

### 3.4 Catálogo de produtos vem com cores + câmbio

`buscarCores`, `buscarCambio` sugerem que o cadastro de veículo no SIVIS pede cor + câmbio (automático/manual). Modelar no HUB.

### 3.5 Sem endpoint de "listar associados" no perfil consultor

O consultor vê **leads/prospects dele** (`getProspectLead`) e **pendências dele** (`getListaPendencias`). A listagem completa de associados ativos da LOOG só aparece no perfil **admin** — que não está mapeado ainda.

---

## 4. O que ainda falta (fora do perfil consultor)

Os seguintes services DEVEM existir no SIVIS mas estão vedados pro perfil consultor (precisa admin ou outro RBAC):

- Associado completo (listagem + ficha + histórico)
- Boletos (emissão, baixa, cancelamento, 2ª via em massa)
- Sinistros (abertura por admin, análise, aprovação, pagamento)
- Vistoria admin (não via WhatsApp — a análise/aprovação do laudo)
- Rede de atendimento (CRUD)
- Fornecedores
- Convênios (CRUD, não só vinculação)
- Eventos
- Relatórios financeiros/operacionais
- Comunicação em massa
- Config/RBAC/usuários do sistema

**Como descobrir:** logar com usuário admin da LOOG e refazer este dump (`fetch` em cada nome plausível). Alternativamente, interceptar o deploy do SIVIS (os JS vêm de `/App/assets/js/`) — admin possivelmente carrega mais services.

---

## 5. Services salvos (dump bruto)

Em `_sivis-ref/portal-services/` (gitignored):
- `portal.js`
- `dashboard.js`
- `funcionario.js`
- `veiculo.js`
- `produto.js`
- `plano.js`
- `crm.js`
- `pagamento.js`
- `pendencia.js`
- `endereco.js`
- `storage.js`
- `config.js`

Mantidos para auditoria durante implementação do `packages/adapters/sivis`.

---

## 6. Próximas ações

1. [ ] Logar como **admin SIVIS** (se houver conta) e refazer o dump para capturar os ~15 módulos faltantes.
2. [ ] Expandir `packages/adapters/sivis/` com adapters para cada service descoberto.
3. [ ] Smoke-test contra o SIVIS: cada endpoint tem um test que valida contrato (não quebra silenciosamente).
4. [ ] Replicar os functionPages descobertos em `packages/core/*` como contratos próprios do HUB (equivalente semântico, estrutura própria).
