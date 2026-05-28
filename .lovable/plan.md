## Objetivo
Permitir agendar data e hora da entrevista ao registrar interação do candidato a corretor.

## Mudanças

**`src/components/BrokerCandidateInteractionDialog.tsx`**
- Quando `type === "entrevista"`:
  - Renomear o label do campo existente `next_follow_up_date` para **"Data e hora da entrevista"** e torná-lo obrigatório (validação no `save`: se vazio → `toast.error` e abortar).
  - Ao salvar, prefixar `notes` com `"Entrevista agendada para <data formatada>"` (mantendo qualquer observação digitada).
- Para os demais tipos: comportamento atual (label "Próximo follow-up", opcional).
- Resetar `followUp` ao trocar de tipo / fechar diálogo.

## Resultado
- A entrevista fica visível no histórico do candidato e dispara o follow-up automático (já existente via `notify_candidate_followup`), aparecendo no sino de notificações e no `FollowUpSidebar` no dia agendado.
- Nenhuma alteração de banco necessária.
