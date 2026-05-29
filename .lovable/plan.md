## Problema

Na grade da Agenda, cada card de compromisso está com altura fixa de ~28px (`30 * PX_PER_MIN - 2`, com `PX_PER_MIN = 1`). Isso corta o conteúdo do card pela metade — o horário aparece inteiro mas o nome do candidato/lead fica cortado (ex.: "Laiane Cásria", "Camila souza" aparecem com a segunda linha cortada).

## Causa

Em `src/routes/_authenticated/agenda.tsx`, a função `eventStyle` define:

```ts
height: `${30 * PX_PER_MIN - 2}px`  // = 28px
```

28px não cabe duas linhas de texto (horário + nome) com padding `py-1`.

## Correção proposta

Em `src/routes/_authenticated/agenda.tsx`:

1. Aumentar a densidade vertical da grade: mudar `PX_PER_MIN` de `1` para `1.5` (cada hora vira 90px em vez de 60px), dando mais respiro à coluna de horários.
2. Em `eventStyle`, garantir altura mínima suficiente para 2 linhas, usando `minHeight: 44px` além da altura calculada (eventos de 30min ainda terão altura proporcional, mas nunca menor que o necessário para mostrar horário + nome completos).
3. Manter o cálculo proporcional para eventos com duração diferente (futuro), apenas adicionando o piso de altura.

Nenhuma mudança em lógica de dados, RLS, ou Google Calendar. É puramente ajuste visual da grade semanal.

## Fora do escopo

- Mudar layout do popover ou comportamento de edição.
- Suporte a sobreposição de eventos no mesmo horário (já não trata isso hoje).
