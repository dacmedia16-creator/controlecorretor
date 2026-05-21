## Notificações de novas atribuições para o recrutador

Toda vez que um candidato for atribuído a um recrutador (no momento da criação ou via troca de responsável), ele receberá:
1. Um alerta visual no painel (sino no header com contador + toast)
2. Um alerta sonoro (beep curto)
3. Uma lista de notificações para consultar depois

### Banco de dados
Criar tabela `recruiter_notifications`:
- `user_id` (recrutador que recebe)
- `candidate_id` (referência ao candidato)
- `type` (`assigned`)
- `message` (ex.: "Novo candidato atribuído: João Silva")
- `read` (boolean, default false)
- `created_at`

RLS:
- Recrutador vê/atualiza apenas as próprias notificações
- Admin vê todas

Trigger `on_broker_candidate_assigned` em `broker_candidates`:
- Em INSERT: se `assigned_to_user_id` não for nulo → insere notificação
- Em UPDATE: se `assigned_to_user_id` mudou e não é nulo → insere notificação para o novo responsável

Habilitar realtime na tabela (`ALTER PUBLICATION supabase_realtime ADD TABLE recruiter_notifications`).

### Frontend

**Componente `NotificationBell`** no `AppLayout` (visível para recrutadores e admins):
- Ícone de sino com badge contendo número de não lidas
- Popover com lista das últimas 10 notificações, link "Marcar todas como lidas" e clique em uma notificação leva ao candidato
- Inscrição realtime em `recruiter_notifications` filtrada por `user_id = auth.uid()`
- Ao chegar nova notificação:
  - Atualiza contador
  - Mostra toast (sonner) com nome do candidato e botão "Abrir"
  - Toca som curto (arquivo `src/assets/notification.mp3`, ~0.3s)

**Som**: usar HTML5 `Audio` com pré-carregamento. Respeitar política de autoplay: só tocar após primeira interação do usuário com a página (já garantida pelo login). Preferência salva em localStorage (`notifications_sound_enabled`) com toggle no popover.

### Detalhes técnicos
- Hook `useRecruiterNotifications()` encapsula query (TanStack Query) + subscription realtime + função `markAsRead` / `markAllAsRead`
- Invalidação da query no evento INSERT
- Toast aparece apenas para eventos recebidos via realtime (não no carregamento inicial)
- Admin vê todas as notificações que ele mesmo gerou? Não — apenas recrutadores recebem notificação. Admin não recebe alerta sonoro.

### Arquivos a criar/editar
- Migração SQL (tabela + RLS + trigger + realtime)
- `src/hooks/useRecruiterNotifications.ts`
- `src/components/NotificationBell.tsx`
- `src/assets/notification.mp3` (som curto livre de direitos)
- Editar `src/components/AppLayout.tsx` para incluir o sino no header
