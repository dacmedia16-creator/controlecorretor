## Objetivo

Ao clicar/abrir uma notificação (sino ou sidebar), ela é **dispensada** e não volta a aparecer nem a tocar alerta novamente — mesmo no dia seguinte, enquanto o follow-up estiver agendado para a mesma data.

## Comportamento novo

**Sino (NotificationBell)**
- Clicar no item → marca como lida **e remove da lista** imediatamente (delete em `recruiter_notifications`).
- Sem clique = continua lá tocando/avisando conforme regra atual (1x por dia).

**Sidebar de follow-ups (FollowUpSidebar)**
- Clicar em "Abrir" ou "WhatsApp" de um item → marca aquele follow-up como **dispensado** para o usuário.
- Item dispensado **não aparece mais** na sidebar e **não dispara mais beep/toast** pelo trigger do banco, enquanto a data agendada não mudar.
- A sidebar deixa de auto-abrir quando todos os pendentes do dia já foram dispensados.

## Mudanças técnicas

**Banco (migration)**
- Nova tabela `follow_up_dismissals(user_id, interaction_id, source, dismissed_at)` com PK `(user_id, interaction_id, source)`.
- RLS: usuário só vê/insere/deleta os próprios registros.
- Ajustar `notify_lead_followup` e `notify_candidate_followup` para **não inserir** em `recruiter_notifications` se já existir registro em `follow_up_dismissals` para `(target_user, interaction_id, source)`. Continua respeitando o `follow_up_notification_log` existente.
- Se o usuário criar uma nova interação (novo `interaction_id`) com data de follow-up, ele volta a notificar normalmente — porque a chave de dispensa é por interação.

**Frontend**
- `useRecruiterNotifications`: trocar `markAsRead(id)` por `dismiss(id)` que faz `DELETE` na linha e remove do estado local. `markAllAsRead` vira `dismissAll` (delete em massa do usuário).
- `useFollowUpToday`: ao carregar, dar `LEFT JOIN` (via segunda query) com `follow_up_dismissals` do usuário e filtrar fora os já dispensados. Expor `dismiss(item)` que insere em `follow_up_dismissals` e remove do estado.
- `FollowUpSidebar`: chamar `dismiss(item)` ao clicar em "Abrir" / "WhatsApp".
- `NotificationBell`: chamar `dismiss(n.id)` no clique do item (em vez de `markAsRead`).

## Arquivos afetados

- nova migration SQL (tabela + RLS + ajuste nas 2 funções de trigger)
- `src/hooks/useRecruiterNotifications.ts`
- `src/hooks/useFollowUpToday.ts`
- `src/components/NotificationBell.tsx`
- `src/components/FollowUpSidebar.tsx`

## Confirmações antes de implementar

1. **Dispensar = apagar de vez** ou só esconder daquele usuário? (Plano assume esconder/apagar para o usuário; o item some e não volta mesmo recarregando.)
2. Na sidebar, qualquer clique (Abrir **ou** WhatsApp) já dispensa, certo? Ou só "Abrir"?
3. Se o follow-up continuar atrasado por vários dias, deve voltar a alertar nos próximos dias mesmo já tendo sido clicado uma vez? (Plano atual: **não volta** até criar nova interação.)
