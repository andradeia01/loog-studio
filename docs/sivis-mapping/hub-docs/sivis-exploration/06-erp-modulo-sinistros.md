# SIVIS ERP — Módulo Sinistros (chamados "Eventos" na UX)

> Capturado em `/Modulos/Seguro/Sinistros.php` + `/Modulos/Seguro/js/Sinistro.js` + `/Modulos/Seguro/js/FormSinistros.js`
> Data: 2026-10-06 · Empresa 028 · Perfil ADMINISTRATIVO

**⚠️ SIVIS trata sinistro como "evento".** Toda UX usa "Evento". Modelo canônico: `Claim`.

---

## 1. Listagem

- **URL:** `/Modulos/Seguro/Sinistros.php`
- **Server-side (DataTables):** `/Modulos/Seguro/Sinistros_server_processing.php?imp=0&...filtros`
- **Estatísticas agregadas:** mesmo endpoint com `&getEstatisticas=S` (retorna um objeto chave→valor usado para preencher labels `#lbl_<key>`)

### Colunas

Nº Evento · Placa · Modelo · Dt.Evento · Prazo · Período Cont. · Proprietário · Cliente · **Ação do Evento** · Oficina Atual · Previsto · Status · Ação

### Filtros

| UI | Query |
|---|---|
| Data início/fim | `dti` / `dtf` |
| Busca | `Search` |
| Status Apresentação | `statusap` |
| Ação do Evento | `acao` |
| Oficina | `oficina` |
| Status Contratos | `sttus` |
| ID Cliente (filtro parent) | `idCli` |

### Mensagem fixa (campo escondido na página)

`#data_limite_sinistros` → "Período de carência de Eventos para cancelamento até dd/mm/yyyy" (regra de carência configurável).

---

## 2. Form de Sinistro (`FormSinistros.php?tipo=X&id=Y`)

Modal **668×800** em iframe. `tipo` é obrigatório na URL — sinistro tem **sub-tipos** diferentes com forms variantes.

### Campos principais

**Veículo (preenchido auto por lookup `getPlaca`):**
- `txtPlaca` (mask `AAA-9A99`) → **blur dispara** `GET /Modulos/Seguro/form/FormVistoriasServer.php?isAjax=S&getPlaca=X`
- Preenche: `txtIdVeiculo`, `txtIdPessoa`, `txtNome`, `txtCPF`, `txtTipo`, `txtMontadora`, `txtModelo`, `txtAnoMod`, `txtAnoFab`, `txtRenavam`, `txtChassi`, `txtCor`
- Status do associado: `fornecedores_status` → label visual via `atualizaStatusCli()`

**Endereço (ViaCEP/opencep):**
- `txtCep`, `txtEstado`, `txtCidade`, `txtEndereco`, `txtBairro`, `txtNumero`
- Dropdown cidade via `GET /Modulos/Comercial/locais.ajax.php?txtEstado=X&ajax=true`

**Dados do sinistro:**
- `txtEspecificacao` (Ação do Evento) — select, obrigatório
- `txtPara` (Responsável) — select, obrigatório
- `txtRelato` (Descrição da Ocorrência) — textarea, obrigatório
- `ckbGarantia` (radio) — se `=0` (não é garantia): `txtDataNota` e `txtNotaFiscal` (Boletim de Ocorrência) obrigatórios

**Responsável associado:**
- `txtResponsavel` (select) — se `=1` mostra `txtNomeAssociado` (autocomplete)
- Autocomplete: `GET /Modulos/CRM/ajax.php?q=TERMO&r=S&t=C`
- `txtIdAssociado` preenchido ao selecionar

**Datas de controle:**
- `txtData`, `txtHora`, `txtDataProximo`, `txtHoraProximo`, `txtDataFechamento`, `txtHoraFechamento`

### Status de Sinistro (txtStatusAp — selectivo)

| Valor | Label |
|---|---|
| 0 | Aguardando |
| 1 | Em Aberto |
| 2 | Em Reparo |
| 3 | Finalizado |
| 4 | Reprovado |
| 5 | Sindicância |
| 6 | Cancelados |
| 7 | Sub-Rogação |
| 8 | Indeferido |

### Status de Contrato (statusContratos)

Ativo · Inativo · Suspenso · Novo · Cancelado · Substituicao · Transferencia

### Status do Associado (visualizado no cabeçalho do sinistro)

SUSPENSO · CANCELADO · INATIVO · ATIVO EM ABERTO · DEPENDENTE EM ABERTO · ATIVO ABONO · ATIVO · EM FÉRIAS · DEPENDENTE · DESLIGADO · DESLIGADO EM ABERTO

Cada status tem CSS class correspondente para badge colorido.

---

## 3. Sub-recursos do sinistro (abas internas do form)

O form de sinistro **agrega** várias entidades. Modelo de dados anexo:

### 3.1 Documentos

- Lista: `GET /Modulos/CRM/ajax/Documentos_server_processing.php?id=X&type=Sinistros`
- Upload: `POST /Modulos/CRM/form/CRMDocumentos.php` (multipart, `btnSendFile=S`, `type=Sinistros`)
- Delete: `POST` mesmo endpoint com `btnDelFile=S`, `txtFileName=X`

### 3.2 Mensagens / Histórico (CRM-tipo thread)

- Lista: `GET /Modulos/CRM/mensagens.crm.ajax.php?codCrm=X&ajax=true`
- Add/enviar/delete: `POST /Modulos/CRM/mensagens.crm.controler.ajax.php` com `acao=0|1|2`
  - `acao=0` — adicionar
  - `acao=1` — enviar (para `txtIdPessoa` ou `txtIdAssociado`)
  - `acao=2` — excluir
- Mensagens têm flag `privado` (público/privado)
- Mensagem armazena: id, data, login_user, login_userp, status, mensagem, privado

### 3.3 Vistorias (sinistro → N vistorias)

- Lista: `GET /Modulos/Seguro/Vistorias_server_processing.php?idSin=X`
- Lançar nova: `POST /Modulos/Seguro/form/FormVistoriasServer.php` com `bntSave=S, isAjax=S, txtIdVeiculo, txtTipo, txtSinistro=X`
- Imagens da vistoria: `POST FormVistoriasServer.php` com `txtId=vistoria_id, isAjax=S, Imagens=S` → array de nomes de arquivo
- **Caminho físico das fotos:** `/Pessoas/{empresa}/Vistorias/{inspection_id}/{filename}`
- Adicionar imagem: upload via `#bntSendFile`
- Remover imagem: `POST form/FormVistoriasServer.php?isAjax=S&RemoverImg=NOME&txtId=X`
- Formatos aceitos: 3gp, mp4, imagens

### 3.4 Previsão de Custos

- Lista: `GET /Modulos/Seguro/ajax/Previsao_server_processing.php?id=X`
- Add: `POST /Modulos/Seguro/form/FormPrevisao.php` (multipart) com `bntSave=S, txtId, txt_dt_previsao, txtItemPrev, txtFornecPrev, txtQtdPrev, txtValorPrev`
- Delete: `POST FormPrevisao.php` com `btnDel=S, txtId=X`
- Agregações: soma quantidade × valor

### 3.5 Requisições (peças)

- Lista: `GET /Modulos/Estoque/Requisicoes_server_processing.php?filial=X&id=2&tp=null&com={sinistroId}`
- Form: `/Modulos/Estoque/FormRequisicoes.php?id=X` (abre em nova aba, não modal)

### 3.6 Cotações (peças)

- Lista: `GET /Modulos/Estoque/Cotacoes_server_processing.php?filial=X&id=2&tp=null&com={sinistroId}`
- Form: `/Modulos/Estoque/FormCotacoes.php?id=X`

### 3.7 Compras

- Lista: `GET /Modulos/Estoque/Compras_server_processing.php?filial=X&id=2&tp=null&com={sinistroId}`
- Agregações: número de compras, total, ticket médio

### 3.8 Contas Variáveis

- Lista: `GET /Modulos/Contas-a-pagar/Solicitacao-de-Autorizacao_server_processing.php?filial=X&F1=2&com={sinistroId}`
- Agregações: número de contas, total, ticket médio

### 3.9 Oficinas / Turmas

- Form server: `POST /Modulos/Seguro/form/OficinasFormServer.php` com `atualizaTurma=S, dtIni, dtFim, idTurma, idDesmatricula, idPessoa, idTele, idPlano`

---

## 4. Validações de negócio (do `validaForm()`)

- Veículo (via placa + lookup) é obrigatório
- Ação do Evento (`txtEspecificacao`) obrigatória
- Responsável pelo Evento (`txtPara`) obrigatório
- Descrição da Ocorrência (`txtRelato`) obrigatória
- Se **não é garantia** (`ckbGarantia=0`):
  - Data do B.O. (`txtDataNota`) obrigatória
  - Número do B.O. (`txtNotaFiscal`) obrigatório
- Garantia (`ckbGarantia=1`) desabilita campos de BO

---

## 5. Modelo de dados inferido

```ts
interface Claim {
  id: number;                       // "Nº Evento"
  type: number;                     // txtTipo da URL (ex: 1=colisão, 2=roubo, ...)
  specification: number;            // txtEspecificacao (Ação do Evento)
  responsible: number;              // txtPara
  description: string;              // txtRelato
  isWarranty: boolean;              // ckbGarantia
  policeReportDate?: Date;          // txtDataNota (B.O.)
  policeReportNumber?: string;      // txtNotaFiscal
  occurredAt: Date;                 // txtData + txtHora
  closedAt?: Date;                  // txtDataFechamento + txtHoraFechamento
  nextActionAt?: Date;              // txtDataProximo + txtHoraProximo
  statusPresentation: 0|1|2|3|4|5|6|7|8;  // Aguardando → Indeferido
  carencyLimit?: Date;              // data_limite_sinistros (regra)
  vehicle: {
    id: number; plate: string; brand: string; model: string;
    year: number; renavam: string; chassi: string; color: string;
  };
  owner: { id: number; cpf: string; name: string; status: ClientStatus };
  associate?: { id: number; name: string };  // responsible if different from owner
  address: Address;                 // onde ocorreu
  photos: InspectionPhoto[];        // via Vistorias filhas
  predictions: CostPrediction[];
  requisitions: PartsRequisition[];
  quotes: PartsQuote[];
  purchases: Purchase[];
  variableAccounts: AccountPayable[];
  documents: Document[];
  messages: ClaimMessage[];        // thread CRM
  workshops?: WorkshopAssignment[]; // oficinas atendendo
}

type ClientStatus =
  | 'ATIVO' | 'ATIVO_EM_ABERTO' | 'ATIVO_ABONO'
  | 'INATIVO' | 'SUSPENSO' | 'CANCELADO' | 'FERIAS'
  | 'DEPENDENTE' | 'DEPENDENTE_EM_ABERTO'
  | 'DESLIGADO' | 'DESLIGADO_EM_ABERTO';
```

**Observação sobre `tipo`:** o parâmetro `tipo` na URL (`FormSinistros.php?tipo=X`) controla qual variante do formulário é renderizada. Lista exata precisa ser capturada do dropdown "Tipo" ou do SQL. Hipótese: 1=Colisão, 2=Furto/Roubo, 3=Incêndio, 4=Danos a Terceiros, 5=Assistência, 6=Vidros, 7=Carro Reserva.

---

## 6. Insights estratégicos

### 6.1 Sinistro é um "projeto"

SIVIS modela sinistro como **container** que agrega:

- Vistorias (podem ser múltiplas: inicial, de dano, pós-reparo)
- Previsão de custo (orçamento interno)
- Requisições de peças (pedido ao estoque)
- Cotações de peças (cotação com fornecedores)
- Compras efetivas
- Contas a pagar (reembolso oficina/fornecedor)
- Documentos (BO, CRLV, laudo pericial)
- Thread de mensagens (histórico operacional)

Isso é mais robusto que a maioria dos sinistros corporativos — **replicar essa riqueza no HUB é esforço significativo mas crítico**.

### 6.2 B.O. é obrigatório fora de garantia

Fluxo bate com legislação: roubo/colisão sem BO não entra. Garantia (fabricante) é exceção.

### 6.3 Dependente / Em Férias

Status do associado tem granularidade incomum: "Em Férias" (não quer boleto temporariamente?), "Dependente" (dependente de titular), "Ativo Abono" (em perdão de inadimplência).

### 6.4 Oficinas são integradas via "Turmas"

`OficinasFormServer.php` referencia "turma" (termo escolar — provavelmente herdado de outro vertical SIVIS; nome vai ser retrabalhado no HUB para `WorkshopAssignment`).

### 6.5 Estoque é parte do fluxo

Peças (requisição → cotação → compra) usa o módulo Estoque. HUB precisa ter `packages/core/inventory` ou terceirizar via API.

### 6.6 Fotos em disco com path físico

`/Pessoas/{empresa}/Vistorias/{inspection_id}/{filename}` — SIVIS armazena em diretório físico. Migração para HUB vai requerer transferência em massa para Supabase Storage.

---

## 7. Mapeamento para o LOOG HUB

### `packages/core/claim/`

Modelo central + relações 1:N com Vistorias, Previsão, Requisição, Cotação, Compra, ContaPagar, Documento, Mensagem.

### `packages/core/inventory/`

Novo módulo para peças/compras (se não terceirizarmos). SIVIS tem workflow completo (Requisição → Cotação → Compra → Entrega).

### `packages/core/workshop-network/`

Rede de oficinas credenciadas + atribuição a sinistro.

### Diferenciais vs SIVIS

- Modelos canônicos em TypeScript (não "turma" para oficina)
- Status unificado (SIVIS tem 11 status cliente — talvez colapsar)
- Thread de mensagens com assinatura (quem viu, quem respondeu)
- Audit log imutável de mudanças de status
- Workflow BPMN-like declarativo (aberto → análise → aprovação → reparo → pagamento → encerramento)
- Fotos em CDN com watermark + GPS + hash + chain of custody

---

## 8. Endpoints inferidos (consolidado)

| Verbo | Rota | Função |
|---|---|---|
| GET | `/Modulos/Seguro/Sinistros_server_processing.php?imp=0&...` | Listagem DataTables |
| GET | mesmo com `&imp=1` | Imprimir / PDF |
| GET | mesmo com `&getEstatisticas=S` | KPIs do topo |
| GET | `/Modulos/Seguro/FormSinistros.php?tipo=X&id=Y` | Form (iframe) |
| POST | `/Modulos/Seguro/FormSinistros.php` | Salvar sinistro (ação pelo `btnSave` do form) |
| GET | `/Modulos/Seguro/form/FormVistoriasServer.php?isAjax=S&getPlaca=X` | Lookup veículo por placa (preenche form) |
| GET | `/Modulos/CRM/ajax.php?q=X&r=S&t=C` | Autocomplete associado |
| GET | `/Modulos/Comercial/locais.ajax.php?txtEstado=X` | Dropdown cidade |
| GET | opencep.com | CEP → endereço |
| GET | `/Modulos/CRM/ajax/Documentos_server_processing.php?id=X&type=Sinistros` | Lista documentos |
| POST | `/Modulos/CRM/form/CRMDocumentos.php` | Upload/delete documento |
| GET | `/Modulos/CRM/mensagens.crm.ajax.php?codCrm=X` | Lista mensagens |
| POST | `/Modulos/CRM/mensagens.crm.controler.ajax.php` | Add/enviar/delete mensagem |
| GET | `/Modulos/Seguro/Vistorias_server_processing.php?idSin=X` | Vistorias do sinistro |
| POST | `/Modulos/Seguro/form/FormVistoriasServer.php` com `txtSinistro=X` | Lançar vistoria vinculada |
| POST | `/Modulos/Seguro/form/FormVistoriasServer.php?isAjax=S&RemoverImg=X&txtId=Y` | Remover foto |
| GET | `/Modulos/Seguro/ajax/Previsao_server_processing.php?id=X` | Lista previsões |
| POST | `/Modulos/Seguro/form/FormPrevisao.php` | Add/delete previsão |
| GET | `/Modulos/Estoque/Requisicoes_server_processing.php?com=X` | Requisições do sinistro |
| GET | `/Modulos/Estoque/Cotacoes_server_processing.php?com=X` | Cotações do sinistro |
| GET | `/Modulos/Estoque/Compras_server_processing.php?com=X` | Compras do sinistro |
| GET | `/Modulos/Contas-a-pagar/Solicitacao-de-Autorizacao_server_processing.php?com=X` | Contas variáveis do sinistro |
| POST | `/Modulos/Seguro/form/OficinasFormServer.php` | Atribuir/atualizar oficina (turma) |

---

## 9. Pendente

- [ ] Capturar lista exata de `txtTipo` (tipos de sinistro) e `txtEspecificacao` (ação do evento)
- [ ] Modelo real de `txtResponsavel` + `txtPara` (talvez usuários SIVIS, talvez tipos)
- [ ] Fluxo de aprovação multi-step (sindicância, reaprovação, sub-rogação)
- [ ] Response shape dos endpoints `*_server_processing.php` (colunas devolvidas)
- [ ] Catalogo de ações de evento + regras por tipo
