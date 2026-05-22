## Problema

A correção anterior colocou `max-h-[calc(100vh-220px)]` em cada `Column`, mas o screenshot mostra que a página ainda cresce sem fim. O motivo: `max-h` em `vh` na coluna não força a área externa (filtros + wrapper flex) a ter altura definida — o wrapper continua crescendo com o conteúdo e a página inteira rola.

A correção certa é **ancorar a altura desde o container externo do board** e propagar `h-full` até a área de scroll interna. Assim a página nunca cresce além da viewport e cada coluna rola sozinha.

## O que muda

Para cada um dos 4 Kanbans:

1. `src/components/BulkKanbanBoard.tsx` (Kanban Leads em Massa)
2. `src/routes/_authenticated/kanban.tsx`
3. `src/routes/_authenticated/kanban-captacao.tsx`
4. `src/routes/_authenticated/recrutamento.kanban.tsx`

### Mudanças técnicas

**No container externo do board (onde hoje está `flex gap-4 overflow-x-auto pb-4`):**
- Envolver em um wrapper com altura fixa: `h-[calc(100vh-180px)] overflow-hidden` (ajusto o offset por tela conforme a altura real do header+filtros).
- O flex interno vira `flex h-full gap-4 overflow-x-auto items-stretch pb-2`.

**Na função `Column`:**
- Trocar `max-h-[calc(100vh-220px)]` por `h-full` (já que o pai agora tem altura real).
- Manter `flex flex-col` no container e `flex-1 overflow-y-auto pr-1` na área dos cards.
- Manter `shrink-0` no header (nome + contador fica fixo no topo da coluna).
- Remover `min-h-[200px]` da área interna (atrapalhava o cálculo de altura quando há poucos cards).

**No componente raiz da página** (apenas onde necessário): garantir que o pai imediato do board não force `overflow-visible` nem altura automática. Se preciso, envolver com `flex flex-col` para que o wrapper de altura fixa do board funcione corretamente.

## Resultado esperado

- A página fica contida na viewport — sem scroll vertical na página.
- Cada coluna rola internamente, com header sempre visível.
- Drag-and-drop continua funcionando (dnd-kit faz auto-scroll dentro de containers roláveis).
- Comparação visual entre colunas fica imediata.

## Não muda

- Lógica de drag-and-drop, queries, filtros, ações dos cards, estilo dos cards.
- Tipo dos dados nem chamadas Supabase.
