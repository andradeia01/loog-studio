# SIVIS — Inventário de Engenharia Reversa

> Documento vivo. Atualizado sempre que novos endpoints forem descobertos.
> Última atualização: 2026-10-06.

Portal operado pela LOOG hoje: `https://portal.sivisweb.com.br/loja/028`.
Desenvolvido por **SIVIS TECNOLOGIA** · SAC (24) 99911-2888 · footer da loja 028.

---

## 1. Mapeamento já realizado (código em `SDR - LOOG - PROTEÇÃO VEICULAR/src/providers/sivisweb/`)

### 1.1 Autenticação e sessão

| Endpoint | Método | Form fields | Resposta | Observação |
|---|---|---|---|---|
| `/loja/{storeId}/api/portal/usuario` | POST | `functionPage=restrictedArea`, `email`, `password` | `true` (sucesso) ou `false`/erro | Cookies de sessão retornados. XHR com `X-Requested-With: XMLHttpRequest`. |
| `/loja/{storeId}/dashboard` | GET | — | HTML dashboard | Chamada obrigatória pós-login para "ativar" a sessão. |
| `/loja/{storeId}/api/dashboard/funcionario` | POST | `functionPage=criarSessaoConsultor`, `rapido=1` | `["ok"]` | Cria sessão de consultor em modo "rápido" (cotação rápida). |

**Headers obrigatórios** (SIVIS tem Cloudflare bot-challenge):

```
Accept: application/json, text/javascript, */*; q=0.01
User-Agent: Mozilla/5.0 ... Chrome/154 ...
Referer: https://portal.sivisweb.com.br/loja/028/cliente
Origin: https://portal.sivisweb.com.br
sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform, Sec-Fetch-*: valores de Chrome real
X-Requested-With: XMLHttpRequest  (quando ajax)
```

### 1.2 Veículo por placa

| Endpoint | Método | Query | Resposta |
|---|---|---|---|
| `/loja/{storeId}/api/portal/veiculo` | GET | `functionPage=BuscaPlaca`, `placa=ABC1D23`, `id_veiculo=` | `{Marca, Modelo, AnoModelo, Combustivel, SiglaCombustivel, CodigoFipe, Valor, MesReferencia, TipoVeiculo, Placa}` ou 404 |

Content-Type da resposta pode vir `text/html` mas o body é JSON — parsear sempre.

### 1.3 CRM — Lead (cotação)

| Endpoint | Método | Form principal | Função |
|---|---|---|---|
| `/loja/{storeId}/api/portal/crm` | POST | `functionPage=salvarLead`, `nome`, `celular`, `procedencia`, `veiculo[valor]`, `veiculo[marca]`, `veiculo[modelo]`, `veiculo[ano_modelo]`, `veiculo[codigo_fipe]`, `veiculo[combustivel]`, `veiculo[mes_referencia]`, `veiculo[sigla_combustivel]`, `veiculo[placa]`, `veiculo[tipo_veiculo]`, `veiculo[consulta_fipe]`, `veiculo[id]` | Cria lead → retorna `{id}` |
| mesmo endpoint | POST | `id=<leadId>`, acima + `plano[nome]`, `plano[produto_id]`, `plano[valor_mensal]`, `plano[taxa_adesao]`, `plano[valor_total]`, `plano[coberturas][i][id/nome/valor]`, `plano[acessorios][i][id/nome/valor]` | Atualiza lead com plano escolhido |

### 1.4 Produtos e coberturas

| Endpoint | Método | Form | Resposta |
|---|---|---|---|
| `/loja/{storeId}/api/portal/produto` | POST | `functionPage=buscarServicos`, `tipo_veiculo`, `valor` (reais inteiro), `marca` (brandCode), `ano_modelo` | `{produtos: [{id, nome, descricao, valor_mensal, taxa_adesao, piso_franquia, recomendado, acessorios: [...], servicos: [...]}]}` |
| mesmo endpoint | POST | `functionPage=buscarCoberturas`, `tipo_veiculo`, `produto_id`, `valor` | `{coberturas: [{id, nome, descricao, cobertura, valor, padrao, so_padrao, ...}]}` |
| mesmo endpoint | POST | `functionPage=getModeloWhats` (não mais usado — LOOG Studio sobrescreve) | Template WhatsApp padrão da SIVIS |

### 1.5 Impressão de cotação (PDF)

| Endpoint | Método | Query | Resposta |
|---|---|---|---|
| `/loja/{storeId}/api/dashboard/pendencia` | GET | `functionPage=imprimirRapida`, `id` (consultorId), `acessorios` (CSV), `placa`, `marca`, `modelo`, `ano_modelo`, `codigo_fipe`, `mes_referencia`, `valor` (BRL formatado), `id_convenio` | HTML/PDF |

### 1.6 Modelo de dados exposto (inferido pelo HAR)

```
veiculo:
  valor (BRL formatado "R$ 52.435,00")
  marca (string texto)
  marca_codigo (string "22" por ex)
  modelo (string completo)
  modelo_codigo (string "8445")
  ano_modelo (number)
  ano_codigo (string "2021-5")
  codigo_fipe (string "003463-0")
  mes_referencia (string "setembro de 2026")
  combustivel (string "Flex")
  sigla_combustivel (string "F|G|D|E")
  placa (string)
  tipo_veiculo (number 1=passeio, 2=moto, 3=utilitário?)
  consulta_fipe (0|1)

cliente/lead:
  nome
  celular (formato "(DD) 9XXXX-XXXX")
  procedencia (ID — 29 default LOOG)

plano:
  nome, produto_id
  valor_mensal (BRL)
  taxa_adesao (BRL)
  valor_total (BRL = mensal + coberturas + acessórios)
  coberturas[]: {id, nome, valor}
  acessorios[]: {id, nome, valor, padrao}
```

### 1.7 URLs públicas conhecidas

- `https://portal.sivisweb.com.br/loja/028` — landing LOOG
- `https://portal.sivisweb.com.br/loja/028/cliente/{leadId}` — detalhe do lead no portal
- `https://portal.sivisweb.com.br/loja/028/dashboard` — dashboard do consultor
- `https://www.sivisweb.com.br/` — landing institucional SIVIS (só login)

---

## 2. Lacunas (a mapear logado — requer Andrade)

Os módulos abaixo aparecem no SIVIS mas ainda não têm endpoint mapeado. Lista ordenada por prioridade para substituir no HUB.

### 2.1 Associados (gestão completa)

- Listagem com filtro (ativo, inadimplente, cancelado, com apólice, sem apólice)
- Detalhe do associado (abas: cadastro, veículos, pagamentos, sinistros, vistorias, documentos, histórico)
- CRUD de endereço
- Alteração de dados sensíveis (CPF, email) — ver política de bloqueio
- Vinculação consultor/corretor
- Status: ativo, inativo, inadimplente, suspenso, cancelado

### 2.2 Veículos (gestão operacional)

- Adicionar/remover veículo de associado existente
- Troca de veículo (encerra proteção antigo + abre novo)
- Transferência entre associados (venda do veículo)
- Histórico de sinistros/vistorias por placa

### 2.3 Financeiro

- Geração de boleto avulso
- Lote mensal de boletos
- Baixa manual (cheque, PIX fora do sistema)
- Cancelamento de boleto
- Reemissão (2ª via)
- Acordo de pagamento (negociação de inadimplentes)
- Contas a pagar / contas a receber (MGF — Módulo de Gestão Financeira)
- Fluxo de caixa diário
- Conciliação bancária
- Comissionamento consultor (cálculo + extrato)
- Split de pagamento (quem recebe quanto)

### 2.4 Vistorias (APP Visto)

- Agendamento de vistoria (novo veículo, renovação anual, revistoria de inadimplente)
- Checklist por tipo de veículo (passeio, moto, utilitário)
- Captura de foto obrigatória por posição (frontal, traseira, laterais, chassi, hodômetro, interior)
- GPS + timestamp assinados
- Assinatura do associado (canvas)
- Aprovação pelo admin
- Status: pendente, em andamento, aprovada, reprovada, suspensa
- Geração de laudo PDF
- Fluxo de revistoria (dispara automaticamente após inadimplência resolvida)

### 2.5 Sinistros

- Abertura (associado via app ou admin manual)
- Tipos: furto, roubo, colisão, incêndio, danos a terceiros, carro reserva, assistência, outros
- Upload de B.O. + CRLV + fotos do dano
- Workflow: aberto → análise → investigação → aprovado/negado → pagamento/encerramento
- Comunicação com oficina/perito
- Pagamento ao fornecedor
- Histórico por associado + por placa
- Taxa de sinistralidade (relatório)

### 2.6 Assistência 24h

- Rede de parceiros (guincho, chaveiro, pneu, mecânico, sem-partida) por região (CEP ou cidade)
- Acionamento pelo associado (app)
- Status: solicitado → aceito → despachado → chegou → concluído
- SLA por tipo
- Avaliação pós-atendimento

### 2.7 Documentos

- Regulamento (versionado)
- Apólice (gerada por adesão + por renovação)
- Comprovantes diversos
- Rules: só o associado baixa a sua, admin baixa qualquer

### 2.8 Eventos

- Cadastro de evento (nome, data, local, capacidade)
- Inscrição (associado ou público)
- Check-in (QR code?)
- Lista de presença exportável
- Comunicação com inscritos

### 2.9 Rede de atendimento

- Oficinas credenciadas
- Vantagens e benefícios (parcerias comerciais)
- Localização por CEP
- Categoria (mecânica, chapeiro, elétrica, borracharia, farmácia, etc.)

### 2.10 Fornecedores

- Cadastro (CNPJ, contato, dados bancários)
- Vinculação a tipo de serviço (sinistro, assistência, vistoria terceirizada)
- Pagamento (contas a pagar)
- Avaliação de desempenho

### 2.11 Convênios

- Empresas que trazem associados (grupo, cooperativa, sindicato)
- Comissão especial por convênio
- Rastreio de origem de leads

### 2.12 Mídias (quadro)

- Banners institucionais no app
- Vídeos / comunicados
- Agendamento de exibição

### 2.13 Relatórios

- Faturamento (mensal, anual, por consultor, por produto)
- Ativos vs cancelados vs inadimplentes
- Sinistralidade (frequência + severidade)
- LTV / CAC
- Vistorias (média de tempo, taxa de reprovação)

### 2.14 Comunicação

- Envio em massa (SMS, Email, WhatsApp)
- Segmentação (por região, por status, por plano)
- Templates reutilizáveis

### 2.15 Admin / Config

- Usuários do sistema + perfis (RBAC)
- Permissões por módulo
- Feature flags
- Logs de auditoria

---

## 3. Protocolo para completar a engenharia reversa

Como as regras do assistente proíbem logar em serviços externos com credenciais do cliente, o mapeamento das lacunas vai assim:

1. Andrade abre o portal.sivisweb.com.br/loja/028 logado em sessão própria.
2. Com DevTools (aba Network) aberta, Andrade navega por um módulo da lista acima (ex: Vistorias).
3. Para cada ação (listar, criar, editar, aprovar), copia o request:
   - URL + Method
   - Form data (ou JSON body)
   - Resposta (truncada se grande)
   - Status code
4. Cola no issue correspondente em `docs/sivis-exploration/<modulo>.md`.
5. Claude (sessões futuras) processa, infere o modelo, e atualiza este inventário.

Alternativa automática (requer Andrade):

- Instalar o **REA MCP** (`tools/rea/`) e dar acesso ao DevTools do browser logado.
- REA captura automaticamente requests enquanto Andrade navega.
- Export para HAR → Claude lê e inventaria.

Sessão típica: 1 hora por módulo. Mapear os 15 módulos acima = ~15h concentradas distribuídas em 3 semanas.

---

## 4. Credenciais e segurança

Credenciais SIVIS atuais (vide `.env` do SDR folder — mantidas offline):

- `SIVISWEB_USERNAME` — email de consultor da LOOG
- `SIVISWEB_PASSWORD` — senha (deve ser rotacionada; há duas na documentação)
- `SIVISWEB_STORE_ID=028`

**Boas práticas:**

- Criar usuário de serviço dedicado (não o do Andrade pessoal)
- Permissões mínimas: dashboard, portal, produto, CRM — nada mais
- Rotacionar trimestralmente
- Nunca commitar `.env`

---

## 5. Riscos de reverse engineering

- SIVIS tem **Cloudflare bot-challenge** em alguns endpoints FIPE. O adapter já contorna com User-Agent + Referer de Chrome real.
- Mudanças no SIVIS podem quebrar o adapter sem aviso. Monitorar com smoke test diário na API `/health` do Hub (SDR).
- Base de dados do SIVIS tem associados reais da LOOG. **Qualquer operação de bulk** (export, migração) exige backup prévio + validação em sandbox antes.
- **Nunca usar o adapter para operações destrutivas** (cancelar associado, excluir boleto) enquanto o SIVIS for a fonte da verdade. Dual-write só para criar + atualizar.

---

## 6. Próximas ações

1. Andrade loga e captura requests do módulo **Vistorias** (prioridade: fase 4 do roadmap).
2. Em paralelo, scaffold do `apps/vistoria` com mock provider.
3. Quando mapeamento Vistoria estiver completo, implementar provider SIVIS no adapter + migração reversa.

Repetir para Sinistros, Financeiro, Eventos, etc. — sempre casando mapeamento com fase do roadmap.
