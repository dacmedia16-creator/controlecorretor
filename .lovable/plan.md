# Kanban dentro de uma "janela" com scroll interno (X e Y)

## Objetivo
Transformar a área do kanban em um quadro fixo na viewport. A página em si não rola — apenas dentro do quadro acontece:
- scroll **horizontal** (deslizar entre colunas)
- scroll **vertical em cada coluna** (deslizar os cards)

Cabeçalho da página, filtros e header das colunas ficam sempre visíveis.

## Onde aplicar
Mesmas 4 telas já tocadas:
- `src/components/BulkKanbanBoard.tsx` (Kanban Leads em Massa — `/kanban-massa`)
- `src/routes/_authenticated/kanban.tsx`
- `src/routes/_authenticated/kanban-captacao.tsx`
- `src/routes/_authenticated/recrutamento.kanban.tsx`

## Mudanças (resumo técnico)

1. **Wrapper externo do kanban** vira a "janela":
   - `h-[calc(100vh-220px)] w-full overflow-hidden rounded-lg border bg-card/30 p-3`
   - (borda + fundo sutil para parecer um quadro real)

2. **Trilho de colunas** (filho direto da janela):
   - `flex h-full gap-4 overflow-x-auto overflow-y-hidden items-stretch`
   - É aqui que o scroll **horizontal** acontece — dentro do quadro, não na página.

3. **Cada coluna**:
   - `h-full w-[300px] shrink-0 flex flex-col` (largura fixa para forçar o overflow-x do trilho)
   - Header da coluna: `shrink-0`
   - Lista de cards: `flex-1 overflow-y-auto pr-1` (scroll **vertical** por coluna)

4. **Página/rota** ao redor: garantir que o container pai use `flex flex-col` e não force `overflow-visible`, para que o `h-[calc(100vh-220px)]` da janela seja respeitado.

## Resultado esperado
- A página não cresce mais conforme aumentam os leads.
- Existe um quadro visível ocupando a área útil da tela.
- Dentro do quadro: arrasta lateralmente para ver mais colunas; cada coluna rola sozinha verticalmente.
- Drag-and-drop continua funcionando normalmente.

## Ajustes opcionais (posso aplicar se pedir)
- Mudar o `220px` se sobrar/faltar espaço.
- Largura da coluna (300px) — posso deixar maior/menor.
- Tirar a borda do quadro se preferir sem moldura visual.