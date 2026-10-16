# SIVIS — Módulo: Comissionamento

> Capturado via built-in browser, sessão de consultor logada (Andrade, consultor id=142), loja 028.
> Data da captura: 2026-10-06

---

## 1. Navegação

Menu lateral SIVIS: `Comissionamento`
URL: `https://portal.sivisweb.com.br/loja/028/comissao`

Perfil: **consultor** (vê apenas suas próprias comissões).

---

## 2. UI observada

- Título: "Comissão"
- "Link do Consultor" (com botão Copiar): `https://portal.sivisweb.com.br/loja/028/consultor/{consultorId}` — link único público usado para captura de leads via QR/landing. Consultor ID visto: 142.
- Filtro de período: botões rápidos "Este mês" / "Hoje" + inputs "De" / "Até" (DD/MM/YYYY) + botão Filtrar.
- Tabs: **Comissão** · **Plano**.
- Cards de métricas (4 cards horizontais): **1ª Parcela**, **Plano**, **Serviço**, **Produto** (último cortado na tela mobile).
  - Cada card: quantidade (número grande) + valor BRL (R$ 0,00).

---

## 3. Endpoint: listar comissões (DataTables server-side)

**Request:**

```
GET /loja/028/api/dashboard/funcionario
  ?functionPage=GetComissaoFuncionario
  &inicio=01/10/2026
  &fim=06/10/2026
  &sEcho=1
  &iColumns=14
  &sColumns=,,,,,,,,,,,,,
  &iDisplayStart=0
  &iDisplayLength=10
  &mDataProp_0=0
  &mDataProp_1=parcela
  &mDataProp_2=2
  &mDataProp_3=data_venda
  &mDataProp_4=produto
  &mDataProp_5=preco_plano
  &mDataProp_6=preco_servico
  &mDataProp_7=preco_produto
  &mDataProp_8=comissao_plano_pri
  &mDataProp_9=comissao_plano
  &mDataProp_10=comissao_servico
  &mDataProp_11=comissao_produto
  &mDataProp_12=valor_comissao
  &mDataProp_13=13
  &_=1791303782547
```

**Observações:**

- Formato clássico DataTables 1.9 server-side (`sEcho`, `iDisplayStart`, `iDisplayLength`, `mDataProp_N`).
- Datas em formato `DD/MM/YYYY`.
- `_=<timestamp>` para cache-bust.
- Response (não capturada ainda — tabela estava vazia no período testado 01-06/10/2026).

**Modelo inferido** (colunas = campos):

| Campo | Tipo | Notas |
|---|---|---|
| `parcela` | string/number | número da parcela |
| `data_venda` | DD/MM/YYYY | data da adesão |
| `produto` | string | nome do produto vendido |
| `preco_plano` | BRL | valor mensal do plano |
| `preco_servico` | BRL | valor de serviços adicionais |
| `preco_produto` | BRL | valor de produtos adicionais |
| `comissao_plano_pri` | BRL | comissão da 1ª parcela do plano (geralmente maior) |
| `comissao_plano` | BRL | comissão recorrente do plano |
| `comissao_servico` | BRL | comissão em cima do serviço |
| `comissao_produto` | BRL | comissão em cima do produto |
| `valor_comissao` | BRL | valor total que o consultor recebe nesta linha |
| colunas 0, 2, 13 | — | provavelmente ID, flags de status/pagamento |

---

## 4. Endpoints auxiliares disparados no carregamento do dashboard

```
GET /loja/028/api/portal/portal?functionPage=getInfo   → info da loja (nome, logo?)
GET /loja/028/api/dashboard/dashboard?functionPage=GetDashboard   → stats agregados da home
POST /loja/028/api/portal/usuario   → já conhecido (login/sessão)
```

---

## 5. Para o HUB

### 5.1 `packages/core/commission/`

Modelo mínimo:

```ts
interface Commission {
  id: string;
  consultantId: string;
  invoiceId: string;         // boleto que gerou
  membershipId: string;      // adesão
  productName: string;
  parcelaNumber: number;     // 1 = adesão, 2+ = recorrência
  planAmountCents: number;
  serviceAmountCents: number;
  productAmountCents: number;
  commissionFirstCents: number;    // comissão 1ª parcela (diferenciada)
  commissionPlanCents: number;
  commissionServiceCents: number;
  commissionProductCents: number;
  totalCommissionCents: number;
  status: 'pending' | 'paid' | 'cancelled';
  saleDate: Date;
  paidAt?: Date;
}
```

### 5.2 `apps/consultor/comissao/`

Tela equivalente:
- Link único de captura por consultor (QR code + copy)
- Filtro de período
- Tabela paginada (DataTables → shadcn `<DataTable>`)
- Cards agregadores (soma por categoria)
- Export CSV/PDF

### 5.3 Diferencial HUB sobre SIVIS

- Projeção de comissão futura (próximos 12 meses de recorrência)
- Antecipação (saque antes do vencimento com desconto configurável)
- Split automático no Asaas no momento do pagamento (não precisa de ciclo mensal manual)

---

## 6. Pendente

- [ ] Capturar response real com dados (precisa período com vendas)
- [ ] Mapear tab "Plano" (fluxo diferente da aba Comissão?)
- [ ] Confirmar significado das colunas 0, 2 e 13 (provavelmente ID + flags)
- [ ] Testar export (se houver botão)
