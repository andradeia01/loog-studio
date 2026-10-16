# LOOG HUB — Análise Consolidada

> Documento mestre que amarra TUDO que foi mapeado, decidido e identificado como lacuna até agora.
> Fonte da verdade quando houver dúvida sobre o quê e o porquê do projeto.
> **Última atualização:** 2026-10-06

---

## Sumário

1. [Contexto e missão](#1-contexto-e-missão)
2. [Inventário completo do mapeamento SIVIS](#2-inventário-completo-do-mapeamento-sivis)
3. [Arquitetura técnica da SIVIS reconstruída](#3-arquitetura-técnica-da-sivis-reconstruída)
4. [Modelo de dados canônico derivado](#4-modelo-de-dados-canônico-derivado)
5. [O que a LOOG tem hoje no Desktop](#5-o-que-a-loog-tem-hoje-no-desktop)
6. [Lacunas no mapeamento](#6-lacunas-no-mapeamento)
7. [Decisões técnicas firmadas](#7-decisões-técnicas-firmadas)
8. [Riscos operacionais e técnicos](#8-riscos-operacionais-e-técnicos)
9. [Estimativa de esforço](#9-estimativa-de-esforço)
10. [Priorização e plano de ataque](#10-priorização-e-plano-de-ataque)
11. [Recomendações estratégicas](#11-recomendações-estratégicas)
12. [Diferenciais que o HUB pode entregar sobre o SIVIS](#12-diferenciais-que-o-hub-pode-entregar-sobre-o-sivis)

---

## 1. Contexto e missão

### 1.1 A empresa
- **LOOG Proteção Veicular** — associação sul-fluminense, CNPJ 55.577.669/0001-32
- Fundador: Halisson Emerick
- Diretor: Paulo (presidente@loogmais.com.br)
- Desenvolvedor contratado: Andrade (@axencode, andrade@axencode.com.br)
- SAC: (24) 99911-2888

### 1.2 O problema
LOOG opera no **SIVIS** (SIVIS Tecnologia · Volta Redonda, RJ · sivisweb.com.br) como loja 028. Três custos dessa dependência:

1. **Operacional** — mudança de regra/cobertura/taxa depende de ticket SIVIS
2. **Dado** — base de associados, histórico, sinistros, vistorias e leads moram em DB terceiro
3. **Estratégico** — SIVIS não evolui no ritmo da visão LOOG (super-app, doc 17 do Halisson)

Hinova apresentou proposta #13.166 em 2026-08-06 para migrar SIVIS → Hinova (APP Associado, APP Visto, Hinova Pay, Power CRM, SGA) por R$ 5.500 setup + mensalidade. **Recusada.** Trocar fornecedor por fornecedor não resolve.

### 1.3 Missão do HUB

Construir software proprietário da LOOG que **substitua o SIVIS no prazo mais curto possível**, mantendo todas as operações atuais sem downtime, com estratégia de migração zero-risco.

### 1.4 Escopo decidido
- **Track A (MVP imediato):** substituir SIVIS. 22 fluxos operacionais obrigatórios.
- **Track B (pós-SIVIS):** super-app com 11 verticais do doc 17 (Seguro, Combustível, Farmácia, Mercado, Oficina, Mobilidade, Aluguel, Telecom, Cartão, Poupança, Comunidade).
- Stack: Next.js 15 + Prisma + Supabase + PWA (apps/admin, apps/portal, apps/consultor, apps/vistoria).

---

## 2. Inventário completo do mapeamento SIVIS

A LOOG opera em **dois sistemas SIVIS**, mapeados em profundidade:

### 2.1 Portal consultor (`portal.sivisweb.com.br/loja/028`)

Fonte: engenharia reversa de JS modular ESM via fetch com sessão autenticada.

**12 services JavaScript capturados** (ver `docs/sivis-exploration/03-portal-services-complete.md`):

| Service | Rota backend | Operações |
|---|---|---|
| `portal.service.js` | `/portal/portal` | getInfo, verificaSessao, logout |
| `usuario.sevice.js` | `/portal/usuario` | login (`restrictedArea`), buscar, salvar, atualizar, consulta, validador, modelo Usuario completo |
| `veiculo.service.js` | `/portal/veiculo` + ERP FIPE | BuscaPlaca + FIPE (marcas, modelos, anos, valor) |
| `produto.service.js` | `/portal/produto` | listaProduto, itemProduto, buscarServicos, buscarCoberturas, buscarCores, buscarCambio |
| `plano.service.js` | `/portal/plano` | salvarPlano, verificar/cancelar Cupom, salvarAcessorios, CancelarPlano, salvarCartao |
| `crm.service.js` | `/portal/crm` | salvarLead, getModeloWhats, enviaWhatsApp |
| `pagamento.service.js` | `/portal/pagamento` + `/dashboard/pagamento` | processarPagamento, alterarCartao, verificaMulta |
| `pendencia.service.js` | `/dashboard/pendencia` | **getListaPendencias, finalizarAdesao, cancelarAdesao, enviarContratoWhatsapp, enviarVistoriaWhatsapp, saveUpload, getListaAvarias** |
| `endereco.service.js` | `/portal/endereco` + opencep.com | Estados, cidades, CEP |
| `dashboard.service.js` | `/dashboard/dashboard` | GetDashboard |
| `funcionario.service.js` | `/dashboard/funcionario` | criarSessaoConsultor, convertLeadProspect, inativarUsuario, verificaEmail, GetComissaoFuncionario, getProspectLead |
| `admin.service.js` | `/dashboard/usuario` + `/dashboard/veiculo` | **trocarSessao (admin↔consultor), getVeiculos admin** |
| `mensalidade.service.js` | `/dashboard/plano` + `/dashboard/pagamento` | listaMensalidades, listaPlanos, inicioFormaPagamento, alterarFormaPagamento, listaMensalidadesAdmin, getTipoPagamentos, filtrosMensalidades |
| `agenda.service.js` | `/dashboard/agenda` | ListaAgenda, ListaDias, ListaHorariosLivres, SalvarAgendamento, Cancela, ListarAgendamentos, AgendamentoTipo, VerificaUsuarioAtivo |

**ERP FIPE** (separado em `sivisweb.com.br`): `/Modulos/Seguro/ajax/fipejson.php` com `getMarca, getModelo, getModeloPorAno, getVeiculo`.

### 2.2 ERP SIVIS Business (`sivisweb.com.br`)

Fonte: menu lateral + JS específico por página + inspeção de forms modais via iframe.

**42 rotas administrativas** (ver `docs/sivis-exploration/04-erp-sivis-business-map.md`):

- **BI (7):** Auditoria, Matrículas×Renovações, Churn, Inadimplência, Evasão, Rentabilidade, Mapa de Equipe
- **Administrativo (5):** Clientes, Fornecedores, Funcionários, Usuários, Indicadores + Comissão Clientes
- **Financeiro (8):** Contas Fixas, Contas Variáveis, Contas a Receber, Fluxo de Caixa, Comissões, Vendas, **Gerar Boletos**, Conciliação Bancária
- **Estoque (1):** Compras
- **CRM (2):** Leads, Prospects
- **Proteção (3):** Veículos, Vistorias, **Eventos (= Sinistros)**

**4 módulos engenhariam reversão em profundidade:**

| Módulo | Doc | Endpoints |
|---|---|---|
| Vistorias | `docs/sivis-exploration/05-erp-modulo-vistorias.md` | 7+ · DataTables + Form modal 580×1000 com 6 abas (Perfil Veículo, Danos/Avarias, Dados Principais, Localização, Observações, Validação) + **24 slots foto + GPS + assinatura + Leaflet** |
| Sinistros ("Eventos") | `docs/sivis-exploration/06-erp-modulo-sinistros.md` | 24+ · container multi-aba com Vistorias filhas, Previsão de Custo, Requisição de Peças, Cotação, Compras, Contas Variáveis, Documentos, Thread de Mensagens, Oficinas |
| Clientes | `docs/sivis-exploration/07-erp-modulo-clientes.md` | Listagem + filtros avançados (email/SMS marketing, grupos, 9 status) + reativar/excluir + massa |
| Boletos (Clube) | `docs/sivis-exploration/08-erp-modulo-boletos.md` | 9+ · Celcoin/Caixa/Sicredi · CNAB REM export · envio email massa · retorno bancário |

### 2.3 Fluxo de adesão descoberto no SIVIS

```
Lead (portal/crm · salvarLead)
  ↓ aceite + dados completos
Pendência (dashboard/pendencia · getListaPendencias)
  ↓ upload contrato (saveUpload)
  ↓ enviarVistoriaWhatsapp (link para o associado fazer vistoria pelo celular)
  ↓ enviarContratoWhatsapp (envio de contrato)
  ↓ finalizarAdesao
Associado ativo
  ↓ Gerar Boleto (Clube/gerar-BoletosForm · bntSave)
Mensalidade emitida
  ↓ CNAB export (bntSaveFile) → banco Celcoin/Caixa
Boleto no banco
  ↓ retorno via arquivo CNAB (Retorno-Banco)
Baixa automática
```

**Insight-chave:** vistoria SIVIS é **remota via WhatsApp** (não APP Visto nativo). HUB `apps/vistoria` pode ser **PWA via deep link** no WhatsApp, sem necessidade de app nativo.

---

## 3. Arquitetura técnica da SIVIS reconstruída

### 3.1 Topologia

```
┌────────────────────────────┐
│ portal.sivisweb.com.br      │  ← Portal SPA (ESM moderno) — consultor + associado
│  /loja/028/*                │     JS modular, DataTables, select2
│  (Vue-ish SPA sem framework)│
└────────────┬───────────────┘
             │ consome
             ▼
┌────────────────────────────┐
│  Backend API portal         │
│  /loja/028/api/*            │
│  functionPage=... pattern   │
└────────────┬───────────────┘
             │ consulta
             ▼
┌────────────────────────────┐
│  sivisweb.com.br (ERP core) │  ← SIVIS Business (login.php, index.php)
│  /Modulos/<area>/<page>.php │     PHP legado + jQuery 1.9.1 + Bootstrap 3
│  Multi-vertical:            │     DataTables server-side + fancybox iframe modal
│    Seguro, Clube, Academia, │     Chat interno via heartbeat 1s
│    CRM, BI, Comercial,      │
│    Financeiro, Estoque,     │
│    Contas-a-pagar           │
└────────────┬───────────────┘
             │ dados físicos
             ▼
┌────────────────────────────┐
│  /Pessoas/028/*             │  ← Diretório de arquivos por tenant
│    Empresa/Menu/logo.png    │     Fotos vistoria: /Vistorias/{id}/{file}
│    Vistorias/{id}/*.jpg|mp4 │
└────────────────────────────┘

Integrações descobertas:
- opencep.com (CEP → endereço)
- Celcoin + Caixa Local + Sicredi (boletos CNAB)
- WhatsApp (via `enviaWhatsApp` / `enviarContratoWhatsapp` / `enviarVistoriaWhatsapp`)
- FIPE (via ERP próprio Modulos/Seguro/ajax/fipejson.php)
```

### 3.2 Padrões arquiteturais do SIVIS

| Padrão | Observação |
|---|---|
| **functionPage polimórfico** | Um endpoint PHP recebe `functionPage` no body e dispara handler diferente — anti-REST, mas facilita backend monolítico |
| **DataTables server-side** | Toda listagem administrativa usa jQuery DataTables 1.9 com `sEcho, iDisplayStart, iDisplayLength, mDataProp_N` |
| **Modal fancybox iframe** | Forms de edição abrem em iframe modal — isolamento de contexto, mas difícil de debugar |
| **File-based tenancy** | Diretório `/Pessoas/{id}/*` para isolar assets por empresa — sem CDN, servido pelo próprio Apache |
| **Delete via GET query** | `?Del=X` — idempotência frouxa, atacável por CSRF |
| **Chat heartbeat síncrono** | `/Connections/chat.php?action=chatheartbeat` a cada ~1s — anti-WebSocket, caro |
| **Config via DOM hidden inputs** | `#api`, `#contrato`, `#erp` em `<input hidden>` lidos pelo JS |
| **Multi-tenant por URL path** | `/loja/028/*` — tenant hardcoded na URL |

### 3.3 Stack histórica identificada

- **Portal moderno:** HTML5, ES modules, Vue-ish patterns sem framework
- **ERP legado:** PHP (anos 2015-2017), jQuery 1.9.1 (2013), jQuery UI 1.10.1 (2013), Bootstrap 3.3.7 (2016), FontAwesome 4.7, moment.js, fullcalendar, select2, Leaflet, bootbox
- **Backend monolítico PHP + MySQL** (presumido — não confirmado)
- **Login path separado** (`/login.php` → `/login_vai.php`)
- **Produto comercial:** "SIVIS Finance" / "SIVIS Business" / "Proclubes" (nomes mistos)

---

## 4. Modelo de dados canônico derivado

Consolidando tudo que foi inferido:

```ts
// =============================
// Identity & Tenancy
// =============================
Tenant { id, name, cnpj, slug }
User { id, tenantId, username, email, role, createdAt }
Role { id, name, permissions[] }   // admin, consultor, associado, vistoriador, convidado

// =============================
// Associado (Member)
// =============================
Member {
  id, tenantId, matricula,         // matrícula visível tipo 10001
  type: 'PF' | 'PJ',
  name, cpf?, cnpj?, stateReg?, birthDate?, civilStatus?, gender?,
  email, phone,
  address: Address,
  status: MemberStatus,            // 9 base + variantes
  group: 'MIGRACAO' | 'OUTROS' | 'TERCEIROS' | null,
  parentMemberId?,                 // dependente
  responsibleUserId?,              // consultor atribuído
  indicator?,                      // quem indicou
  marketing: { emailOptIn, smsOptIn, whatsappOptIn },
  createdAt, updatedAt, deletedAt?
}
MemberStatus =
  'ATIVO' | 'ATIVO_CRED' | 'ATIVO_ABONO' | 'ATIVO_EM_ABERTO'
  | 'SUSPENSO' | 'CANCELADO' | 'INATIVO' | 'BLOQUEADO' | 'EXCLUIDO'
  | 'DEPENDENTE' | 'DEPENDENTE_EM_ABERTO' | 'FERIAS'
  | 'DESLIGADO' | 'DESLIGADO_EM_ABERTO'

Address { cep, street, number, complement, neighborhood, city, state }

// =============================
// Veículo
// =============================
Vehicle {
  id, tenantId, memberId,
  plate, type,                     // 1=carro 2=moto 3=caminhão
  brand, brandCode,
  model, modelCode,
  modelYear, modelYearCode, factoryYear,
  fuel, fuelInitial,
  color, cambio,
  fipeCode, fipeValueCents, fipeMonth,
  renavam, chassi,
  createdAt, deletedAt?
}
FipeSnapshot { vehicleId, codigoFipe, mesReferencia, valorCents, fetchedAt }

// =============================
// Produto / Plano / Cobertura (catálogo versionado)
// =============================
Product {                          // produto comercial (ex: COTA 3.0, PROTEÇÃO ESSENCIAL)
  id, tenantId, name, description, recommended,
  taxaAdesaoCents, valorMensalBaseCents,
  acessorios[], coberturas[],      // snapshots
  active, createdAt, deactivatedAt?
}
Coverage { id, name, descricao, valorCents, padrao, soPadrao }
Accessory { id, name, descricao, valorCents, padrao }
PricingRule { id, productId, vehicleType, faixaValorMin, faixaValorMax, formula, priority, versionedAt }

// =============================
// Lead → Quote → Pendência → Adesão
// =============================
Lead { id, tenantId, name, phone, procedenciaId, consultantId, status, createdAt }
Quote {
  id, leadId, productId, vehicleId,
  monthlyValueCents, joinFeeCents,
  snapshotCoverages[], snapshotAccessories[],
  pricingRuleId,                   // snapshot
  status: 'DRAFT' | 'GENERATED' | 'SENT' | 'ACCEPTED' | 'REJECTED',
  whatsappMessage, portalUrl, printUrl, pdfUrl,
  createdAt
}
Pendencia {                        // carrinho de adesão em processamento
  id, quoteId, memberId?, vehicleId,
  contractUrl?, inspectionUrl?,
  convenioIds[], acessorios[],
  status: 'IN_PROGRESS' | 'CONTRACT_SENT' | 'INSPECTION_SENT' | 'AWAITING_SIGNATURE' | 'FINALIZED' | 'CANCELLED',
  createdAt, finalizedAt?
}
Membership {                       // adesão ativa resultante
  id, memberId, vehicleId, productId,
  startDate, endDate?, cancelledAt?,
  snapshotPlan, snapshotCoverages[],
  numeroContrato,                  // visível/humano
  createdAt
}
Procedencia { id, name }           // origem do lead: INSTAGRAM, INDICAÇÃO, SITE, ...
Convenio { id, name, discountRule, commissionRule }

// =============================
// Financeiro (Billing + Dunning)
// =============================
Invoice {                          // boleto / mensalidade
  id, tenantId, membershipId, vehicleId,
  dueDate, amountCents,
  bank: 'CELCOIN' | 'CAIXA' | 'SICREDI' | 'ASAAS',
  wallet,                          // carteira do banco
  group: 'MIGRACAO' | 'OUTROS' | 'TERCEIROS',
  invoiceType: 'LOTE' | 'INDIVIDUAL' | 'DEPENDENTE',
  issuedAt?, exportedAt?, sentAt?, settledAt?, cancelledAt?,
  bankTitle,                       // nosso número
  cnabExportFile?, cnabReturnFile?,
  pixQrCode?, pixCopyPaste?,
  pdfUrl?, boletoBarcode?,
  status: InvoiceStatus
}
InvoiceStatus =
  'PENDING' | 'ISSUED' | 'EXPORTED' | 'SENT' | 'SEND_ERROR'
  | 'SETTLED' | 'CANCELLED' | 'OVERDUE'

Settlement { id, invoiceId, settledAt, amountPaidCents, source }
DunningStep { id, invoiceId, step, channel, sentAt, template }
Commission { id, consultantId, invoiceId, membershipId, parcelaNumber, planCents, serviceCents, productCents, totalCents, status, saleDate, paidAt? }

// =============================
// Vistoria
// =============================
Inspection {
  id, tenantId, memberId, vehicleId, pendenciaId?, claimId?,
  type: InspectionType,
  performedBy, responsibleUserId,
  vistoriadorExterno?,              // texto quando terceirizado
  scheduledAt?, performedAt,
  gpsLat, gpsLng,
  signatureHash?,
  photos: InspectionPhoto[24],      // slots fixos
  damages: InspectionDamage[],
  checklistAnswers: ChecklistAnswer[],
  status: InspectionStatus,
  reportPdfUrl?,
  vendaItemId?, funcionarioId?,     // vinculação ao financeiro (serviço cobrado)
  createdAt, approvedAt?, rejectedAt?
}
InspectionType = 'PREVIA_CARRO' | 'PREVIA_MOTO' | 'PREVIA_SISTEMA' | 'FINAL' | 'REVISTORIA' | 'SINISTRO'
InspectionStatus = 'PENDENTE' | 'EM_ANALISE' | 'APROVADA' | 'REPROVADA' | 'CANCELADA'
InspectionPhoto { slot: 0..23, fileUrl, hash, gpsLat, gpsLng, takenAt, isDamage }
InspectionDamage { id, inspectionId, description, photoUrl, severity, position }
ChecklistAnswer { id, inspectionId, itemId, value }
ChecklistItem { id, groupCode, name, vehicleType }   // ex: 31=Freio Disco Dianteiro

// =============================
// Sinistro / Claim
// =============================
Claim {
  id, tenantId, numeroEvento,
  type, specification,              // Ação do Evento
  responsibleType,
  description,
  isWarranty: boolean,
  policeReportDate?, policeReportNumber?,
  occurredAt, closedAt?, nextActionAt?,
  memberId, vehicleId, membershipId,
  address: Address,
  statusPresentation: 0..8,         // Aguardando → Indeferido
  carencyLimit?,
  totalEstimatedCents, totalActualCents,
  openedBy, closedBy?,
  createdAt
}
ClaimStatus = 'AGUARDANDO' | 'EM_ABERTO' | 'EM_REPARO' | 'FINALIZADO' | 'REPROVADO' | 'SINDICANCIA' | 'CANCELADO' | 'SUB_ROGACAO' | 'INDEFERIDO'

CostPrediction { id, claimId, date, item, supplier, qty, unitValueCents }
PartsRequisition { id, claimId, item, qty, status }
PartsQuote { id, claimId, supplierId, items[], totalCents, status }
Purchase { id, claimId, supplierId, items[], totalCents, paidAt? }
AccountPayable { id, claimId, supplierId, description, amountCents, dueDate, paidAt? }

Document { id, ownerType, ownerId, filename, mimeType, uploadedBy, uploadedAt }  // via CRMDocumentos
ClaimMessage { id, claimId, authorId, body, privado, createdAt, recipients[] }

WorkshopAssignment { id, claimId, workshopId, startAt, endAt, status }

// =============================
// Rede / Fornecedores
// =============================
Supplier { id, tenantId, cnpj, name, category, bankData, createdAt }
Workshop { id, supplierId, address, category, region, specialties[] }
AssistanceProvider { id, type, region, phones[], slaMinutes }  // 24h: guincho, chaveiro, pneu, mecânico

PartnerNetwork { id, type, name, location, benefits }  // oficinas credenciadas no app

// =============================
// Agenda / Agendamento
// =============================
Agenda { id, tenantId, name, type, capacityPerSlot }
AgendaSlot { id, agendaId, date, time, availableSlots, bookedCount }
Appointment { id, agendaSlotId, numeroContrato, memberId, status, createdAt }
AppointmentType { id, name }

// =============================
// Comunicação / Marketing
// =============================
Notification { id, tenantId, channel, template, payload, scheduledFor?, sentAt?, deliveredAt?, status }
NotificationTemplate { id, name, channel, body, variables }

MarketingList { id, tenantId, criteria, memberCount }
MarketingCampaign { id, listId, templateId, scheduledFor, sentAt, stats }

// =============================
// Eventos
// =============================
Event { id, tenantId, name, startDate, endDate, location, capacity }
EventRegistration { id, eventId, memberId, checkedInAt? }

// =============================
// Rastreamento operacional
// =============================
AuditLog { id, tenantId, actorId, entityType, entityId, action, before, after, timestamp }
Procedencia { id, name }           // INSTAGRAM, INDICAÇÃO, SITE, PARCEIRO, ...

// =============================
// Multi-tenant (preparado)
// =============================
// toda tabela carrega tenantId desde dia 1, RLS no Postgres ativa
```

---

## 5. O que a LOOG tem hoje no Desktop

### 5.1 Pastas absorvíveis (base de código reaproveitável)

| Pasta | Linhas aprox | Status | Papel no HUB |
|---|---|---|---|
| `APP Loog/` | ~8 telas HTML + 8 dev specs + 1 modais | 🟢 UI pronta | Base de `apps/portal` (portar para Next.js 15 + Tailwind + shadcn) |
| `SOFTWARE - LOOG PROTEÇÃO VEICULAR/` | Next.js 15 + Prisma + Postgres local + motor FIPE + motor pricing | 🟢 Backend funcional | Base de `apps/consultor` + `packages/core/{quote,fipe,vehicle}` |
| `SDR - LOOG - PROTEÇÃO VEICULAR/` | SDR AI (Zaia + Baileys + Claude) + **SivisWebQuoteProvider reverse-engineered completo** | 🟢 Funcional em produção com cloudflared tunnel | SDR fica externo; adapter SIVIS vai pra `packages/adapters/sivis` |
| `LOOG-STUDIO/` + `LOOG-STUDIO-DEPLOY/` | Gerador de artes para consultores (Sharp + templates) | 🟡 Útil | Módulo opcional de `apps/consultor` fase 2+ |
| `HALISSON - LOOG/` | Spec v0.2 do super-app (doc 17 — 605 linhas) + 90+ assets de brand/voz/conteúdo | 🟢 Referência estratégica | Alimenta `docs/14-roadmap-super-app.md` (Track B) |

### 5.2 Pastas marketing/lançamento (não absorvíveis como código)

- `GAME LOOG - IA/` — jogo HTML
- `LOOG-Apresentacao/` — apresentação institucional
- `.pptx` várias — apresentações comerciais
- `SDR` dentro do SDR folder — assets de content marketing

### 5.3 LOOG HUB atual

```
LOOG HUB/
├── README.md                              5 KB
├── SPEC.md                               19 KB   ← spec canônico Track A
├── ROADMAP.md                            10 KB   ← 7 fases
├── CHANGELOG.md                           2.5 KB
├── docs/
│   ├── 01-sivis-inventory.md             11 KB
│   ├── 02-arquitetura.md                  9 KB
│   ├── 05-design-system.md                8 KB
│   ├── 09-analise-consolidada.md         ESTE DOC
│   └── sivis-exploration/
│       ├── README.md + _template.md       4 KB   ← protocolo captura
│       ├── 01-comissionamento.md          4.5 KB
│       ├── 02-portal-services-inventory.md 11 KB
│       ├── 03-portal-services-complete.md 13 KB  ← 15 grupos endpoints portal
│       ├── 04-erp-sivis-business-map.md   7 KB   ← 42 rotas ERP
│       ├── 05-erp-modulo-vistorias.md    11 KB   ← endpoints + form
│       ├── 06-erp-modulo-sinistros.md    14 KB   ← endpoints + sub-recursos
│       ├── 07-erp-modulo-clientes.md      6 KB
│       └── 08-erp-modulo-boletos.md       8 KB   ← fluxo CNAB
├── apps/{admin,portal,consultor,vistoria}/.gitkeep
├── packages/{db,core,adapters,ui}/.gitkeep
├── tools/rea/                            (REA MCP reverse-engineering tool)
├── scripts/.gitkeep
└── .github/workflows/.gitkeep

Total documentação: ~108 KB em 13 arquivos .md
Repo git inicializado em branch main, 0 commits
```

---

## 6. Lacunas no mapeamento

### 6.1 Portal consultor (pequenas)
- Response **shape JSON real** dos endpoints DataTables (`GetComissaoFuncionario`, `getProspectLead`) — forma precisa que o backend devolve
- Catálogo exato dos valores de `txtTipo` do veículo (1=passeio, 2=moto?, 3=caminhão?)

### 6.2 Portal admin (precisaria conta admin da LOOG)
- Services vedados: boleto, cobrança, acordo, sinistro admin, convênio CRUD, fornecedor, rede atendimento, relatório, comunicação em massa, config/RBAC
- `trocarSessao(tipo)` existe — se consultor conseguir chamar com `tipo='admin'`, abriria todo o resto

### 6.3 ERP SIVIS Business (média)
- **Response JSON dos listadores** (`*_server_processing.php`) com shape real das colunas devolvidas
- **Modais** de edição (`Form*.php`) de módulos ainda não abertos:
  - Form de Cliente (`GerenciadorClientesForm.php`) — ficha completa, abas, uploads, histórico
  - Form de Veículo (`FormVeiculo.php`) — campos completos
  - Form de Fornecedor
  - Form de Comissão de Clientes
- Lista exata de valores dos selects (tipos de vistoria, ações de evento, especificações)
- **Módulos auxiliares não visitados:**
  - Fluxo de Caixa (`Fluxo-de-Caixa.php`)
  - Conciliação Bancária
  - Contas a Receber
  - BI (todos 7 relatórios)
  - Fornecedores
  - Convênios CRUD
  - Eventos / Agenda admin
  - Compras / Estoque
  - Mapa de Equipe

### 6.4 Técnicas (grandes)
- **Shape do CNAB** usado (240 vs 400 colunas, versão do layout)
- **Credenciais Celcoin** da LOOG — para HUB conseguir migrar sem perder histórico
- **Dump do DB SIVIS** — hoje só temos modelos inferidos; migração vai exigir dump real
- **Fluxo real de sinistralidade** (quem aprova, SLAs, alçadas)
- **Templates WhatsApp aprovados** — se LOOG já tem conta Meta Business API ou usa Baileys

### 6.5 Regulatórias
- Modelo jurídico exato (associação, cooperativa, clube) — impacta nomes de endpoints e termos de uso
- Status jurídico do contrato (regulamento vigente, versões)

---

## 7. Decisões técnicas firmadas

| # | Decisão | Base |
|---|---|---|
| 1 | **Track A primeiro (substituir SIVIS)**, Track B (super-app) é roadmap pós-MVP | Escolha do usuário |
| 2 | **Stack:** Next.js 15 + Prisma + Supabase + PWA | Continua `SOFTWARE - LOOG PROTEÇÃO VEICULAR/` + `APP Loog/` |
| 3 | **Monorepo pnpm + Turbo** | Escalabilidade do time |
| 4 | **4 apps** (`admin`, `portal`, `consultor`, `vistoria`) | 4 personas distintas |
| 5 | **Supabase Pro** ($25/mês) para dev + staging + MVP produção pequena | Barato, maneja RLS nativo |
| 6 | **Celcoin como PSP primário** no HUB | Continuidade operacional (LOOG já integra com Celcoin via SIVIS) |
| 7 | **Asaas como fallback** com split nativo para comissões | Diferencial sobre SIVIS |
| 8 | **Meta WhatsApp Cloud API oficial** (não Baileys) | Risco de ban + templates aprováveis |
| 9 | **Anthropic Claude** (vision + text) + fallback OpenAI | Já usado no SDR |
| 10 | **Multi-tenant preparado desde dia 1** (`tenantId` + RLS) | Fácil white-label futuro |
| 11 | **Snapshot imutável** em quote/membership (preços antigos preservados) | Compliance contábil |
| 12 | **Vistoria PWA via WhatsApp deep link** (não app nativo) | Confirmado pelo fluxo `enviarVistoriaWhatsapp` do SIVIS |
| 13 | **Delete por DELETE verb** (não GET `?Del=X`) | Diferencial de segurança sobre SIVIS |
| 14 | **Fila assíncrona para emissão de boleto em massa** | SIVIS faz loop no front; HUB usa Supabase Queue |
| 15 | **REA MCP mantido em `tools/`** como auxiliar de mapeamento | Instalado mas não registrado no agent |

---

## 8. Riscos operacionais e técnicos

| Risco | Severidade | Mitigação |
|---|---|---|
| **Mapeamento incompleto do admin SIVIS** (vistoria aprovação, sinistro workflow, financeiro completo) | Alta | Logar como admin SIVIS, refazer varredura. Alternativa: migração iterativa + manter SIVIS read-only por 90d |
| **Dump de dados do SIVIS complexo** | Alta | Negociar export com SIVIS (contratual) OU raspar via portal admin logado (lento mas viável) |
| **Celcoin pode negar relação direta sem SIVIS como intermediário** | Média | Validar com Celcoin cedo (fase 0). Fallback Asaas |
| **Templates WhatsApp Business não aprovados** | Média | Baileys como fallback (consciência do risco de ban) |
| **Resistência da equipe LOOG ao HUB** (30+ funcionários acostumados ao SIVIS) | Média | Treinamento + side-by-side 2 semanas + playbook interno |
| **Volume de associados maior que estimado** | Baixa | Supabase Pro escala verticalmente; 50k+ considerar Postgres dedicado |
| **Modelo jurídico "clube/associação" interpretado como seguro pela SUSEP** | Alta (regulatória) | Consultoria jurídica antes do go-live. Linguagem do HUB evita "apólice"/"seguro" — usa "proteção"/"contrato" |
| **Andrade bus-factor = 1** | Alta | Documentação obsessiva (já em curso) + spec-driven + segundo dev na fase 7 |
| **CNAB incompatível com Celcoin API moderna** | Média | Celcoin tem API REST + webhooks modernos; migrar para API em vez de CNAB |
| **Dados sensíveis do SIVIS retidos** (SIVIS Tecnologia pode se recusar a excluir após migração) | Média | Negociar via contrato + relatório LGPD |

---

## 9. Estimativa de esforço

Baseada no roadmap de 7 fases + 24 semanas:

| Fase | Dur. | Esforço (dev-week) | Complexidade |
|---|---|---|---|
| 0 — Fundação | 2sem | 2.5 | Baixa (scaffold + deploy) |
| 1 — Associado + Veículo + Portal V1 | 3sem | 4.5 | Média (schema + CRUD + portar HTMLs) |
| 2 — Cotação + Consultor | 3sem | 5.0 | Média-alta (pricing engine, FIPE cache, snapshots) |
| 3 — Boletos + Pay (Celcoin) | 3sem | 6.0 | Alta (integração CNAB/API, webhook, dunning) |
| 4 — Vistoria | 3sem | 5.0 | Alta (PWA offline, GPS, assinatura, fila sync) |
| 5 — Sinistros + Assistência 24h | 3sem | 7.0 | **Muito alta** (Claim é container com 9 sub-recursos) |
| 6 — Migração SIVIS | 3sem | 4.0 | Alta (dump + validação + dual-write + cutover) |
| 7 — Hardening | 4sem | 4.0 | Média (pentest, SLA, dashboards diretoria) |

**Total:** 24 semanas · ~38 dev-weeks

**Com 1 dev full-time (Andrade):** ~38 semanas realistas (versus 24 planejadas). **Recomendação:** segundo dev contratado nas fases 3-5 reduz prazo para ~26-28 semanas.

**Com equipe de 2 devs full-time + 1 QA parcial:** 20-22 semanas é factível.

---

## 10. Priorização e plano de ataque

### Imediato (próxima semana)

1. **Primeiro commit** no repo (todo o conteúdo atual)
2. **Scaffold Fase 0** — Supabase projeto + Prisma + 4 apps hello-world + CI
3. **Logar admin SIVIS** com Halisson/Andrade e completar mapeamento (vistoria aprovação, sinistro workflow, financeiro admin)

### Fase 0-1 (semanas 1-5)

4. Schema Prisma inicial com `Tenant, User, Member, Vehicle, Address, Role` + RLS
5. Portar as 8 telas do `/APP Loog/` para `apps/portal/`
6. CRUD associado + veículo no `apps/admin`
7. Deploy preview Vercel/Netlify
8. **Validar com Halisson** cadastro de 10 associados reais (migração manual inicial)

### Fase 2 (semanas 6-8)

9. Pricing engine em `packages/core/quote` (do `SOFTWARE - LOOG`)
10. Portal consultor (wizard cotação placa → FIPE → cliente → gerar)
11. Pipeline CRM (lead → quote → acceptance)
12. **Integração Meta WhatsApp Cloud** (template `cotacao_enviada` aprovado)
13. **Importar leads existentes** do SIVIS (fase 2 do dual-write)

### Fase 3 (semanas 9-11)

14. **Decidir Celcoin direto vs Asaas** (validação jurídica + comercial)
15. Modelo `Invoice` + fila de emissão
16. Webhook Celcoin de liquidação
17. Dunning D+3/D+7/D+15/D+30
18. Split comissão consultor

### Fases 4-5 (semanas 12-17)

19. PWA vistoria (offline-first, GPS, assinatura, 24 slots foto)
20. Workflow sinistro (Claim container + sub-recursos)
21. Rede 24h + acionamento assistência

### Fase 6 (semanas 18-20) — **crítica**

22. Script migração SIVIS completo
23. Ponto de corte D-day
24. SIVIS read-only 90d
25. Monitoramento intensivo primeiras 72h

### Fase 7 (semanas 21-24)

26. Pentest + LGPD review + DPO
27. Dashboards diretoria
28. Backup off-site
29. Playbook incidente

---

## 11. Recomendações estratégicas

### 11.1 Negociar com SIVIS cedo

Antes do fim da fase 0, **conversa formal com SIVIS Tecnologia**:
- Negociar dump de dados (SQL + arquivos) via contrato
- Negociar período de transição com API read-only
- Negociar exclusão formal de dados pós-migração (LGPD)

Se SIVIS cooperar: economia de ~4 semanas na fase 6.
Se não cooperar: raspagem via portal admin logado (mais lento, menos limpo).

### 11.2 Validar modelo jurídico cedo

Antes da fase 3 (Boletos):
- Consultoria com advogado especialista em associações
- Validar modelo de "proteção veicular associativa" (não "seguro")
- Revisar regulamento + termos de uso
- Confirmar que Celcoin aceita LOOG como cliente direto (CNPJ LOOG)

### 11.3 Decidir cedo o papel do SDR

O `SDR - LOOG` folder já roda em produção com cloudflared tunnel. Opções:

- (A) Deployar o SDR em Railway/Fly.io com URL permanente — mantém como está
- (B) Reescrever o SDR dentro do HUB (`apps/sdr` ou integrado em `apps/consultor`)
- (C) SDR fica externo mas migra do SivisWeb provider para HUB provider na fase 2

**Recomendação:** opção C. SDR continua autônomo mas usa `apps/consultor` API em vez do SIVIS a partir da fase 2.

### 11.4 Segundo desenvolvedor

Fase 3 (boletos + Celcoin) e fase 5 (sinistros) são picos de complexidade. Contratar segundo dev para esses períodos:
- Reduz prazo total em ~8-10 semanas
- Reduz risco bus-factor
- Permite spec-driven mais robusto (dois pares de olhos)

### 11.5 Comunicação com equipe LOOG

30+ funcionários atuais acostumados ao SIVIS. Fase 7 precisa:
- Treinamento prático (não apenas vídeo)
- Playbook de operação cotidiana (como fazer isso no HUB?)
- Side-by-side 2 semanas antes do corte
- Canal de bugs/sugestões direto
- Diretoria (Paulo, Halisson) usando HUB primeiro, dando exemplo

### 11.6 Diferencial competitivo

HUB não precisa ser "SIVIS mas em outra stack". **Deve ser melhor em dimensões específicas** desde o MVP:

1. **Associado tem app PWA de verdade** (não só portal web)
2. **Cotação em 3 minutos** (do SDR AI + wizard otimizado)
3. **Pix híbrido com liquidação segundos depois** (Celcoin + webhook)
4. **Dunning automatizado** por WhatsApp (SIVIS depende de operador)
5. **Dashboards executivos em tempo real** (SIVIS tem BI mas é slow)
6. **Vistoria com foto GPS assinada criptograficamente** (SIVIS usa file-based)
7. **Audit log imutável** de todas as mudanças sensíveis
8. **LGPD-ready** desde dia 1 (exportar meus dados, excluir conta)

---

## 12. Diferenciais que o HUB pode entregar sobre o SIVIS

| Dimensão | SIVIS | LOOG HUB |
|---|---|---|
| **Arquitetura** | PHP legado + jQuery 1.9 (2013) | Next.js 15 + React 19 + TypeScript strict |
| **Interface associado** | Portal web lento, sem app | PWA offline-first instalável no celular |
| **Vistoria** | WhatsApp link + fotos file-based | PWA offline + GPS criptográfico + checklist versionado |
| **Pagamento** | CNAB file-based + loop manual | API REST + webhook + fila assíncrona |
| **Delete** | GET `?Del=X` (frouxo) | DELETE verb + confirmação + audit log |
| **Multi-tenant** | Path-based `/loja/028/*` | tenantId + RLS + white-label pronto |
| **Snapshots** | ? (não visto) | Imutáveis (preço antigo preservado) |
| **Status cliente** | 9 base + variantes (confuso) | Workflow declarativo + transições válidas |
| **Chat interno** | Heartbeat 1s síncrono | Supabase Realtime ou canal próprio |
| **Comunicação em massa** | Loop email síncrono | Fila Supabase + webhook delivery |
| **Audit log** | Não evidenciado | Event-sourced imutável |
| **LGPD** | Não visto | "Exportar meus dados" + "Excluir conta" nativos |
| **Observabilidade** | — | Sentry + Vercel Analytics + Grafana (fase 7) |
| **Mobile vistoriador** | Via WhatsApp link | PWA offline com sync queue |
| **Dashboards diretoria** | BI batch (lento) | Supabase Realtime push |
| **Comissão** | Lançamento manual mensal | Split automático Asaas na liquidação |
| **FIPE** | Backend próprio (sivisweb/Modulos) | Parallelum cacheado + fallback oficial |
| **CEP** | opencep.com (gratuito, instável?) | ViaCEP + opencep fallback |
| **Validador público** | Query simples por campo | API pública versionada + rate limit + API keys para parceiros |
| **Modelos de dados** | Confuso (12 status cliente, "turma" para oficina) | TypeScript strict, naming canônico, documentado |

---

## 13. Próximas 3 ações recomendadas

1. **Commit inicial** no git repo com todo o conteúdo atual + mensagem denso explicando o estado da arte.
2. **Reunião com Halisson/Paulo** para alinhar: (a) negociação com SIVIS, (b) decisão Celcoin direto × Asaas, (c) validação jurídica, (d) possibilidade de segundo dev.
3. **Logar como admin SIVIS** e completar mapeamento dos módulos faltantes (boleto admin, sinistro aprovação, vistoria aprovação, financeiro) — última iteração de descoberta antes de começar implementação.

---

## 14. Métricas de sucesso (quando MVP for ao ar)

### Operacionais
- Uptime admin ≥ 99.5%
- Uptime portal associado ≥ 99.9%
- Latência cotação placa→gerada ≤ 3s P95
- SLA assistência 24h ≤ 45min médio

### Financeiras
- Taxa de conversão lead → adesão
- Inadimplência D+30, D+60, D+90
- Churn mensal
- LTV, CAC, ratio
- Split pago a consultores (automatizado 100%)

### Produto
- DAU/WAU portal associado
- Taxa de uso de 2ª via boleto (sem contato com SAC)
- NPS pós-atendimento (sinistro, 24h, cotação)
- # downloads do PWA

### Técnicas
- Erros Sentry por semana ≤ 10
- Core Web Vitals verde em 4 apps
- Custo infra mensal (Supabase + Vercel + Netlify + Celcoin fees)
- Tempo médio de deploy (push → produção)
- Cobertura de testes ≥ 70% em `packages/core`

---

**Este documento é vivo.** Atualizar sempre que:
- Novo módulo SIVIS for mapeado
- Decisão técnica for revista
- Novo risco for identificado
- Fase do roadmap for concluída
- Métrica relevante for atingida
