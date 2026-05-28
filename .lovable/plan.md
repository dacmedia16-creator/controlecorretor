# Mostrar data da entrevista mesmo quando já passou

## Diagnóstico
A consulta que alimenta o badge "📅 Entrevista" no kanban filtra:

```ts
.gte("next_follow_up_date", nowIso)   // só datas futuras
```

A entrevista da **Tainara Cristina** está marcada para **28/05 15:00 UTC** (≈ 12:00 BR) — agora já são 12:01 BR, então o filtro descarta a linha e o card fica sem o badge. A da **Gabi** é amanhã (29/05 10:00), então passa no filtro.

Resumo: o card "esquece" a entrevista assim que o horário passa, mesmo o candidato continuando na coluna *Entrevista marcada*.

## Correção

Em `src/routes/_authenticated/recrutamento.kanban.tsx` e `src/routes/_authenticated/recrutamento.index.tsx`:

1. Remover o filtro `gte("next_follow_up_date", nowIso)` da consulta de `broker_candidate_interactions`.
2. Trocar a ordenação para `order("next_follow_up_date", { ascending: false })` e manter a lógica `if (!map.has(id)) map.set(...)` — assim cada candidato recebe a **última entrevista agendada** (mais recente), independente de ser passada ou futura.
3. Nenhuma mudança em UI/estilo: o badge continua aparecendo igual ao da Gabi, só que agora também para entrevistas que já aconteceram.

## Fora de escopo
- Não mudo o fluxo de criação de entrevista, Google Calendar, fuso horário, nem o formato exibido.
- Se mais tarde você quiser diferenciar visualmente "entrevista passada" (ex.: cor cinza em vez de azul), faço numa próxima rodada.
