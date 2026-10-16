# SIVIS ERP — Módulo Clientes (Gerenciador de Clientes = Associados)

> `/Modulos/Comercial/Gerenciador-Clientes.php`
> Data: 2026-10-06 · Empresa 028 · Perfil ADMINISTRATIVO

---

## 1. Listagem

**Tabela:** `tbClientes`
**Server-side:** `/Modulos/Comercial/Gerenciador-Clientes_server_processing.php`

### Colunas

Matrícula · CPF/CNPJ · Nome · Usuário Responsável · Bairro · Cidade · UF · Tel. · E-mail · Ação

### Filtros especiais (query params)

| Param | Função |
|---|---|
| `emailMarketing=1` | Lista só quem opt-in email marketing |
| `envioSms=1` | Lista só quem opt-in SMS |
| `txtContaMov` | Grupo (ver abaixo) |
| `txtStatus[]` | Array de status (multiselect) |

### Grupos de cliente (`txtContaMov`)

| Valor | Label |
|---|---|
| 1 | MIGRAÇÃO (migrados de sistema antigo) |
| 0 | OUTROS |
| 17 | TERCEIROS (via convênio) |
| -1 | Sem Grupo |

### Status de cliente (`txtStatus`) — 9 valores

| Valor | Label | Observação |
|---|---|---|
| Ativo | Ativo | pagando regularmente |
| AtivoCred | Ativo Credencial | ? (credenciado?) |
| AtivoAbono | Ativo Abono | perdão temporário de inadimplência |
| AtivoEmAberto | Ativo Em Aberto | ativo mas tem fatura em aberto |
| Suspenso | Suspenso | não cancela mas suspende cobertura |
| Cancelado | Cancelado | encerrou vínculo |
| Inativo | Inativo | inativo (soft) |
| Bloqueado | Bloqueado | bloqueio administrativo |
| Excluido | Excluido | hard delete lógico |

Esses status são mais granulares que os vistos no form de sinistro (lá tinha 11 valores). Diferença: aqui são status base, sinistro adiciona status de dependente/férias/desligado específicos de outras verticais.

---

## 2. Ações no cliente

Funções globais vistas:
- `reativarCli(id)` — reativa cliente cancelado
- `excluirCli(id)` — exclui (soft?)
- `AbrirBox(id)` — abre form em modal
- `FecharBox()` — fecha
- `listaEmails(idList)` — dispara envio email marketing
- `listaSMS(idList)` — dispara envio SMS
- `imprimir()` — exporta relatório

**Form de cadastro:** `/Modulos/Comercial/form/GerenciadorClientesForm.php` (abre em iframe modal via `AbrirBox`).

**Variante:** `/Modulos/Academia/form/ClientesFormServer.php` (SIVIS também atende academias — mesmo cliente/plataforma, variante do form com campos de aluno/matrícula).

---

## 3. Endpoint catch-all

**`/Modulos/Sivis/ajax/update_server_processing.php`** — update genérico. Provavelmente aceita `{table, field, value, id}` para atualização inline em qualquer tabela admin. Útil para o HUB equivalente, mas perigoso: sem camada de domínio, qualquer campo vira editável. No HUB, **não replicar esse padrão** — fazer updates por rota tipada por entidade.

---

## 4. Observações

### 4.1 SIVIS é multi-vertical

Além de Proteção Veicular (`/Modulos/Seguro/`), tem também:

- `/Modulos/Academia/` — academias (matrículas, turmas, aluno)
- `/Modulos/Clube/` — clube (boletos — usado pela LOOG)
- `/Modulos/Estoque/` — estoque (requisição, cotação, compra)
- `/Modulos/Comercial/` — base cliente comum
- `/Modulos/Financeiro/` — financeiro comum
- `/Modulos/CRM/` — CRM comum
- `/Modulos/BI/` — BI comum
- `/Modulos/Contas-a-pagar/` — financeiro comum

**Implicação:** o LOOG HUB não precisa replicar tudo — só a parte Proteção Veicular + Clube + overlaps mínimos (financeiro, CRM, BI).

### 4.2 Comunicação em massa é fluxo nativo

Email marketing e SMS têm filtros próprios no listador (`emailMarketing=1`, `envioSms=1`) e botões para disparar da listagem filtrada. HUB precisa:

- Flag opt-in por canal no `Member`
- Compliance LGPD (unsubscribe trackeado)
- Jobs assíncronos (fila) para envio em lote

### 4.3 "Matrícula" como identificador

A primeira coluna é "Matrícula" (não ID). SIVIS usa um matrícula sequencial humana-legível (ex: 10001) distinto do ID interno. HUB deve emitir matrícula visível + manter UUID interno.

---

## 5. Modelo canônico (consolidando com o visto no portal)

```ts
interface Member {
  id: string;                       // UUID interno
  matricula: string;                // sequencial visível (ex: "10001")
  tenantId: string;
  type: 'PF' | 'PJ';
  // PF: name + cpf + birthDate; PJ: companyName + cnpj + stateRegistration
  name: string;
  cpf?: string;
  cnpj?: string;
  stateRegistration?: string;
  birthDate?: Date;
  civilStatus?: string;
  gender?: 'M' | 'F' | 'O';
  email: string;
  phone: string;
  address: Address;
  status: MemberStatus;             // 9 valores + variantes para dependentes
  group?: MemberGroup;              // migração, terceiros, outros
  responsibleUserId?: string;       // consultor atribuído
  parentMemberId?: string;          // para dependentes
  indicator?: string;               // quem indicou
  marketing: {
    emailOptIn: boolean;
    smsOptIn: boolean;
    whatsappOptIn: boolean;
  };
  createdAt: Date;
  deletedAt?: Date;
}

type MemberStatus =
  | 'ATIVO' | 'ATIVO_CRED' | 'ATIVO_ABONO' | 'ATIVO_EM_ABERTO'
  | 'SUSPENSO' | 'CANCELADO' | 'INATIVO' | 'BLOQUEADO' | 'EXCLUIDO'
  | 'DEPENDENTE' | 'DEPENDENTE_EM_ABERTO' | 'FERIAS'
  | 'DESLIGADO' | 'DESLIGADO_EM_ABERTO';
```

---

## 6. Pendente

- [ ] Form completo `GerenciadorClientesForm.php` (campos, abas, uploads de documento, contratos vinculados)
- [ ] Response shape do `Gerenciador-Clientes_server_processing.php` com shape JSON real
- [ ] Lista completa de ações contextuais (reativar, bloquear, migrar grupo, etc.)
- [ ] Workflow de aprovação de alteração de dados sensíveis (CPF/email)
- [ ] Export relatório impressão
