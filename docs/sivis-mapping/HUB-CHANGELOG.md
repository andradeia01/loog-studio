# Changelog — LOOG HUB

Decisões relevantes e marcos. Não substitui git log; destila o que importa saber.

Formato: data · versão · categoria · descrição.

---

## 2026-10-06 · 0.1.0 · Fundação

- Decisão de escopo: **substituir SIVIS primeiro (Track A)**. Super-app (Track B, doc 17 do Halisson) fica como roadmap pós-MVP.
- Decisão de stack: **Next.js 15 + Prisma + Supabase + PWA** para todos os 4 apps (admin, portal, consultor, vistoria).
- Decisão de referenciar: pastas existentes no Desktop (`APP Loog`, `SOFTWARE - LOOG PROTEÇÃO VEICULAR`, `SDR - LOOG - PROTEÇÃO VEICULAR`, `HALISSON - LOOG`, `LOOG-STUDIO`) são **referência**; o HUB começa limpo e absorve o útil via import/copy, não via mudança destrutiva nas pastas-fonte.
- Decisão sobre a Hinova: **recusa** da proposta 13.166 (APP Associado + APP Visto + Hinova Pay + Power CRM + SGA, R$ 5.500 setup + mensalidades). Trocar SIVIS por Hinova não resolve dependência externa — construir proprietário é a resposta.
- Decisão sobre REA (reverse engineering tool): instalado em `tools/rea/`. Será usado para auxiliar o mapeamento SIVIS; **não** foi registrado como MCP global por decisão de segurança do classifier.
- Decisão sobre inventário SIVIS: endpoints de **cotação, lead, FIPE, veículo** já estão mapeados (código no SDR folder). Falta mapear vistorias, sinistros, financeiro, eventos, documentação, rede, fornecedores, convênios — exige o Andrade logado dirigindo exploração (regras impedem o assistente de digitar credenciais em serviços externos).
- Decisão sobre identidade visual: cobalto oficial LOOG é **`#0053FF`** (do `/APP Loog/`), não `#1E3AFF` (do doc 15). Logo `∞ LOOG` com white + cobalto.
- Decisão sobre pagamento: **Asaas** como primário (split nativo + Pix híbrido). Pagar.me como fallback. Validar com Halisson na fase 3.
- Estrutura inicial criada: `apps/`, `packages/`, `docs/`, `tools/rea/`, `scripts/`, `.github/workflows/` + arquivos canônicos (README, SPEC, ROADMAP, CHANGELOG, docs 01-02-05, package.json, pnpm-workspace, .gitignore).

Próximas decisões pendentes (listadas em `SPEC.md § 10` e `docs/02-arquitetura.md § 11`):

- Asaas vs Pagar.me (validar com diretoria)
- Supabase Pro vs auto-hospedado (fase 2)
- Admin em Next.js vs low-code temporário (recomendação: Next.js)
- Período de dual-write com SIVIS (30/60/90d)
- Nomes finais dos apps (admin/portal/consultor/vistoria são genéricos)
