# SIVIS — Módulo: <NOME>

> Captura do portal.sivisweb.com.br/loja/028 logado como consultor/admin.
> Data da captura:
> Usuário usado (ofuscado):

---

## 1. Navegação

Caminho no menu SIVIS: `Menu > ...`

Prints (opcional):

- (anexar como `<modulo>-tela-<N>.png`)

---

## 2. Ação: Listar <recurso>

**Request:**

```bash
curl 'https://portal.sivisweb.com.br/loja/028/api/portal/...' \
  -H 'Accept: ...' \
  -H 'Cookie: SESSION=***' \
  --data-raw 'functionPage=...'
```

**Resposta (resumida):**

```json
{
  "...": "..."
}
```

**Campos inferidos:**

| Campo | Tipo | Observação |
|---|---|---|
| `id` | string | — |
| ... | | |

---

## 3. Ação: Criar <recurso>

(Repetir estrutura acima)

---

## 4. Ação: Editar <recurso>

---

## 5. Ação: Aprovar / rejeitar

---

## 6. Ação: Exportar

---

## 7. Fluxos observados

Diagrama mental do fluxo:

```
Lista → Detalhe → Editar → Aprovar
                       └── Rejeitar
```

Regras de negócio observadas:

- (ex: "só pode aprovar se vistoria tem fotos de todas as 6 posições")

---

## 8. Lacunas

Perguntas em aberto depois dessa captura:

- [ ] ...

---

## 9. Próximas ações no HUB

- `packages/core/<modulo>/` deve suportar:
  - [ ] ...
- `apps/admin/<modulo>/` precisa das telas:
  - [ ] ...
- `packages/adapters/sivis/<modulo>.ts` para espelhar durante transição:
  - [ ] ...
