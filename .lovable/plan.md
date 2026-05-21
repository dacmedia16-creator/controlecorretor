## Problema

`/recrutamento/kanban` e `/recrutamento/:id` não abrem — mostram o conteúdo da lista (`/recrutamento`).

**Causa:** no roteamento flat do TanStack, `recrutamento.tsx` virou layout-pai das rotas `recrutamento.kanban.tsx` e `recrutamento.$id.tsx`, mas não renderiza `<Outlet />`. Resultado: a URL casa, mas o filho não tem onde renderizar.

## Correção

Separar o layout do conteúdo da lista:

1. **Criar `src/routes/_authenticated/recrutamento.index.tsx`** com o conteúdo atual da lista (componente `RecrutamentoPage`), declarando `createFileRoute("/_authenticated/recrutamento/")`.

2. **Substituir `src/routes/_authenticated/recrutamento.tsx`** por um layout puro que apenas renderiza `<Outlet />`:
   ```tsx
   import { createFileRoute, Outlet } from "@tanstack/react-router";
   export const Route = createFileRoute("/_authenticated/recrutamento")({
     component: () => <Outlet />,
   });
   ```

3. **Não mexer** em `recrutamento.kanban.tsx`, `recrutamento.$id.tsx` nem `recrutamento.dashboard.tsx` — eles passam a renderizar corretamente dentro do Outlet.

4. **Não editar** `src/routeTree.gen.ts` — é gerado automaticamente.

## Validação

- `/recrutamento` → lista de candidatos
- `/recrutamento/kanban` → kanban
- `/recrutamento/dashboard` → dashboard
- `/recrutamento/<id>` → detalhe do candidato
