## Objetivo

Permitir mudar data/hora de um compromisso na `/agenda` **arrastando** o card pela grade da semana, com snap de 30 min. Hoje só dá pra mudar pelo popover (campo data/hora).

## Mudança (somente em `src/routes/_authenticated/agenda.tsx`)

Usar HTML5 nativo drag-and-drop (sem nova dependência), reutilizando a lógica de save já existente em `EventPopover.save()`.

### 1. Tornar o card do evento arrastável

No `EventPopover`, o botão do evento ganha:
- `draggable`
- `onDragStart`: grava no `dataTransfer` `eventId`, `oldIso`, `kind`, `candidateOrLeadId`, e o `offsetY` do cursor dentro do card (para o evento "grudar" no cursor durante o drop).
- Visual: leve opacidade durante o drag.

### 2. Coluna do dia vira drop target

Cada `<div>` da coluna do dia em `AgendaPage` ganha:
- `onDragOver`: `preventDefault()` (necessário para permitir drop) + linha-guia visual mostrando onde vai cair (estado local `dropPreview`).
- `onDragLeave`: limpa a guia.
- `onDrop`: calcula o novo horário e dispara o reschedule.

### 3. Cálculo do novo horário

```text
rect = column.getBoundingClientRect()
y = clientY - rect.top - offsetYDentroDoCard
minutoDoDia = HOUR_START * 60 + round(y / PX_PER_MIN / SLOT_MIN) * SLOT_MIN
clamp em [HOUR_START*60, HOUR_END*60 - SLOT_MIN]
newDate = dia da coluna + minutoDoDia
```

### 4. Persistência

Extrair de `EventPopover.save()` uma função pura `rescheduleEvent({ eventId, candidateId, oldIso, kind, newIso, duration=30 })` que:
1. UPDATE em `broker_candidate_interactions` ou `lead_interactions` (pelo prefixo `bci-` / `li-`).
2. Se for entrevista e Google Calendar conectado → `updateGoogleCalendarEvent`.
3. Toasts iguais aos de hoje.
4. Invalida `["agenda", weekStartIso]`.

Essa função fica acessível no `AgendaPage` (level componente) para o handler `onDrop`. O `EventPopover.save()` também passa a chamá-la (sem mudar comportamento).

### 5. Status do Google Calendar no nível da página

Hoje cada `EventPopover` faz seu próprio `useQuery(["gcal-status"])` — já é deduplicado pelo react-query, então mover para o `AgendaPage` mantém o mesmo comportamento e expõe `calendarConnected` ao handler de drop.

### 6. Detalhes de UX

- Cursor `cursor-grab` no card; `cursor-grabbing` enquanto arrasta.
- Linha tracejada `border-primary` na posição que vai cair (preview), atualizada no `onDragOver`.
- Se soltar fora de uma coluna válida → não faz nada.
- Se o novo horário for igual ao atual (mesmo dia/hora após snap) → não dispara update.
- Mantém o popover (click) para edição fina via input.

## Fora do escopo

- Não muda altura do card por drag (sem resize).
- Não troca a fonte de dados nem RLS.
- Não mexe em outras telas (kanban, candidato, lead).
- Não adiciona biblioteca de drag-and-drop nova.
