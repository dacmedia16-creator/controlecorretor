
## Editar compromissos direto da Agenda

Permitir alterar data e hora de eventos já criados (entrevistas e follow-ups) clicando no bloco do evento na semana.

### UX
No `Popover` de cada evento em `src/routes/_authenticated/agenda.tsx`, adicionar:
- Campo `Input type="datetime-local"` pré-preenchido com a data/hora atual.
- Para entrevistas com Google Calendar conectado: campo de duração (min) e switch "Atualizar no Google Calendar".
- Botões **Salvar** e **Cancelar**. Mantém o botão **Abrir**.

### Comportamento
- Salvar faz `update` em `broker_candidate_interactions` ou `lead_interactions` (conforme o tipo) na coluna `next_follow_up_date`.
- Se for entrevista (`interaction_type='entrevista'`) e o usuário tiver Google Calendar conectado, chamar um novo server fn `updateGoogleCalendarEvent` para mover o evento correspondente (busca pelo evento mais recente do candidato ou guarda o id — ver "Detalhes técnicos").
- Toast de sucesso/erro e `queryClient.invalidateQueries(["agenda", ...])`.

### Permissões (RLS atual já cobre)
- `broker_candidate_interactions` e `lead_interactions` permitem UPDATE para admin; gerente faz UPDATE em candidatos; recrutador/corretor só nos próprios. Sem mudança de policy.
- Quando o usuário não tem permissão de update, mostrar o erro retornado pelo Supabase.

### Detalhes técnicos
- Estado local por popover: `useState<string>` para o novo datetime, `saving`.
- Reaproveitar `getMyGoogleCalendarStatus` já usado em `BrokerCandidateInteractionDialog`.
- Google Calendar update: estender `src/lib/google-calendar.functions.ts` com `updateGoogleCalendarEvent({ candidateId, oldStartISO, newStartISO, durationMinutes })`. A função server busca em `events.list` por `q=<nome do candidato>` no intervalo `oldStartISO ± 1min` e faz `events.patch` com novo `start/end`. Se não encontrar, retorna `{ updated:false }` e o front mostra aviso "Atualizado no sistema; evento não localizado no Google Calendar".
- Não vamos persistir `google_event_id` agora (evita migration). Limitação aceitável dado o escopo.

### Fora do escopo
- Editar tipo da interação, notas ou candidato/lead vinculado (continua pelas telas existentes).
- Criar evento novo a partir da agenda.
- Armazenar `google_event_id` nas tabelas de interação.
