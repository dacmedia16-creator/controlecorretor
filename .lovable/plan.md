# Salvar entrevista no fuso de Brasília (corrigir 15:00 vs 12:00)

## Causa raiz
Em `src/components/BrokerCandidateInteractionDialog.tsx`, o input `datetime-local` devolve uma string sem fuso (ex.: `"2026-05-28T15:00"`). O código grava ela direto:

```ts
next_follow_up_date: followUp || null,
```

O Postgres interpreta string sem fuso como **UTC**. Resultado:
- Você marca **15:00** (intenção: 15:00 BR)
- Banco grava **2026-05-28 15:00:00+00** (15:00 UTC = **12:00 BR**)
- O kanban filtra `>= now()`. Agora são 12:01 BR → 15:00 UTC já passou → o badge desaparece.

O Google Calendar funciona porque lá o código usa `new Date(followUp).toISOString()`, que aplica o fuso do navegador corretamente. O bug é só no INSERT no banco.

## Correção

**Arquivo: `src/components/BrokerCandidateInteractionDialog.tsx`**

Trocar a linha do insert para converter o datetime-local em ISO com fuso antes de gravar:

```ts
next_follow_up_date: followUp ? new Date(followUp).toISOString() : null,
```

Assim "2026-05-28T15:00" (intenção 15:00 BR) vira `"2026-05-28T18:00:00.000Z"` no banco, e o kanban exibe corretamente 28/05 15:00.

## Dados existentes
A linha errada da Tainara (`15:00 UTC = 12:00 BR`) já está no banco. Duas opções, me diz qual prefere:

a) **Deixar como está** — você reabre o diálogo da Tainara, salva a entrevista de novo com 15:00 e fica corrigido só esse caso.
b) **Migration de correção** — rodo um UPDATE em `broker_candidate_interactions` somando 3h em todas as `next_follow_up_date` de `interaction_type = 'entrevista'` criadas antes do fix, para alinhar com o fuso de Brasília. Só faz sentido se você tem várias entrevistas com o mesmo problema.

## Fora de escopo
- Não mexo na exibição/filtro do kanban — depois da correção, a entrevista da Tainara (gravada como 18:00 UTC) é futura e o filtro `gte now` já vai mostrar o badge normalmente.
- Não mexo no fluxo do Google Calendar.
