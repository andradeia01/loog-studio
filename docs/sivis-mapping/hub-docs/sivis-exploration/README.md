# SIVIS — Exploração dirigida (logado)

Este diretório é onde o **Andrade** cola captures de rede do SIVIS enquanto navega logado. Cada módulo = 1 arquivo. Claude processa, infere o modelo, atualiza o `docs/01-sivis-inventory.md`.

---

## Protocolo

1. Abrir `https://portal.sivisweb.com.br/loja/028` em Chrome (não anônimo — reusa sessão).
2. Logar com usuário de serviço (nunca o pessoal).
3. Abrir DevTools (F12) → aba **Network**.
4. Marcar **Preserve log** e **Fetch/XHR** como filtro.
5. Clear log (ícone 🚫).
6. Executar UMA ação (ex: abrir a tela de "Nova vistoria").
7. Pra cada request novo em XHR/Fetch:
   - Botão direito → **Copy as cURL (bash)** → cola no arquivo do módulo.
8. Repetir para cada ação do módulo (listar, criar, editar, aprovar, excluir, exportar).
9. Commit no HUB. Claude processa no próximo turno.

**Nunca** colar aqui: tokens de autenticação, senhas, CPF de associados reais. Mascarar com `***`.

---

## Alternativa — HAR export

Em vez de cURL por request:

1. Fazer as ações normalmente.
2. No DevTools Network → botão direito → **Save all as HAR with content**.
3. Salvar em `docs/sivis-exploration/<modulo>.har`.
4. Antes de commitar, rodar `scripts/scrub-har.ts` para mascarar PII (ainda a criar).

---

## Alternativa — REA MCP

`tools/rea/` instala um MCP de reverse engineering. Com ele, o Claude pode "ver" seu DevTools enquanto você navega, sem exigir cola manual. Requer:

- Ativar REA MCP no claude.ai
- Autorizar acesso ao Chrome
- O MCP captura network traces durante uma sessão de exploração

Em avaliação. Por ora, protocolo manual (cURL/HAR) é suficiente.

---

## Módulos a mapear (ordem de prioridade pelo roadmap)

| # | Módulo | Fase roadmap | Status |
|---|---|---|---|
| 1 | Vistorias | Fase 4 | ⬜ pending |
| 2 | Sinistros | Fase 5 | ⬜ pending |
| 3 | Assistência 24h | Fase 5 | ⬜ pending |
| 4 | Financeiro (boletos, baixa, acordos) | Fase 3 | ⬜ pending |
| 5 | Associados (gestão completa) | Fase 1 | ⬜ pending |
| 6 | Veículos (operacional) | Fase 1 | ⬜ pending |
| 7 | Documentação (apólice, regulamento) | Fase 2 | ⬜ pending |
| 8 | Rede de atendimento | Fase 5 | ⬜ pending |
| 9 | Fornecedores | Fase 6 | ⬜ pending |
| 10 | Eventos | Fase 7 | ⬜ pending |
| 11 | Convênios | Fase 2 | ⬜ pending |
| 12 | Comissionamento consultor | Fase 2 | ⬜ pending |
| 13 | Relatórios internos | Fase 7 | ⬜ pending |
| 14 | Comunicação (SMS/email/WhatsApp em massa) | Fase 7 | ⬜ pending |
| 15 | Admin/config/RBAC | Fase 6 | ⬜ pending |

---

## Template para cada módulo

Copie `_template.md` e renomeie para o módulo:

```bash
cp _template.md 01-vistorias.md
```
