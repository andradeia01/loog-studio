# SIVIS ERP — Módulo Vistorias

> Capturado em `/Modulos/Seguro/Vistorias.php` logado como ADMINISTRATIVO.
> Data: 2026-10-06 · Empresa: 028 (LOOG)

---

## 1. UI

**URL:** `/Modulos/Seguro/Vistorias.php`
**JS da página:** `/Modulos/Seguro/js/Vistoria.js`
**Breadcrumb:** Proteção › Gerenciamento › Vistorias

### Filtros (query params do endpoint `Vistorias_server_processing.php`)

| Campo UI | Query param | Observação |
|---|---|---|
| Data início | `dti` | DD/MM/AAAA |
| Data fim | `dtf` | DD/MM/AAAA |
| Busca livre | `Search` | nome, placa, CPF |
| Status Apresentação | `statusap` | — |
| Vistorias (filtro) | `vistorias` | — |
| Assistência | `assistencia` | — |
| Status | `status` | — |
| Tipo Vistoria | `tipoVis` | Prévia, Final, ... |
| Grupo pessoa | `grupo_pessoa` | — |
| Usuário responsável | `ur` | — |
| Validação | `validacao` | — |
| Tipo cliente | `tpCli` | P=Prospect, C=Cliente(?) |
| ID cliente | `idCli` | lido de `#txtId` da janela pai (quando modal aberto a partir da ficha do cliente) |

### Colunas da tabela

Data · Tipo · Usuário · Placa · Marca · Modelo · Ano · Comb. · Valor · CPF · Cliente · Status Vist. · Ação

### Ações disponíveis

- **Nova vistoria** (ícone +): abre `FormVistorias.php` em modal 580×1000 (iframe via `abrirTelaBox`)
- **Linha → clicar data:** `AbrirBoxVistorias(327)` → abre `/Modulos/Seguro/FormVistorias.php?id=327` em modal (editar)
- **Linha → clicar cliente:** `AbrirBoxCli('P', 375)` → abre modal do cliente/prospect
- **Delete:** `?Del=327` (visto no `href` da coluna Ação)

### Impressão

`finalFindVistorias(1)` passa `imp=1` → endpoint devolve PDF em vez de JSON.

---

## 2. Endpoints inferidos

| Operação | Endpoint | Método | Observação |
|---|---|---|---|
| Listagem server-side (DataTables) | `/Modulos/Seguro/Vistorias_server_processing.php?imp=0&...filtros` | GET | Padrão DataTables 1.9 (`sEcho`, `iDisplayStart`, `iDisplayLength`) |
| Impressão / export PDF | mesmo endpoint com `imp=1` | GET | — |
| Form (ver/editar/criar) | `/Modulos/Seguro/FormVistorias.php?id=X` ou vazio | GET (dentro de iframe) | — |
| Delete | `/Modulos/Seguro/Vistorias.php?Del=X` | GET | ⚠️ delete via GET (idempotência frouxa — típico de PHP legado) |
| Abrir ficha cliente | `AbrirBoxCli('P'\|'C', id)` | iframe | abre `FormClientes.php` provavelmente |

---

## 3. Convenção descoberta no ERP

| Padrão | Significado |
|---|---|
| `/Modulos/<Area>/<Entidade>.php` | Página de listagem |
| `/Modulos/<Area>/js/<Entidade>.js` | JS específico (DataTables init, modal openers) |
| `/Modulos/<Area>/Form<Entidade>.php?id=X` | Formulário em modal (iframe fancybox 580×1000) |
| `/Modulos/<Area>/<Entidade>_server_processing.php` | DataTables server-side source |
| `/Modulos/<Area>/<Entidade>.php?Del=X` | Delete via query string |
| `abrirTelaBox(url, altura, largura)` | Abre modal em iframe |
| `AbrirBoxXxx(id)` | Shortcut para abrir Form em modal |

Essa convenção vale para TODOS os módulos do SIVIS ERP (confirma-se padrão ao navegar outras telas).

---

## 4. Dados reais vistos na tela (mascarados)

Vistoria #327 (exemplo):

```
Data:         06/10/2026 12:12
Tipo:         PRÉVIA - MOTO
Usuário:      SISTEMA
Placa:        VCF-****
Marca:        HONDA
Modelo:       CB 300F Twister Flex
Ano:          2026
Combustível:  Flex
Valor FIPE:   R$ 26.695,00
CPF:          ***.***.***-**
Cliente:      [nome do associado, id 375 - tipo 'P' prospect]
Status:       Pendente
```

Observação: cliente aparece com flag `P` (Prospect) → vistoria pode ser feita ANTES da adesão (fluxo de aprovação para converter prospect em associado). Isso bate com o que vimos no portal (`enviarVistoriaWhatsapp` dispara durante pendência).

---

## 5. Modelo de dados inferido

```ts
interface Inspection {
  id: number;                      // ex: 327 (int sequential)
  createdAt: Date;                 // "06/10/2026 12:12"
  type: 'PREVIA_CARRO' | 'PREVIA_MOTO' | 'FINAL' | ...;  // mostrado como "PRÉVIA - MOTO"
  performedBy: string;             // "SISTEMA" (automatizada) ou usuário humano
  responsibleUserId?: number;      // filtro `ur`
  vehicle: {
    plate: string;                 // "VCF-0C41"
    brand: string;
    model: string;
    year: number;
    fuel: string;
    fipeValueCents: number;        // "R$ 26.695,00" → 2669500
  };
  customer: {
    id: number;                    // 375
    type: 'P' | 'C';               // Prospect ou Cliente
    cpf: string;
    name: string;
  };
  status: 'Pendente' | 'Aprovada' | 'Reprovada' | 'Em Analise' | 'Cancelada';
  presentationStatus?: string;     // filtro `statusap`
  validation?: string;             // filtro `validacao`
  group?: string;                  // `grupo_pessoa`
  assistance?: boolean;            // `assistencia`
  deletedAt?: Date;                // soft-delete via `?Del=X`
}
```

---

## 6. Próximas capturas (para completar o modelo)

1. **Clicar em uma vistoria** (`AbrirBoxVistorias(327)`) → `FormVistorias.php?id=327` em iframe → ler todos os campos do formulário.
2. **Clicar em "Nova"** → ver fluxo de criação (foto, GPS?, assinatura?).
3. **Capturar response do** `Vistorias_server_processing.php` → modelo completo das colunas.
4. **Explorar sub-urls** mencionadas: Fotos? Avarias? Laudos?

---

## 7. Mapeamento para o LOOG HUB

### `packages/core/inspection/`

```ts
export const InspectionType = {
  PREVIA_CARRO: 'previa_carro',       // antes da adesão (carro)
  PREVIA_MOTO: 'previa_moto',          // antes da adesão (moto)
  FINAL: 'final',                       // após aprovação, ativa a cobertura
  REVISTORIA: 'revistoria',             // anual ou pós-inadimplência
  SINISTRO: 'sinistro',                 // vistoria pós-evento
} as const;

export const InspectionStatus = {
  PENDENTE: 'pendente',
  EM_ANALISE: 'em_analise',
  APROVADA: 'aprovada',
  REPROVADA: 'reprovada',
  CANCELADA: 'cancelada',
} as const;
```

### Diferenciais do HUB sobre SIVIS

- **Delete via DELETE verb** (não GET `?Del=X`).
- **Pagamento DataTables → tRPC paginação** (type-safe + less payload).
- **Form em route própria** (não iframe).
- **Audit log imutável** (SIVIS parece ter soft-delete mas sem trilha de aprovação formal).
- **Fotos com GPS + timestamp assinados** (não vi essa evidência de assinatura criptográfica no SIVIS).
- **Checklist versionado** (SIVIS parece ter checklist fixo por tipo de veículo — HUB versiona).

### Migração

Mapear tipo SIVIS → tipo HUB:
```
"PRÉVIA - MOTO"    → previa_moto
"PRÉVIA - CARRO"   → previa_carro
"PRÉVIA - SISTEMA" → previa_sistema (automatizada? investigar)
"FINAL"            → final
```

`?tpCli=P` → vistoria contra Prospect (ainda não ativou).
`?tpCli=C` → vistoria contra Cliente (associado ativo).

---

## 8. Formulário completo (FormVistorias.php?id=327)

Modal 580×1000 em iframe, carregando:

**Abas (6, não 4):**
- `#tab11` — Perfil do Veículo
- `#tab12` — Danos, Avarias e Outros
- `#tab1` — Dados Principais
- `#tab2` — Localização (com mapa Leaflet)
- `#tab3` — Observações
- `#tab4` — Validação

**Campos do form `#frmVistorias` (POST → `FormVistorias.php`):**

| Campo | Tipo | Observação |
|---|---|---|
| `txtId` | hidden | ID da vistoria |
| `txtIdVeiculo` | hidden | FK veículo |
| `txtVeiculoTipo` | hidden | tipo veículo (carro/moto/...) |
| `txtStatusVeiculo` | hidden | status |
| `txtLatitude`, `txtLongitude` | hidden | GPS (preenchido pelo Leaflet / navegador) |
| `txtReadOnly`, `txtReadOnlyVistoria` | hidden | flags RBAC |
| `txtData` | text | data da vistoria |
| `txtPlaca` | text (mask `AAA-9A99`) | placa |
| `txtTipo` | select | tipo vistoria (ex: valor 3) |
| `txtVistoriador` | text (autocomplete?) | nome do vistoriador |
| `txtFuncionario` | select | funcionário SIVIS responsável |
| `txtVendaItem` | select | item de venda vinculado (serviço cobrado) |
| `txtContrato` | select | contrato associado (ex: valor 2) |
| `txtExpirada` | checkbox | marca como expirada |
| `txtImgSel` | hidden | slot da imagem selecionada (00-23) |
| `del00`...`del23` | 24 botões | **24 slots de foto** para a vistoria |
| `file` + `bntSendFile` | upload | foto principal (galeria) |
| `txtDanos` | text | descrição do dano |
| `fileDanos` + `bntSendFileDanos` | upload | **foto de dano separada** |
| `itemsGrupo[]` (ckb_31..ckb_37) | checkboxes | **acessórios/equipamentos** (grupo 31-37, lookup em `getItens`) |
| `bntAssinar` | button | assina a vistoria |
| `bntPrint` | button | imprime laudo |

### Endpoints do form (`FormVistorias.js`)

| Endpoint | Método | Observação |
|---|---|---|
| `/Modulos/Seguro/form/FormVistoriasServer.php` | POST | Salvar vistoria + upload de arquivos (multipart) |
| `/Modulos/Seguro/form/FormVistoriasServer.php?isAjax=S` | GET | Operações AJAX genéricas (lookup) |
| `/Modulos/Seguro/form/FormVistoriasServer.php?isAjax=S&getItens=S` | GET | Lista de itens (acessórios/equipamentos por grupo) |
| `/Modulos/Seguro/Galeria.php?id={inspectionId}` | GET | Galeria completa das fotos da vistoria |

### Regras de negócio (do `validaForm()`)

- Placa é obrigatória
- Veículo (ID numérico) é obrigatório
- Se escolher **Pagamento de Serviço (VendaItem)**, precisa escolher **Vistoriador (Funcionário)** → serviço cobrado
- Se escolher Funcionário, precisa escolher VendaItem → coerência de cobrança
- Tipo de vistoria é obrigatório

Isso confirma que **vistoria é precificada como serviço** no SIVIS — quando o vistoriador cobra pelo serviço, cai no Financeiro automaticamente via `VendaItem`.

### Scripts carregados dentro do iframe

- jQuery UI, Bootstrap, select2, uniform
- bootbox (confirm/alert dialogs)
- jQuery mask + priceformat
- jQuery DataTables (lista de itens interno)
- **Leaflet.js** (mapa para a aba Localização)
- moment.js
- lang.pt.js (números + datas em pt-BR)
- `FormVistorias.js` (lógica própria do form)

---

## 9. Pendente ainda

- [ ] Response real do `FormVistoriasServer.php?isAjax=S&getItens=S` → categorias e nomes dos itemsGrupo (ex: 31=Freio Disco Dianteiro, etc.)
- [ ] Catálogo real de `txtTipo` (tipos de vistoria) e `txtVendaItem` (serviços cobrados)
- [ ] Aba Localização — como o mapa é usado (visualiza GPS registrado ou permite editar?)
- [ ] Aba Danos — como fotos de dano se vinculam ao form principal
- [ ] Aba Validação — fluxo de aprovação (multi-step? quem assina?)
- [ ] Response do `Vistorias_server_processing.php` com shape JSON real
- [ ] Laudo PDF (`?imp=1`) — layout final
