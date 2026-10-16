# SIVIS Portal — Services JS (dump completo + endpoints consolidados)

> Captura: 2026-10-06 · Perfil: consultor (NORBERTO ANDRADE / loja 028 / consultor_id=142)
> Técnica: `fetch('/App/assets/js/service/*.service.js')` com sessão logada no browser.
> **Serve como fonte de verdade** para implementar `packages/adapters/sivis` no HUB.

---

## 1. Catálogo de endpoints descoberto

### 1.1 Portal API — `https://portal.sivisweb.com.br/loja/028/api/`

Convenções:
- Rotas `/portal/*` = contexto do associado logado.
- Rotas `/dashboard/*` = contexto do consultor/admin logado.
- `functionPage` é passado como query (GET) ou form (POST).
- Resposta: JSON (parsing ignora Content-Type).

#### 1.1.1 `/portal/portal`

| Verbo | functionPage | Entrada | Saída |
|---|---|---|---|
| GET | `getInfo` | — | Info da loja (branding, cores, SAC) |
| POST | `verificaSessao` | `id_usuario` | OK/401 |
| GET | `logout` | — | OK |

#### 1.1.2 `/portal/usuario`

| Verbo | functionPage | Entrada | Saída |
|---|---|---|---|
| POST | `restrictedArea` | `email, password` | `true` (login) + Set-Cookie |
| GET | `buscarUsuario` | `email` | Usuario base |
| GET | `buscarDadosUsuario` | `{id,email,...}` | Usuario completo + veiculos[] + planos[] |
| POST | `salvarUsuario` | Usuario dto | `{id_fornedores_despesas, id_veiculo}` |
| POST | `atualizarUsuario` | Usuario parcial | OK |
| POST | `salvarCartao` (via `/portal/plano`) | Dados cartão | OK |
| GET | `ConsultarUsuario` | search dict | Lista |
| POST | `ConsultaUsuarioValidador` | identifiers | Resultado validação |

**Modelo Usuario (via `transformUsuario`):**
```
id, razao_social, email, celular, inscricao_estadual, data_nascimento,
estado_civil, sexo, endereco, cep, estado, cidade, bairro,
juridico_tipo, numero, complemento, indicador
// opcionais:
cnpj, tipo, regime_tributario, nfe_iss, contato, telefone,
procedencia, email_marketing, celular_marketing
```

#### 1.1.3 `/portal/veiculo`

| Verbo | functionPage | Entrada | Saída |
|---|---|---|---|
| GET | `BuscaPlaca` | `placa, id_veiculo` | Veículo (ou 404) |

#### 1.1.4 `/portal/produto`

| Verbo | functionPage | Entrada | Saída |
|---|---|---|---|
| GET | `listaProduto` | `tipoPessoa` | `{produtos:[]}` |
| GET | `itemProduto` | `id, tipoPessoa` | Produto detalhado + parcelas |
| POST | `buscarServicos` | `tipo_veiculo, valor, cidade, marca, ano_modelo` | `{produtos, servicos}` |
| POST | `buscarCoberturas` | `tipo_veiculo, produto_id, valor` | `{coberturas, servicos}` |
| GET | `buscarCores` | — | Lista de cores de veículo |
| GET | `buscarCambio` | — | Lista de tipos de câmbio |

#### 1.1.5 `/portal/plano`

| Verbo | functionPage | Entrada | Saída |
|---|---|---|---|
| POST | `salvarPlano` | Plano dto | OK |
| POST | `verificarCupom` | `cupom` | Desconto aplicável |
| POST | `cancelarCupom` | `cupom` | OK |
| POST | `salvarAcessorios` | `acessorios[]` | OK |
| POST | `CancelarPlano` | `id_plano` | OK ou 404 |

#### 1.1.6 `/portal/crm` ★ (CRM / Lead)

| Verbo | functionPage | Entrada | Saída |
|---|---|---|---|
| POST | `salvarLead` | `{nome, celular, procedencia, veiculo:{...}, plano:{nome, taxa_adesao, valor_mensal, acessorios[]}}` | `{id}` do lead |
| GET | `getModeloWhats` | — | Template WhatsApp padrão |
| POST | `enviaWhatsApp` | `data` | OK (dispara envio) |

#### 1.1.7 `/portal/pagamento` + `/dashboard/pagamento`

| Verbo | Rota | functionPage | Observação |
|---|---|---|---|
| POST | `/portal/pagamento` | `processarPagamento` | Associado pagando mensalidade |
| POST | `/dashboard/pagamento` | `processarPagamento` | Consultor/admin processando pagamento |
| POST | `/dashboard/pagamento` | `alterarCartao` | — |
| GET | `/dashboard/pagamento` | `verificaMulta` | `id_mens` |
| GET | `/dashboard/pagamento?functionPage=ListaMensalidadesPorPlano` | — | `plano_id` |
| GET | `/dashboard/pagamento?functionPage=listaPlanos` | — | `tipo_veiculo` |
| GET | `/dashboard/pagamento` | `inicioFormaPagamento` | — |
| POST | `/dashboard/pagamento` | `alterarFormaPagamento` | `{id_plano, ...dados cartão/boleto/pix}` |
| GET | `/dashboard/pagamento` | `getTipoPagamentos` | Métodos aceitos |

#### 1.1.8 `/portal/endereco`

| Verbo | functionPage | Entrada | Saída |
|---|---|---|---|
| GET | `CarregaEstado` | — | Estados BR (código IBGE + sigla) |
| GET | `carregaCidade` | `estado` (código IBGE) | Cidades do estado |

Externo: `https://opencep.com/v1/{cep}` (CEP → logradouro).

#### 1.1.9 `/dashboard/dashboard`

| Verbo | functionPage | Entrada | Saída |
|---|---|---|---|
| GET | `GetDashboard` | — | KPIs do consultor |
| GET | `dashboard` | — | Visão admin (alt) |

#### 1.1.10 `/dashboard/funcionario` ★ (CRM + comissão)

| Verbo | functionPage | Entrada | Saída |
|---|---|---|---|
| POST | `criarSessaoConsultor` | `rapido=1` | `["ok"]` |
| POST | `convertLeadProspect` | `lead_id, ...` | Status |
| POST | `inativarUsuario` | `user_id` | OK |
| GET | `verificaEmail` | `email` | Existe? |
| GET | `GetComissaoFuncionario` | DataTables + `inicio, fim` | Comissões paginadas |
| GET | `getProspectLead` | DataTables + `inicio, fim` | Leads/prospects paginados |

#### 1.1.11 `/dashboard/usuario`

| Verbo | functionPage | Entrada | Saída |
|---|---|---|---|
| GET | `getUsuario` | — | Usuário logado + perfil |
| POST | `atualizarUsuario` | Usuario dto | OK |
| POST | `trocarSessao` ★ | `tipo` | Troca contexto (admin↔consultor) |

#### 1.1.12 `/dashboard/veiculo` (admin)

| Verbo | functionPage | Entrada | Saída |
|---|---|---|---|
| GET | `veiculos` | `{filtros}` | Lista de veículos (perfil admin) |

#### 1.1.13 `/dashboard/plano`

| Verbo | functionPage | Entrada | Saída |
|---|---|---|---|
| GET | `listaMensalidades` | `id_plano` | Mensalidades do plano (admin) |
| GET | `filtrosMensalidades` | — | Opções de filtro |

#### 1.1.14 `/dashboard/pendencia` ★ (Pendência / Adesão)

| Verbo | functionPage | Entrada | Observação |
|---|---|---|---|
| GET | `getListaPendencias` | `inicio, fim, busca, funcionario_id, cliente_id` | Lista principal |
| GET | `getListaAcessorios` | `pendencia_id` | Acessórios da adesão |
| GET | `getListaAvarias` | `pendencia_id` | Avarias registradas (vem da vistoria?) |
| POST | `salvarConvenios` | `pendencia_id, convenio_ids[]` | — |
| POST | `removerConvenio` | `pendencia_id, convenio_id` | — |
| POST | — (multipart) | `saveUpload` | Upload de arquivo (contrato PDF, foto vistoria) |
| POST | `finalizarAdesao` ★★ | `pendencia_id, dados contrato` | Converte pendência → associado ativo |
| POST | `cancelarAdesao` | `pendencia_id` | — |
| POST | `enviarContratoWhatsapp` | `pendencia_id, celular` | Dispara envio contrato |
| POST | `enviarVistoriaWhatsapp` ★ | `pendencia_id, celular` | Dispara link de vistoria (!!!) |
| POST | `removerContrato` | `pendencia_id` | Soft-delete |

#### 1.1.15 `/dashboard/agenda` (agendamento vistoria/serviço)

| Verbo | functionPage | Entrada | Observação |
|---|---|---|---|
| GET | `ListaAgenda` | `numero_contrato` | Agendas disponíveis para esse associado |
| GET | `ListaDias` | `id_agenda, data_inicio, numero_contrato` | Dias com vaga |
| GET | `ListaHorariosLivres` | `id_agenda, data_inicio, numero_contrato` | Horários |
| POST | `SalvarAgendamento` | `{...}` | Cria agendamento |
| GET | `CancelaAgendamento` | `id_agendamento, numero_contrato` | — |
| GET | `ListarAgendamentos` | `page, id_agenda, data_inicio, status, numero_contrato` | Histórico |
| GET | `AgendamentoTipo` | — | Tipos (vistoria, revistoria, etc.) |
| GET | `VerificaUsuarioAtivo` | — | Confere plano ativo |

### 1.2 ERP FIPE — `https://sivisweb.com.br/`

**Endpoint único:** `/Modulos/Seguro/ajax/fipejson.php` (GET, params em query)

| functionPage | Entrada | Saída |
|---|---|---|
| `getMarca` | `tipo, tipoFipe, contrato` | Array de marcas |
| `getModelo` | `tipo, tipoFipe, contrato, codMarca` | `{Modelos:[], Anos:[]}` |
| `getModeloPorAno` | `tipo, tipoFipe, contrato, codMarca, codAno` | Array modelos |
| `getVeiculo` | `tipo, tipoFipe, contrato, codMarca, codAno, codModelo, valor` | `{Marca, Modelo, AnoModelo, Combustivel, SiglaCombustivel, CodigoFipe, Valor, MesReferencia}` |

Parâmetros:
- `tipo` = 1 passeio / 2 moto / ...
- `tipoFipe` = 1 FIPE / 2 Zero km
- `contrato` = `028` (ID da loja)

---

## 2. Decisões derivadas para o LOOG HUB

### 2.1 Vistoria é por link WhatsApp no SIVIS

`enviarVistoriaWhatsapp(pendencia_id)` dispara um link que o associado abre no celular. **Não há "APP Visto"** no SIVIS — a vistoria é um fluxo web mobile enviado por WhatsApp. Para o HUB: `apps/vistoria` pode ser um fluxo PWA acessado via link único (deep link no WhatsApp), não precisa app nativo.

### 2.2 Agendamento é um módulo próprio

Vistoria/revistoria/serviço são agendados via `/dashboard/agenda`. Chave de ligação: `numero_contrato` (número do associado + plano). No HUB, `packages/core/scheduling/` resolve isso.

### 2.3 Pendência é a entidade central do fluxo de adesão

O ciclo real é:
```
Lead (/portal/crm salvarLead)
  → Pendência (/dashboard/pendencia getListaPendencias)
    → upload contrato + vistoria (saveUpload)
    → envio por WhatsApp (enviarContratoWhatsapp + enviarVistoriaWhatsapp)
    → finalizarAdesao → Associado ativo + Plano ativo
```

**Pendência = carrinho de adesão aberto**. Admin finaliza quando contrato assinado + vistoria concluída.

### 2.4 Avaria vem da vistoria

`getListaAvarias(pendencia_id)` retorna avarias registradas durante a vistoria. Modelar `Inspection → ChecklistAnswer[] + Damage[]`.

### 2.5 Perfis já visíveis

- `trocarSessao(tipo)` sugere que o SIVIS tem múltiplos perfis por mesmo usuário (admin, consultor, associado, etc.) e troca o contexto na mesma sessão. Útil para o HUB: um usuário pode acumular papéis (ex: consultor que é também associado).

### 2.6 FIPE está no ERP, não no portal

O portal consome a FIPE do backend ERP próprio da SIVIS (`sivisweb.com.br/Modulos/Seguro/ajax/fipejson.php`). Vale a pena **ignorar** essa dependência no HUB e usar **Parallelum** direto (mais estável e sem auth). Trocar `urlErp` por `parallelum.com.br/fipe/api/v1` quando migrar.

### 2.7 Pagamento híbrido

`alterarFormaPagamento` + `getTipoPagamentos` sugerem suporte a boleto, cartão (com `alterarCartao`), e Pix. Ver tabela de tipos quando capturarmos response.

### 2.8 CEP via opencep.com

SIVIS trocou ViaCEP por `opencep.com/v1/{cep}` (visto comentado no código). Mesmo contrato de resposta. Para o HUB: usar ViaCEP + fallback para opencep.

---

## 3. Services ainda não visíveis para o perfil consultor

Prováveis existentes mas limitados a admin (precisam de login admin):

- `/dashboard/boleto` ou `/dashboard/cobranca` — emissão + baixa de boleto
- `/dashboard/sinistro` — abertura, análise, aprovação
- `/dashboard/vistoria` — gestão (não o fluxo cliente, o lado interno)
- `/dashboard/fornecedor`
- `/dashboard/rede` ou `/dashboard/credenciado`
- `/dashboard/evento`
- `/dashboard/documento` ou `/dashboard/apolice`
- `/dashboard/relatorio`
- `/dashboard/convenio` (CRUD completo; o do consultor é só vinculação)
- `/dashboard/usuario` já visto parcialmente, pode ter mais funcionPages admin
- `/dashboard/notificacao` ou `/dashboard/comunicacao`

**Como completar:** logar como admin da LOOG (perfil mais alto) e refazer o fetch loop. Alternativa: inspecionar os JS files `/App/assets/js/pages/admin/*` se existirem.

---

## 4. Services salvos em disco

Em `_sivis-ref/portal-services/` (gitignored — contêm código proprietário da SIVIS):

```
portal.service.js
dashboard.service.js
funcionario.service.js
veiculo.service.js
produto.service.js
plano.service.js
crm.service.js
pagamento.service.js
pendencia.service.js
endereco.service.js
storage.service.js
usuario.sevice.js   (sic — typo original do SIVIS)
admin.service.js
mensalidade.service.js
agenda.service.js
config.js
```

---

## 5. Mapeamento de telas → services (como as páginas usam os services)

| Página SIVIS | URL | Services importados |
|---|---|---|
| Dashboard (principal) | `/loja/028/dashboard` | `dashboard` |
| Comissão | `/loja/028/comissao` | — (direto via `/dashboard/funcionario`) |
| Cliente/Cotação | `/loja/028/cliente` | `funcionario` + wizard (`veiculo`, `produto`, `plano`, `crm`) |
| Meus Clientes (Prospects) | `/loja/028/meus-clientes` | `funcionario`, `endereco`, `usuario` |
| Pendências | `/loja/028/pendencias` | `pendencia` |
| Validador | `/loja/028/validador` | `usuario` |
| Perfil | `/loja/028/perfil` | `admin`, `endereco` |
| Pagamento | `/loja/028/pagamento` | `mensalidade` |
| Agenda | `/loja/028/agenda` | `agenda` |

---

## 6. Próxima iteração

1. Baixar os JS de **páginas admin** (`/App/assets/js/pages/admin/*`) — provavelmente têm mais services importados.
2. Logar como admin → refazer o loop `fetch` para capturar services vedados.
3. Capturar **responses reais** de cada endpoint com dados mascarados (não só o shape — valores reais da LOOG) para informar seed/fixtures.
4. Começar implementação de `packages/adapters/sivis/*` espelhando cada functionPage descoberto.
