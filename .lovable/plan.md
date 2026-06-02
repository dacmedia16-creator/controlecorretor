## Objetivo

No Kanban de Recrutamento (`/recrutamento/kanban`), quando um candidato for arrastado para a etapa **"Reagendar"**, se houver uma entrevista futura agendada, o sistema deve:

1. Cancelar automaticamente o evento no Google Calendar do recrutador (notificando o candidato).
2. Liberar a agenda interna (remover o horário da tela `/agenda`).
3. Atualizar a etapa do candidato normalmente.

## O que já existe

- `deleteGoogleCalendarEvent` (server fn em `src/lib/google-calendar.functions.ts`) já busca pelo nome do candidato em torno do horário e remove o evento com `sendUpdates=all`.
- O kanban já carrega `interviewByCand: Map<candidateId, nextFollowUpDateISO>` com a próxima entrevista futura de cada candidato.
- A agenda (`/agenda`) lê os horários a partir de `broker_candidate_interactions` com `interaction_type='entrevista'` e `next_follow_up_date` no futuro.

## Mudança (somente em `src/routes/_authenticated/recrutamento.kanban.tsx`)

Em `onDragEnd`, depois da checagem de "Entrevista realizada" (que abre o diálogo de nota), adicionar um novo ramo:

```text
se newStatus.name == "reagendar":
   startISO = data.interviewByCand.get(id)
   se startISO existe:
     1. tentar deleteGoogleCalendarEvent({ candidateId: id, startISO })
        - best effort: erro vira toast de aviso, não bloqueia o fluxo
     2. UPDATE broker_candidate_interactions
          SET next_follow_up_date = NULL
          WHERE candidate_id = id
            AND interaction_type = 'entrevista'
            AND next_follow_up_date >= now()
   atualizar broker_candidates.status_id como já é feito hoje
   toast: "Movido para Reagendar — agendamento cancelado"
   invalidar queryKey ["broker-kanban"] e ["agenda"] (para a agenda atualizar)
```

Detalhes:
- Importar `deleteGoogleCalendarEvent` e usar via `useServerFn`.
- Comparação do nome insensível a caixa/acentos (`.toLowerCase().trim() === "reagendar"`), no mesmo padrão já usado para "entrevista realizada".
- Se não houver entrevista futura, apenas muda a etapa (sem chamadas extras).
- Se o usuário não tiver Google Calendar conectado, a chamada falha — capturar o erro e mostrar toast informativo, mas seguir com a limpeza da agenda interna e a troca de etapa.

## Fora do escopo

- Não mudar RLS, schema, ou outros componentes.
- Não tocar na lógica de "Entrevista realizada" (nota) nem em outras etapas.
- Não criar nova server fn — reaproveitar `deleteGoogleCalendarEvent`.
