## Problema

Quando uma coluna tem centenas de cards (ex: 534 leads em "Novo contato em massa"), a página inteira cresce indefinidamente, dificultando arrastar entre colunas e rolar até o rodapé. As demais colunas ficam "presas" no topo enquanto a longa força scroll vertical na página.

## Solução

Cada coluna do Kanban passa a ter **altura máxima fixa com scroll interno próprio**. Assim:
- A página não cresce mais do que a viewport.
- Cada coluna rola independentemente.
- O cabeçalho/filtros ficam sempre visíveis.
- Drag-and-drop continua funcionando normalmente entre colunas.

## Arquivos a ajustar

Aplicar o mesmo padrão de altura+scroll nas colunas destes Kanbans:

1. `src/components/BulkKanbanBoard.tsx` — Kanban Leads em Massa (compra e captação)
2. `src/routes/_authenticated/kanban.tsx` — Kanban geral
3. `src/routes/_authenticated/kanban-captacao.tsx` — Kanban Captação
4. `src/routes/_authenticated/recrutamento.kanban.tsx` — Kanban Recrutamento

## Mudanças técnicas

Na função `Column` de cada arquivo:

- Container da coluna recebe `max-h-[calc(100vh-220px)]` (ou valor equivalente) e vira `flex flex-col`.
- A área interna que lista os cards ganha `overflow-y-auto` + `pr-1` (para não cortar sombra dos cards).
- O cabeçalho da coluna (nome + contador) permanece fixo no topo da coluna via `shrink-0`.
- Adicionar um contador discreto tipo "mostrando X de Y" quando a coluna tiver mais de 50 cards, para reforçar que há mais conteúdo abaixo.

No container externo das colunas:
- Trocar o `overflow-x-auto pb-4` solto por um wrapper que respeite a altura da viewport, evitando que o body inteiro role.

## Não muda

- Lógica de drag-and-drop (dnd-kit já lida com auto-scroll dentro de containers roláveis).
- Queries / filtros / ações dos cards.
- Estilo visual dos cards individuais.

## Resultado esperado

- Página fica contida na viewport.
- Colunas com muitos leads rolam internamente.
- Comparação visual entre colunas fica muito mais fácil.
