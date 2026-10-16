# SIVIS ERP — Módulos Auxiliares (Consolidado)

> Captura em lote dos módulos auxiliares do SIVIS Business via helper `scanModule()`.
> 2026-10-06 · Empresa 028 LOOG · Perfil ADMINISTRATIVO

Esse doc complementa `05-vistorias`, `06-sinistros`, `07-clientes`, `08-boletos` com os 12 módulos auxiliares restantes.

---

## 1. Veículos admin (`/Modulos/Seguro/Veiculos.php`)

**JS:** `/Modulos/Seguro/js/Veiculo.js`
**Endpoints:** `Veiculos_server_processing.php`, `FormVeiculos.php?id_pessoa=X`, `FormRastreador.php`

### Colunas
Placa · Modelo · **IMEI · Chip** (rastreador!) · Valor · CPF · Cliente · Plano · V.Plano · V.Add. · Validade · Status · Ação

### Catálogos completos (ouro para o HUB)

**Tipos de veículo (txtTipoVei):**
- 1 = Carro
- 2 = Moto
- 6 = Utilitário/Diesel
- 7 = Carros Elétricos

**Categoria de uso (txtCategoria):** Particular (1) · Aluguel (2) · **Aplicativo (3)** ← motorista de app

**Tipos de vistoria (txtTipoVis) — 9 valores completos:**
1. PRÉVIA - CARRO
2. REABILITAÇÃO - CARRO
3. PRÉVIA - MOTO
4. REABILITAÇÃO - MOTO
5. EVENTO - ABERTURA (sinistro)
6. EVENTO - FINALIZADO (sinistro)
7. INCLUSÃO DE VIDROS
8. INCLUSÃO DE PLACA - CARRO
9. INCLUSÃO DE PLACA - MOTO

**Filtros adicionais:**
- Assistência: Com / Sem
- **Rastreador: Com / Sem** (telemetria opcional)
- Vistorias: Concluídas / Pendentes / Sem Vistoria / Expiradas
- Status Apresentação: Pendente / Aguardando / Aprovados / Reprovados
- Status veículo: Ativo / Inativo / Suspenso / Novo / Cancelado / Substituição / Transferência

### Insights

- **Rastreador integrado:** campo IMEI + Chip no cadastro do veículo (SIVIS tem telemetria opcional)
- **Formulário separado:** `FormRastreador.php` dedicado para gestão de rastreador
- Veículos pertencem a Prospects (P) ou Clientes (C) — filtro `tpCli`

---

## 2. Fluxo de Caixa (`/Modulos/Contas-a-pagar/Fluxo-de-Caixa.php`)

**Endpoint:** `Fluxo-de-Caixa_server_processing.php`

### Colunas
Dt.Baixa · Loja · Banco · Tipo Documento · Fornec./Clientes · Histórico · Referência · **Crédito** · **Débito** · **Saldo**

### Catálogo: Tipos de Documento Financeiro (9 valores)

| ID | Tipo |
|---|---|
| 4 | TRANSF. BANCARIA |
| 5 | CHEQUE |
| 6 | DINHEIRO |
| 7 | CRÉDITO - MASTER |
| 9 | CARTÃO DE DÉBITO |
| 10 | **BOLETO CELCOIN** |
| 11 | DEBITO EM CONTA |
| 13 | PAGAMENTO RECORRENTE |
| 14 | **PIX CELCOIN** |

**Filtros:** Banco (Caixa Local × Celcoin), Operador (login de ~30+ funcionários), Conta Mov (MIGRAÇÃO/OUTROS/TERCEIROS), Tipo Data (RECEBIMENTO × VENDA)

---

## 3. Contas a Receber (`/Modulos/Contas-a-pagar/Contas-a-Receber.php?id=1&tp=0`)

**Endpoints:** `Contas-a-Receber_server_processing.php`, `renegociar.ajax.php`

### Colunas
Dt.Cd · F.Pg · Nr.Doc · Ns.Num (nosso número) · Vecto · Pagto · Parc · Cliente · Histórico · Org · Grupo · Contas · Parc · Baixa · Doc · Aviso

### Status (jumpMenu)
A Receber · Recebidas · **Renegociadas** · Canceladas

### Tipos de Busca (6 dimensões)
Clientes/Fornecedores · Centro de Custos · Grupo de Conta · Subgrupo de Conta · Forma de Pagamento · Grupo de Pessoas · Usuário Responsável

### Operações descobertas
- `renegociar(ids)` — renegocia dívida (abre workflow)
- `trocarCheque`, `repassarCheque`, `detalheCheque` — fluxo de cheque devolvido
- `listaEmails` / `listaSMS` — comunicação em massa com inadimplentes

### Tipos de Data
Dt.Venc. (0) · Dt.Pag. (1) · Dt.Cad. (2)

### Status cliente (filtro) — 7 variantes
Ativo · Ativo Credencial · Ativo Abono · Ativo Em Aberto · Suspenso · Cancelado · Inativo

---

## 4. Conciliação Bancária (`/Modulos/Contas-a-pagar/Conciliacao-Bancaria.php`)

**4 tabelas separadas** (banco vs sistema × Caixa vs Celcoin):

| Tabela | Papel | Colunas-chave |
|---|---|---|
| `tbRetorno` | Retorno banco Caixa | NSU, PA, Dt.Pagamento (duas), Valor Pago (duas), Razão Social, Caixa, For.Pag., **Num. Cartão, Bandeira** |
| `tbRetornoSistema` | Sistema registrou (Caixa) | Dt.Venda, Dt.Pagamento, Parcela, Valor Parcela, Valor Pago, Razão Social, Caixa, For.Pag., Usuário |
| `tbRetornoCel` | Retorno Celcoin | ID, Dt.Pagamento (dupla), Valor Pago (dupla), **Valor Liquido** (líquido pós-taxa), Razão Social, Caixa, For.Pag., Tipo |
| `tbRetornoSistemaCel` | Sistema registrou (Celcoin) | mesma estrutura |

### Insight

Conciliação é **manual** no SIVIS — comparação visual entre o que o banco diz e o que o sistema registrou. Celcoin devolve **valor líquido** separado (taxa já descontada).

**HUB diferencial:** conciliação automática via webhook Celcoin (dispara ao liquidar) + reconciliation report com discrepâncias.

---

## 5. Fornecedores de Despesas (`/Modulos/Financeiro/Fornecedores-de-despesas.php`)

**Tabela `tblLista`:** Cod · CNPJ · Nome/Razão Social · Endereço · Bairro · Cidade · UF · Tel. · E-mail · Ação

CRUD básico. Mesma estrutura visual dos outros módulos "Fornecedor-like" (Funcionários, Indicadores, Usuários).

---

## 6. Comissões admin (`/Modulos/Seguro/Comissoes.php`)

**Endpoints:** `Comissoes_clientes_all_server_processing.php`, `comissao.ajax.php`

### Colunas
Código · Dt.Venda · Usuário · Cliente · Val.Plano · Val.Serv. · Val.Prod. · C.Plano 1ª · C.Plano · C.Serv. · C.Prod. · C.Total · Aviso

### 🎯 Insight-chave: comissão multinível

Tipo (txtTipo) — quem recebe comissão:
1. **Usuário Funcionários** (consultor típico)
2. **Usuário Indicadores** (pessoa cadastrada como indicador)
3. **Usuário Prospects** (!!! prospect ainda não convertido recebe comissão por indicar)
4. **Usuário Clientes** (!!! cliente ativo recebe comissão por indicar amigo)

Isso é **Multi-level marketing (MLM) / rede de indicação** nativo. HUB precisa modelar isso explicitamente:
- `MemberCommissionRule` — regra por tipo de origem
- `IndicationNetwork` — grafo de quem indicou quem
- `CommissionLevel` — nível 1 (direto), nível 2 (indireto), N níveis

### Status comissão (txtForma)
Todas · Geradas · A Gerar · Aguardando · **Reprovadas** (admin pode reprovar)

### Exibir por (txtExibir)
Usuário Comissão · Usuário Responsável (quem fica com ela)

---

## 7. Lead admin (`/Modulos/CRM/Lead.php`)

**Endpoint:** `Lead_server_processing.php`

### Colunas
Data Cad. · Nome/Razão Social · Tel. · E-mail · **Procedência** · Status · Indicador · Usuário Resp. · Ação

### Status (txtStatus) — 4 valores
AGUARDANDO (0) · CONV.PROSPECT (1) · CONV.CLIENTE (2) · INATIVO (3)

### 🎯 Procedências descobertas (catálogo completo — 14+ valores)

| ID | Procedência |
|---|---|
| 34 | 1 ANO DE PROTEÇÃO GRÁTIS (campanha específica) |
| 13 | AÇÕES (ações comerciais pontuais) |
| 1 | ANÚNCIO DE JORNAL |
| 2 | ANÚNCIO DE REVISTAS |
| 11 | **BUSDOOR** (busão) |
| 14 | CONSULTOR (indicação do próprio consultor) |
| 19 | FACEBOOK |
| 5 | INDICAÇÃO AMIGOS / CLIENTES |
| 29 | INSTAGRAM |
| 7 | INTERNET |
| 10 | MÍDIA RÁDIO |
| 9 | MÍDIA TELEVISÃO |
| 30 | MIGRAÇÃO AMANDA (migração batch nomeada) |
| 31 | MIGRAÇÃO ELISA |

**Insight:** procedência é **configurável** (admin cria novas via UI). HUB precisa:
- `LeadSource` entidade CRUD
- Suporte a campanhas nomeadas ("MIGRAÇÃO AMANDA") para análise de origem posterior

### Tipo de data (txtTpData)
CAD. LEAD (quando entrou) · CONV. CLI. (quando virou cliente) · CONV. PRO. (quando virou prospect)

---

## 8. Prospects admin (`/Modulos/CRM/Gerenciador-Prospects.php`)

**Endpoint:** `Gerenciador-Prospects_server_processing.php`

### 🎯 Termômetro (txtTermometro) — qualificação qualitativa do lead

Muito frio · Frio · Normal · Quente · Muito quente

Isso é **classificação qualitativa do SDR** — complementa o lead score numérico. HUB deve ter:
```ts
type LeadTemperature = 'very_cold' | 'cold' | 'normal' | 'hot' | 'very_hot';
```

### Status prospect — 8 estados do funil
CONV. DE LEAD · AGUARDANDO · EM NEGOCIAÇÃO · EM ORÇAMENTO · EM ANÁLISE · INATIVO · BLOQUEADO · EXCLUIDO

### Grupo pessoas
MIGRAÇÃO · OUTROS · TERCEIROS

---

## 9. Indicadores CRM (`/Modulos/CRM/Indicadores.php`)

**Endpoint:** `Indicadores_server_processing.php?imp=X`

### Colunas
Cod · CPF · Nome completo · RG · Cidade · UF · Telefone · E-mail · **Dt. Demissão**

### Tipos (txtTipo) — 4 origens de indicador
- E = Funcionários
- C = Clientes
- P = Prospects
- I = Indicadores (pessoas físicas cadastradas só para indicar)

### Insight

Cadastro universal de "pessoas que indicam" com `Dt. Demissão` (quando funcionário sai, ainda rastreia comissão residual).

HUB: `Referrer` como entidade separada, pode ter FK para `User | Member | Prospect | null` (indicador externo).

---

## 10. Lançamento de Movimentos / Contas Fixas (`/Modulos/Financeiro/Lancamento-de-Movimentos.php?tp=1`)

**Endpoint:** `Lancamento-de-Movimentos_server_processing.php`

### Colunas
Loja · D/C (débito/crédito) · Fornec./Funcionário · Grupo · Conta · Histórico · Tipo · **Últ.Vnc.** · Max.Parc. · Min.Parc. · **Aberto** (saldo) · Status · Ação

### Status Aprovação (txtStatusAp)
Novo · Aguardando · Aprovadas · Reprovadas

### 🎯 Lista de autorizadores (mscStat) — delegações financeiras

ADMINISTRADOR · LUIZ OTAVIO · DENNIS SOBRAL · JHONATAN LODRON · KILBER ABRANTES · ALAN BARRAS · DANIELLE OLIVEIRA · THAMARA MONTEIRO · MONICA ALVES · JOSÉ GERALDO · MARCOS BARBOSA · VENDAS ONLINE · MARIA NOÉ · SAULO RODRIGUES · VAGNER

(15 pessoas com alçada de aprovação). HUB precisa de **sistema de alçadas** (approval hierarchy) — por valor, por tipo de conta.

---

## 11. Compras (`/Modulos/Estoque/Compras.php`)

**Endpoint:** `Compras_server_processing.php?imp=X`

### Estados (txtEstado)
Aguardando · Aprovadas · Reprovadas · Todas

### Tipos de Busca (6 dimensões)
Fornecedor · Grupo de Conta · Subgrupo de Conta · Forma de Pagamento · **Responsável pela Autorização** · **Responsável pela Compra**

### Insight

Workflow em 2 níveis: **autorização → compra efetiva**. Duas pessoas distintas no fluxo (autorizador + comprador). HUB: `PurchaseOrder` com `authorizedBy` + `purchasedBy` separados.

---

## 12. Usuários do sistema (`/Modulos/Comercial/Usuarios.php`)

**Endpoint:** `Usuarios_server_processing.php`

### Colunas
Foto · Nome · Dt.Cadastro · **Usuário (login)** · E-mail · **Departamento** · **Perfil de acesso** · **Ult.Acesso** · Ação

### 🎯 Perfis de acesso (RBAC completo — 13 valores)

| Perfil | Para |
|---|---|
| Administrador | super admin técnico |
| COMPLETO | admin total |
| CONSULTOR | vendedor padrão |
| ADMINISTRATIVO | back office |
| EVENTOS | gestão de eventos |
| GESTÃO COMERCIAL | gerente de vendas |
| GESTÃO COMERCIAL - AVANÇADA | gerente senior |
| GESTÃO CONSULTOR | líder de equipe |
| MARKETING | marketing |
| CONTABILIDADE | contador |
| FINANCEIRO | time financeiro |
| DIREÇÃO | diretoria |

### Departamentos
ADMINISTRATIVO · COMERCIAL · EVENTOS · FINANCEIRO · DIRETORIA

### Dados reais parciais (equipe LOOG)

~30+ funcionários visíveis. Padrão: `nome.sobrenome` como login. Último acesso é tracked.

Insights HUB:
- RBAC em `packages/core/auth` tem que suportar os 13 perfis + alçadas financeiras ortogonais
- `last_login_at` por usuário
- Alguns emails compartilhados visíveis — HUB deve bloquear duplicata de email

### Filtros
Tipo: Funcionários / Clientes / Prospects / Indicadores / Sem Responsável

(Usuários do sistema são buscáveis pelos mesmos tipos de Comissões — reforça o modelo multinível)

---

## 13. Funcionários (`/Modulos/Financeiro/Funcionarios.php`)

**Endpoint:** `Funcionarios_server_processing.php?imp=X`

Mesma estrutura dos Indicadores. Identidade funcional separada (Funcionários paga folha, Indicadores paga comissão).

---

## 14. BI — Business Intelligence (7 relatórios)

Biblioteca: **amCharts** (`amcharts.js` + `serial.js` + themes). Gráfico renderizado em `#chartdiv`.

### 14.1 BI Retenção/Churn (`/Modulos/BI/BI-Churn.php`)

**Endpoint:** `BI-Churn_server_processing.php`

**KPIs (tabela `tbReceita`):**
- Número de planos Vencendo
- Número de planos Renovados
- Número de planos Não-Renovados
- Número de planos Cancelados
- Percentual de Evasão
- % Não-Renovados
- % Renovados

**Gráfico:** Não-Renovados × Renovados

**Analítico (`tbReceitaAnalitico`):** Mat. · Nome · Período · Val.Mens. · Status · Plano · Consultor · Telefone · Celular · Email

### 14.2 BI Inadimplência (`/Modulos/BI/BI-Inadimplencia.php`)

**KPIs:**
- Percentual de Evasão
- Valor planos Vencendo
- Valor planos Renovados
- Valor planos Não-Renovados
- % Inadimplentes
- % Adimplentes

**Gráfico:** Inadimplentes × Adimplentes + Planos Renovados × Planos Não-Renovados

**Analítico:** Nome · Período · Valor · **Desc. · Tp.Des.** · Até Venc. · Status · Plano · Consultor · Celular · Email

### 14.3 BI Matrículas × Renovações (`/Modulos/BI/BI-Matriculas-Renovacoes.php`)

**Filtros extras:** Status · Grupo de Cliente · Tipo (Novos / Fim Contratos) · Veículos (Todos / Aprovados / Não Aprovados)

**Secções:** Novos Planos / Retornos / Renovações / Desligados

**Analítico (`tbRenovacao`):** mesmas colunas que inadimplência

### 14.4 BI Rentabilidade de Carteira (`/Modulos/BI/BI-Rentabilidade-Carteira.php`)

**Tabela (`tbReceita`):** Id · Usuário Responsável · **Tot.Vendas** · **Tot.Receb.** · **Diferença**

Ranking por consultor. **Dados reais vistos (semana 01-06/10/2026):**

```
TOTAL  R$ 3.106,97  R$ 491,63  R$ 2.615,34
```

Diferença grande indica atraso de recebimento ou inadimplência inicial do mês.

**Top 6 em venda:**
1. ANA THERSIA LANDIM — R$ 892,06
2. GABRIEL CORRÊA E CORREA — R$ 812,74
3. LUIZ FELIPE RODRIGUES BASÍLIO — R$ 453,44
4. LUIZ FELIPE ALMEIDA — R$ 383,91 (R$ 203,97 recebido)
5. WILLIAN RODRIGUES CAMPOS — R$ 287,91 (quase total recebido)
6. MAURICIO MARTINS — R$ 276,91

### 14.5 BI Evasão (`/Modulos/BI/BI-Evasao.php`)

Não visitada em detalhe. Nome sugere: evasão = cancelamento de contrato ativo. Padrão provavelmente similar a Churn.

### 14.6 BI Auditoria (`/Modulos/BI/BI-Auditoria.php`)

Não visitada em detalhe. Nome sugere: trilha de auditoria de operações (quem fez o quê, quando).

### 14.7 BI Mapa de Equipe (`/Modulos/BI/BI-Mapa.php`)

Visualização por usuário responsável — mostra Nome + Telefone. Provável mapa geográfico/localização dos consultores.

### Insight consolidado BI

- **amCharts** é alternativa ao Recharts/Chart.js. HUB pode usar Recharts (React-native) ou Tremor.
- 7 relatórios cobrem: evasão/retenção/inadimplência/matrículas/rentabilidade/auditoria/mapa.
- **Faltam no SIVIS BI:** cohort analysis, LTV, NPS trends, funil CRM, vendas por canal/procedência, SLA sinistros.
- HUB oportunidade: dashboards **diretoria em tempo real** via Supabase Realtime.

---

## 15. Convenções consolidadas descobertas

### 15.1 Rotas CRUD típicas

| Entidade | Lista | Form | Server-side | Delete |
|---|---|---|---|---|
| Lista | `/Modulos/X/Y.php` | — | `Y_server_processing.php` | — |
| Form modal | — | `/Modulos/X/FormY.php?id=N` | — | — |
| Form server | — | `/Modulos/X/form/YFormServer.php` | — | — |
| Delete | — | — | — | `/Modulos/X/Y.php?Del=N` |

### 15.2 Padrão de filtros

- `txt_dt_begin` / `txt_dt_end` — intervalo de datas
- `txtTipoData` — qual data filtrar (venc/pag/cad)
- `txtStatus[]` — status (multiselect)
- `txtUserResp` — usuário responsável
- `txtContaMov` — grupo pessoas (MIGRAÇÃO/OUTROS/TERCEIROS)
- `txtTipoVei[]` — tipo veículo
- `txtTipoBusca` — dimensão de busca

### 15.3 Padrão de autorizações (workflow)

Estados comuns: **Novo → Aguardando → Aprovadas / Reprovadas**

Aplicável a:
- Lançamentos financeiros
- Compras
- Vistorias
- Sinistros (via statusap)
- Comissões

---

## 16. Catálogos consolidados (seeds para o HUB)

### 16.1 Procedências de lead (14 valores)

```sql
INSERT INTO lead_source (code, label, kind) VALUES
('busdoor', 'BUSDOOR', 'offline'),
('consultor', 'CONSULTOR', 'referral'),
('facebook', 'FACEBOOK', 'digital'),
('instagram', 'INSTAGRAM', 'digital'),
('internet', 'INTERNET', 'digital'),
('indicacao_amigos', 'INDICAÇÃO AMIGOS / CLIENTES', 'referral'),
('midia_radio', 'MÍDIA RÁDIO', 'offline'),
('midia_tv', 'MÍDIA TELEVISÃO', 'offline'),
('anuncio_jornal', 'ANÚNCIO DE JORNAL', 'offline'),
('anuncio_revistas', 'ANÚNCIO DE REVISTAS', 'offline'),
('acoes_comerciais', 'AÇÕES', 'offline'),
('campanha_1ano_gratis', '1 ANO DE PROTEÇÃO GRÁTIS', 'campaign'),
('migracao_amanda', 'MIGRAÇÃO AMANDA', 'migration'),
('migracao_elisa', 'MIGRAÇÃO ELISA', 'migration');
```

### 16.2 Tipos de documento financeiro (9 valores)

```sql
INSERT INTO payment_method (code, label, provider) VALUES
('transferencia_bancaria', 'TRANSF. BANCARIA', null),
('cheque', 'CHEQUE', null),
('dinheiro', 'DINHEIRO', null),
('cartao_credito_master', 'CRÉDITO - MASTER', null),
('cartao_debito', 'CARTÃO DE DÉBITO', null),
('boleto_celcoin', 'BOLETO CELCOIN', 'celcoin'),
('debito_em_conta', 'DEBITO EM CONTA', null),
('pagamento_recorrente', 'PAGAMENTO RECORRENTE', null),
('pix_celcoin', 'PIX CELCOIN', 'celcoin');
```

### 16.3 Tipos de vistoria (9 valores)

```sql
INSERT INTO inspection_type (code, label, category) VALUES
('previa_carro', 'PRÉVIA - CARRO', 'adhesion'),
('reabilitacao_carro', 'REABILITAÇÃO - CARRO', 'reactivation'),
('previa_moto', 'PRÉVIA - MOTO', 'adhesion'),
('reabilitacao_moto', 'REABILITAÇÃO - MOTO', 'reactivation'),
('evento_abertura', 'EVENTO - ABERTURA', 'claim_opening'),
('evento_finalizado', 'EVENTO - FINALIZADO', 'claim_closing'),
('inclusao_vidros', 'INCLUSÃO DE VIDROS', 'coverage_add'),
('inclusao_placa_carro', 'INCLUSÃO DE PLACA - CARRO', 'vehicle_change'),
('inclusao_placa_moto', 'INCLUSÃO DE PLACA - MOTO', 'vehicle_change');
```

### 16.4 Perfis RBAC (13 valores)

```sql
INSERT INTO user_role (code, label, level) VALUES
('super_admin', 'Administrador', 100),
('full', 'COMPLETO', 95),
('direction', 'DIREÇÃO', 90),
('commercial_management_advanced', 'GESTÃO COMERCIAL - AVANÇADA', 80),
('commercial_management', 'GESTÃO COMERCIAL', 75),
('consultant_management', 'GESTÃO CONSULTOR', 70),
('financial', 'FINANCEIRO', 65),
('accounting', 'CONTABILIDADE', 60),
('administrative', 'ADMINISTRATIVO', 55),
('marketing', 'MARKETING', 50),
('events', 'EVENTOS', 45),
('consultant', 'CONSULTOR', 40);
```

### 16.5 Departamentos (5 valores)

ADMINISTRATIVO · COMERCIAL · EVENTOS · FINANCEIRO · DIRETORIA

### 16.6 Status cliente (14 valores consolidado)

ATIVO · ATIVO_CRED · ATIVO_ABONO · ATIVO_EM_ABERTO · SUSPENSO · CANCELADO · INATIVO · BLOQUEADO · EXCLUIDO · DEPENDENTE · DEPENDENTE_EM_ABERTO · FERIAS · DESLIGADO · DESLIGADO_EM_ABERTO

### 16.7 Status sinistro (9 valores)

AGUARDANDO · EM_ABERTO · EM_REPARO · FINALIZADO · REPROVADO · SINDICANCIA · CANCELADOS · SUB_ROGACAO · INDEFERIDO

### 16.8 Status prospect (8 valores)

CONV_DE_LEAD · AGUARDANDO · EM_NEGOCIACAO · EM_ORCAMENTO · EM_ANALISE · INATIVO · BLOQUEADO · EXCLUIDO

### 16.9 Lead temperatura (5 valores)

MUITO_FRIO · FRIO · NORMAL · QUENTE · MUITO_QUENTE

---

## 17. Equipe LOOG parcialmente mapeada

Visíveis via filtro `txtUserResp` e `mscStat`:

**Equipe comercial (CONSULTOR):**
Alan Barras · Alessandra Moreira · Alexsandre Braziel · Alice Lobo · Alisson Landim · Allan Silva · Alysson Vieira · Ana Viana · Ana Paula · Ana Thersia Landim · André Vitoi · Anna Clara Reis · Anna Clara Assis · Antônio César Pereira · Arthur Lima · Breno Mariano · Bruna Volpato · (+ muitos mais em paginação)

**Perfil ADMINISTRATIVO:**
Norberto Andrade (Andrade @axencode) · Anna Clara Itaborai

**Alçada financeira (autorizadores):**
LUIZ OTAVIO · DENNIS SOBRAL · JHONATAN LODRON · KILBER ABRANTES · ALAN BARRAS · DANIELLE OLIVEIRA · THAMARA MONTEIRO · MONICA ALVES · JOSÉ GERALDO · MARCOS BARBOSA · VENDAS ONLINE · MARIA NOÉ · SAULO RODRIGUES · VAGNER

**Top vendedores da última semana:**
ANA THERSIA LANDIM · GABRIEL CORRÊA · LUIZ FELIPE RODRIGUES · LUIZ FELIPE ALMEIDA · WILLIAN CAMPOS · MAURICIO MARTINS

---

## 18. Lacunas remanescentes

- [ ] BI Auditoria (não visitada em detalhe)
- [ ] BI Evasão (não visitada em detalhe)
- [ ] ComissaoClientes — tela aparentemente vazia (precisa clicar em "Novo" para ver form)
- [ ] Vendas (`/Modulos/Estoque/Vendas.php?id=1`) — não visitada
- [ ] Solicitacao-de-Autorizacao (Contas Variáveis) — não visitada em detalhe
- [ ] Form completos de **Veículo** (`FormVeiculos.php`), **Rastreador** (`FormRastreador.php`), **Cliente** (`GerenciadorClientesForm.php`), **Lançamento**, **Prospect/Lead** (campos completos de cada form modal)
- [ ] Response JSON real de todos os `*_server_processing.php` — shape que o backend devolve
- [ ] Convênios CRUD completo
- [ ] Eventos / Agenda admin
- [ ] Rede de atendimento / Oficinas credenciadas
- [ ] Assistência 24h (visto `/Modulos/Seguro/ajax/assistencia.php` em Veículos)
- [ ] Vendas online (visto como option — campanha ou canal específico?)

**Como completar:** iteração #3 em sessão futura focando nos forms (abrir cada modal via `AbrirBox`) + ir pros módulos restantes.
