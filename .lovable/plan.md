## Problema

Ao acessar `/recrutamento/kanban`, o app mostra "Candidato não encontrado" em vez do quadro Kanban.

## Causa

O arquivo `src/routes/_authenticated/recrutamento.kanban.tsx` existe, mas **não foi registrado** em `src/routeTree.gen.ts`. As únicas rotas filhas de `/recrutamento` listadas hoje são: `index`, `dashboard` e `$id`.

Como `kanban` não está na árvore, o roteador casa a URL com a rota dinâmica `recrutamento/$id` (`id = "kanban"`), que busca um candidato com esse ID, não encontra e mostra "Candidato não encontrado".

## Correção

Em `src/routeTree.gen.ts`, adicionar a rota `AuthenticatedRecrutamentoKanbanRoute` em todos os pontos análogos aos da `dashboard`:

1. `import` no topo apontando para `./routes/_authenticated/recrutamento.kanban`.
2. Declaração `const AuthenticatedRecrutamentoKanbanRoute = AuthenticatedRecrutamentoKanbanRouteImport.update({ id: '/kanban', path: '/kanban', getParentRoute: () => AuthenticatedRecrutamentoRoute })`.
3. Incluir em `AuthenticatedRecrutamentoRouteChildren` (junto com `dashboard`, `$id`, `index`).
4. Adicionar nas três interfaces de rota (`FileRoutesByFullPath`, `FileRoutesByTo`, `FileRoutesById`) e nos respectivos union types de `fullPaths`/`to`/`id`.
5. Registrar no `Register` module com id `'/_authenticated/recrutamento/kanban'`.

## Fora do escopo

- Não mexer em lógica do Kanban, RLS, dados ou outros componentes — é puramente de roteamento.
- Não tocar nos outros arquivos da pasta.
