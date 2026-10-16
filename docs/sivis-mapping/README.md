# SIVIS Mapping — Base de conhecimento para substituir o SIVIS

Esta pasta foi importada do `C:/Users/admin.immuno/Desktop/LOOG HUB/` em 2026-10-16
após decisão arquitetural de arquivar o LOOG HUB (monorepo) e consolidar tudo
no LOOG-STUDIO-DEPLOY como novo SIVIS (ver memory `project_loog_estrategia.md`).

## Conteúdo
- **hub-docs/09-analise-consolidada.md** — mapeamento reverso completo do portal.sivisweb.com.br (12 services JS, inventário SIVIS, lacunas). ATIVO PRINCIPAL.
- **sivis-ref/** — pasta com reverse-engineering: ARCHITECTURE, LIVE_NOW, screenshots PNG, portal-services, src/.
- **HUB-SPEC.md** — spec dos 22 fluxos operacionais que o novo SIVIS precisa cobrir.
- **HUB-ROADMAP.md** — 6 fases planejadas (hoje: cumprir no STUDIO, não no HUB).
- **HUB-README.md** + **HUB-CHANGELOG.md** — contexto da decisão de 2026-10-06 (Hinova recusada, Asaas, LOOG como ERP próprio).

## Por que foi arquivado
O LOOG HUB virou museu de intenções: 90% documentação + 10% código funcional (só vistoria PWA). Overlap confuso com STUDIO sem contrato de dono. Decisão trilha A da auditoria 360° de 2026-10-15: absorver vistoria funcional pro STUDIO, preservar docs aqui, arquivar o resto.

## Como usar
Qualquer feature nova do STUDIO que precise substituir funcionalidade SIVIS deve
consultar `hub-docs/09-analise-consolidada.md` ANTES de reinventar. O mapeamento
reverso já foi feito — reusar.
