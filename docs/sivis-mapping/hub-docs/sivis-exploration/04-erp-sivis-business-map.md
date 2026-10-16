# SIVIS Business (ERP) — Mapa de módulos

> Capturado via `sivisweb.com.br/index.php` com perfil **ADMINISTRATIVO** (NORBERTO SILVA, empresa 028 LOOG PROTEÇÃO VEICULAR).
> Data: 2026-10-06
> Técnica: leitura do menu lateral renderizado + JS loaded.

Esse é o backend operacional da LOOG — distinto do portal SIVIS que mapeamos antes. O portal consome dados daqui. **Esse ERP é a fonte da verdade** de associados, veículos, financeiro, sinistros e vistorias.

---

## 1. Produto

**Marca:** SIVIS Business (title da página: "Sivis Business"; página de login: "SIVIS Finance")
**Stack:** PHP legado + jQuery 1.9.1 + jQuery UI 1.10.1 + Bootstrap 3 + fullcalendar + select2 + jQuery DataTables + custom util.js
**Multi-tenant:** por empresa (`emp=028` para LOOG) em `/Pessoas/<empresa_id>/Empresa/`
**Perfil atual:** ADMINISTRATIVO

---

## 2. Mapa completo de rotas (menu lateral)

### 2.1 Página Principal

- `/index.php` — dashboard com "Minhas Pendências" + calendário + lista de contatos online/offline

### 2.2 BI — Estatísticas

**Gestão:**
- Auditoria — `/Modulos/BI/BI-Auditoria.php`
- Matrículas × Renovações — `/Modulos/BI/BI-Matriculas-Renovacoes.php`
- Retenção (Churn) — `/Modulos/BI/BI-Churn.php`
- Inadimplência — `/Modulos/BI/BI-Inadimplencia.php`
- Evasão — `/Modulos/BI/BI-Evasao.php`
- Rentabilidade de Carteira — `/Modulos/BI/BI-Rentabilidade-Carteira.php`

**Financeiro:**
- Mapa de Equipe — `/Modulos/BI/BI-Mapa.php`

### 2.3 Administrativo

**Cadastros:**
- Clientes — `/Modulos/Comercial/Gerenciador-Clientes.php` ★ (listagem de associados)
- Fornecedores — `/Modulos/Financeiro/Fornecedores-de-despesas.php`
- Funcionários — `/Modulos/Financeiro/Funcionarios.php`
- Usuários — `/Modulos/Comercial/Usuarios.php` (usuários do SIVIS, não associados)

**Cadastros Financeiros:**
- Comissão de Clientes — `/Modulos/Seguro/ComissaoClientes.php`

**Cadastros CRM:**
- Indicadores — `/Modulos/CRM/Indicadores.php` (quem indicou cada lead)

### 2.4 Financeiro

**Lançamentos:**
- Contas Fixas — `/Modulos/Financeiro/Lancamento-de-Movimentos.php?tp=1`
- Contas Variáveis — `/Modulos/Contas-a-pagar/Solicitacao-de-Autorizacao.php?id=1`
- Contas à Receber — `/Modulos/Contas-a-pagar/Contas-a-Receber.php?id=1&tp=0`
- Fluxo de Caixa — `/Modulos/Contas-a-pagar/Fluxo-de-Caixa.php`
- Comissões — `/Modulos/Seguro/Comissoes.php`

**Controle:**
- Vendas — `/Modulos/Estoque/Vendas.php?id=1`
- **Gerar Boletos** — `/Modulos/Clube/Gerar-Boletos.php` ★★ (emissão de boleto em lote)
- Conciliação Bancária — `/Modulos/Contas-a-pagar/Conciliacao-Bancaria.php`

### 2.5 Estoque

**Compras:**
- Compras — `/Modulos/Estoque/Compras.php`

### 2.6 CRM

**Lançamentos:**
- Leads — `/Modulos/CRM/Lead.php`
- Prospects — `/Modulos/CRM/Gerenciador-Prospects.php`

### 2.7 Proteção ★★★

**Gerenciamento:**
- Veículos — `/Modulos/Seguro/Veiculos.php`
- **Vistorias** — `/Modulos/Seguro/Vistorias.php` ★★
- **Eventos** — `/Modulos/Seguro/Sinistros.php` ★★ (⚠️ UX chama "Eventos" mas aponta pra Sinistros.php — SIVIS trata sinistro como "evento" no vocabulário)

---

## 3. Convenção de pastas descoberta

```
/Modulos/
├── BI/                      Business Intelligence / dashboards
├── Comercial/               Clientes + usuários do sistema
├── CRM/                     Leads, prospects, indicadores
├── Clube/                   Boletos (emissão em lote)
├── Contas-a-pagar/          Contas a pagar/receber + fluxo de caixa + conciliação
├── Estoque/                 Vendas + compras
├── Financeiro/              Fornecedores + funcionários + lançamentos
└── Seguro/                  Proteção veicular (Veículos, Vistorias, Sinistros, Comissões)
```

Padrão de URL: `Nome-Separado-Por-Hifens.php?id=X&tp=Y` (query params comuns: `id`, `tp` para filtros rígidos).

---

## 4. Observações

### 4.1 "Eventos" = Sinistros

A UX usa **"Eventos"** no menu, mas o arquivo é `Sinistros.php`. Isso é importante: no vocabulário interno da LOOG, "evento" é um sinistro (acidente, roubo, furto, danos). Modelar `Claim` no HUB mas aceitar "Evento" como label legacy quando falando com usuários acostumados ao SIVIS.

### 4.2 "Clube" sugere modelo de proteção

O boleto é emitido no módulo `Clube/` — reforça que a LOOG opera o modelo **"clube de proteção veicular / proteção associativa"** (não seguradora). Impacto jurídico: a entidade é uma associação, não uma seguradora SUSEP. HUB precisa respeitar essa nuance (não dizer "apólice" nos endpoints legais, usar "contrato de proteção").

### 4.3 Comissões aparecem em dois lugares

- **Cadastros Financeiros → Comissão de Clientes** (`/Modulos/Seguro/ComissaoClientes.php`) — regra/tabela
- **Financeiro → Lançamentos → Comissões** (`/Modulos/Seguro/Comissoes.php`) — extrato

Reforça o que vimos no portal: comissão é tratada como lançamento financeiro.

### 4.4 Multi-tenant via query param

Login usa `?emp=028` para pré-popular empresa. Suportar isso no HUB para parceiros/corretoras que operem múltiplas carteiras.

### 4.5 Chat interno via heartbeat

`/Connections/chat.php?action=chatheartbeat` dispara a cada ~1s (visto 197+ requests capturadas no network tab). Chat interno entre funcionários LOOG (visto na UI: "On-line / Off-line" com fotos). **No HUB:** usar Supabase Realtime ou canal próprio.

### 4.6 BI é extenso

7 relatórios BI prontos: Auditoria, Matrículas×Renovações, Churn, Inadimplência, Evasão, Rentabilidade de Carteira, Mapa de Equipe. Isso é diferencial comercial do SIVIS — HUB precisa ter equivalentes antes do ponto de corte senão a diretoria vai sentir a perda.

---

## 5. Stack do ERP legado (pra referência durante migração)

Scripts carregados nesta sessão:
- jQuery 1.9.1 + jQuery UI 1.10.1 + jQuery Migrate 1.1.1 + Globalize
- Bootstrap 3 (bootstrap.min.js)
- select2
- justgage (medidores radiais)
- moment.js + fullcalendar + locale-all
- jQuery DataTables (tabelas server-side)
- fancybox (modais via iframe — função `abrirTelaBox2` em util.js)
- sparklines, mcustomscrollbar, uniform, mousewheel
- jquery.cookies 2.2.0
- `/js/actions.js` (cookies helper), `/js/plugins.js` (initializers), `/js/util.js` (abrirTelaBox2 + helpers)

**Implicação:** navegação do SIVIS Business usa muita **janela modal iframe** (`abrirTelaBox2(pagina, altura, largura)`). Formulários abrem em modal em cima de listagens. Para capturar os endpoints de cada tela admin, precisa clicar e observar.

---

## 6. Próximo passo

Clicar em (ordem de prioridade):

1. **Veículos** → `/Modulos/Seguro/Veiculos.php` (modelo de dados de veículo admin)
2. **Vistorias** → `/Modulos/Seguro/Vistorias.php` (fluxo completo vistoria interno)
3. **Eventos (Sinistros)** → `/Modulos/Seguro/Sinistros.php`
4. **Gerar Boletos** → `/Modulos/Clube/Gerar-Boletos.php` (fluxo de emissão em lote)
5. **Gerenciador-Clientes** → `/Modulos/Comercial/Gerenciador-Clientes.php` (ficha completa associado)
6. **Fluxo de Caixa** + **Contas a Receber** (financeiro operacional)
7. **BI Auditoria** + **BI Inadimplência** (para benchmark de relatórios)

Cada clique: capturo as requests XHR + os JS da página + o modelo inferido.
