## Objetivo
Mostrar a próxima entrevista agendada no card do Kanban e na lista de candidatos.

## Mudanças

**`src/routes/_authenticated/recrutamento.kanban.tsx`**
- Adicionar 4ª chamada no `queryFn`: `broker_candidate_interactions` filtrando `interaction_type = 'entrevista'`, `next_follow_up_date >= now()`, ordenado asc.
- Construir `Map<candidate_id, próxima_data>` e passar para `CandidateCard` via prop `interviewAt`.
- No card, renderizar abaixo do responsável: `📅 Entrevista: DD/MM HH:mm` em `text-primary font-medium`.

**`src/routes/_authenticated/recrutamento.index.tsx`**
- Mesma busca adicional na query.
- Exibir na coluna "Etapa" (ou linha extra abaixo do nome) uma badge `📅 DD/MM HH:mm` quando houver entrevista futura.

Sem mudanças de banco.
