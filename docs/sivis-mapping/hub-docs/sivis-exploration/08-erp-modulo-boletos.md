# SIVIS ERP — Módulo Gerar Boletos (Clube)

> `/Modulos/Clube/Gerar-Boletos.php` + `/Modulos/Clube/js/FormGerar-Boletos.js` (18KB)
> Data: 2026-10-06 · Empresa 028 · Perfil ADMINISTRATIVO

**⚠️ Esse é o módulo mais crítico pro HUB** — se emissão de boleto falhar, LOOG para.

---

## 1. UI

Breadcrumb: Financeiro › Gerar Boletos

**Filtros do topo:**

| Filtro | Opções |
|---|---|
| `txtTipo` (Tipo) | Lote (0) · Individual (1) · Dependente (2) |
| `txtLote` (Grupo) | MIGRAÇÃO (1), OUTROS (0), TERCEIROS (17) |
| `txtAlunoNome` (Cliente autocomplete) | `/Modulos/CRM/ajax.php?q=TERMO&t=C` |
| `txtPlanos` (Planos) | Carrega via `getPlanos()` → `planos.ajax.php` |
| `txtBanco` (Banco) | **CAIXA LOCAL (1)** · **CELCOIN (3)** · suporta Sicredi (14/15) |
| `txtCarteira` (Carteira) | Carrega via `bancoCarteira.ajax.php` |
| `txtTipoBoleto` (Status) | Todos / Gerados / Não gerados / Exportados / Não exportados / Enviado / Não enviado / Enviado c/ erro / Liquidados / Não liquidados |
| `txtTipoData` (Tipo de data) | Vencimento (0) · Cadastro (1) |
| `txt_dt_begin` / `txt_dt_end` | Período |
| `ckb_grupoFin` | Checkbox: ignorar seleção de planos (usa grupo financeiro) |

**Botões de ação (visíveis depois de buscar):**
- Buscar / Filtrar
- **Gerar Boletos** (`GerarBol`)
- **Exportar REM** (`ExportarRem`) — gera arquivo CNAB
- **Cancelar REM** (`CancelarRem`)
- **Imprimir Boletos** (`ImprimirBol`)
- **Enviar Email** (`EnviarEmail`)
- **Retorno Cobrança** (`RetornoCobranca`) — importa retorno bancário

---

## 2. Endpoints descobertos

| Endpoint | Método | Operação |
|---|---|---|
| `/Modulos/Clube/Gerar-Boletos_server_processing.php` | GET | Lista mensalidades elegíveis (DataTables) |
| `/Modulos/Clube/planos.ajax.php` | GET | Lookup planos por tipo/cliente/lote |
| `/Modulos/Financeiro/bancoCarteira.ajax.php` | GET | Carteiras do banco selecionado |
| `/Modulos/CRM/ajax.php?t=C` | GET | Autocomplete cliente |
| `/Modulos/Clube/form/gerar-BoletosForm.php` | POST | **CRUD multi-ação** (ver §3) |
| `/Modulos/Clube/FormBoletos.php?id=X` | GET (modal) | Form individual do boleto |
| `/Boletos/Boleto.php?id=X,Y,Z\|&crt=028` | GET | **Impressão em massa** (abre em nova aba) |
| `/Modulos/Clube/Baixar-Layout.php` | — | Upload de retorno bancário (contrato 165) |
| `/Modulos/Contas-a-pagar/Retorno-Banco.php` | — | Upload de retorno bancário (outros) |

### Query params do listador `Gerar-Boletos_server_processing.php`

| Param | Campo UI |
|---|---|
| `imp` | 0=JSON, 1=PDF |
| `tp` | Tipo (Lote/Individual/Dependente) |
| `lt` | Grupo |
| `al` | Cliente ID |
| `pl` | Planos (CSV) |
| `bc` | Banco |
| `cr` | Carteira |
| `tb` | Status do boleto |
| `td` | Tipo data |
| `gp` | Grupo financeiro flag (0/1) |
| `dti`, `dtf` | Período |

---

## 3. Ações no form `gerar-BoletosForm.php`

Rota única POST com múltiplas ações via flag no body:

| Flag | Operação | Body adicional |
|---|---|---|
| `bntSave=S` | **Gera 1 boleto** | `txtTipo, txtBanco, txtPlanos, txtCarteira, txtDtBegin, txtMens` (uma mensalidade) |
| `bntGrupo=S` | Altera grupo financeiro de um registro | `txtId, txtGrupo` |
| `bntSaveFile=S` | **Exporta arquivo REM (CNAB)** | `txtTipo, txtBanco, txtMens` (CSV de IDs selecionados) |
| `bntSaveFile=S & txtCancel=S` | Exporta REM de cancelamento | — |
| `bntSendEmail=S` | **Envia boleto por e-mail** | `txtId` |

⚠️ **Fluxo síncrono + loop no cliente:** gerar 500 boletos = 500 POSTs sequenciais. Dialog com progressbar atualiza. **Isso é limitação do SIVIS — HUB vai usar fila assíncrona (Supabase Queue / Trigger Dev).**

---

## 4. Formato do arquivo CNAB (REM)

### Nome do arquivo

| Banco | Padrão de nome |
|---|---|
| Sicredi (tipo 14/15) | `{cedente}{mes:cod}{dd}.crm` com mapeamento mês 10→O, 11→N, 12→D |
| Outros (CAIXA, CELCOIN) | `C{DDMMYY}A.txt` (A=remessa, C=cancelamento com `C{DDMMYY}C.txt`) |

### Conteúdo

Arquivo texto CNAB (240 ou 400 colunas, varia por banco). Download pelo browser via `Blob + createObjectURL`.

---

## 5. Impressão em massa

`ImprimirBol()`:

```
URL: /Boletos/Boleto.php?id=X|Y|Z|&crt={contratoId}
```

- IDs separados por `|` (não `,`)
- `crt` = ID do contrato/empresa

Abre em nova aba (PDF gerado server-side).

---

## 6. Envio em massa de email

`EnviarEmail()` → loop sequencial de POSTs:

```
POST /Modulos/Clube/form/gerar-BoletosForm.php
Body: bntSendEmail=S, txtId=<boleto_id>
Response: {qtd_total, qtd_sucesso}
```

Front contabiliza sucessos/erros e exibe no final.

---

## 7. Retorno bancário

`RetornoCobranca()` → navega para:
- **Contrato 165** (um específico): `./../Clube/Baixar-Layout.php`
- Outros: `./../Contas-a-pagar/Retorno-Banco.php`

Upload de arquivo CNAB retorno → sistema baixa automaticamente boletos liquidados.

---

## 8. Validações (do `validar()`)

- Se Tipo = Individual (1) ou Dependente (2): Cliente (`txtAluno`) obrigatório
- Planos obrigatório (ou flag `grupoFin` marcada)
- Banco obrigatório
- Carteira obrigatória
- Vencimento obrigatório

---

## 9. Modelo de dados inferido

```ts
interface Invoice {
  id: string;                       // mensalidade_id
  tenantId: string;
  memberId: string;
  planId: string;                   // SIVIS 'id_plano'
  group: 'MIGRACAO' | 'OUTROS' | 'TERCEIROS';
  bank: 'CAIXA' | 'CELCOIN' | 'SICREDI' | ...;
  wallet: string;                   // 'carteira' do banco
  invoiceType: 'LOTE' | 'INDIVIDUAL' | 'DEPENDENTE';
  dueDate: Date;
  issuedAt?: Date;                  // null se não gerado
  exportedAt?: Date;                // null se não exportado (REM)
  sentAt?: Date;                    // null se não enviado por email
  sendError?: string;               // erro de envio
  settledAt?: Date;                 // null se não liquidado
  amount: number;                   // valor
  amountPaid?: number;
  bankTitle?: string;               // "Nosso Número"
  cnabExportFileName?: string;      // "C101026A.txt"
  cancellationFileName?: string;    // "C101026C.txt"
  status: InvoiceStatus;
}

type InvoiceStatus =
  | 'PENDING'           // não gerado
  | 'ISSUED'            // boleto emitido
  | 'EXPORTED'          // já no REM/CNAB
  | 'SENT'              // email enviado
  | 'SEND_ERROR'        // email com erro
  | 'SETTLED'           // liquidado
  | 'CANCELLED';
```

### Grupo financeiro

Separa migração (clientes vindos de sistema antigo com regra especial), outros (padrão), terceiros (via convênio).

---

## 10. Para o LOOG HUB

### `packages/core/billing/`

- Modelo `Invoice` com snapshots (não quebrar boletos antigos quando mudar regra)
- Workflow: PENDING → ISSUED → SENT → SETTLED (com transições reversas via admin)
- Fila assíncrona para emissão em massa (não loop no front)

### `packages/adapters/payment/`

- **Celcoin adapter** (primário no HUB — já é o parceiro atual da LOOG)
- Caixa adapter (fallback / contingência)
- Asaas adapter (alternativa com split nativo)
- Interface comum: `emit(invoice)`, `cancel(invoice)`, `exportCnab(invoices[])`, `processReturn(cnabFile)`

### Diferenciais do HUB

- **Pix híbrido** nativo (QR Code no boleto) — já é padrão Celcoin
- **Webhook de liquidação** em tempo real (não precisar upload manual de retorno)
- **Dunning automático** (régua D+3, D+7, D+15, D+30 com WhatsApp/email)
- **Split para consultor** (Asaas tem nativo; Celcoin + Caixa precisa de workaround)
- **Dashboard em tempo real** de liquidação

### Decisão da fase 3 do roadmap

**Primário:** Celcoin (continuidade operacional + já integrado)
**Fallback:** Asaas (split nativo para comissões)
**Legado:** manter Caixa até migrar os 100% de clientes

---

## 11. Pendente

- [ ] Shape JSON real do `Gerar-Boletos_server_processing.php` (colunas de tabela)
- [ ] Response de `planos.ajax.php` (shape do plano com mensalidade)
- [ ] Catálogo real de carteiras por banco
- [ ] Layout CNAB usado (240 vs 400, versão) — crítico pra garantir compatibilidade com Celcoin/Caixa
- [ ] Template de email usado
- [ ] Fluxo de contingência quando REM falha
- [ ] Como SIVIS trata PIX híbrido (apenas boleto ou boleto+PIX dinâmico?)
