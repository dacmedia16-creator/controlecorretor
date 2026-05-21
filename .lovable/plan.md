## Alertas de follow-up agendado

Quando um follow-up for marcado (campo "Próximo follow-up" nos diálogos de interação), no dia agendado o responsável receberá:
1. Notificação no sino (mesma do alerta de atribuição) + toast + som
2. Uma barra lateral (drawer à direita) abrindo automaticamente, listando os follow-ups do dia com atalho para abrir o contato (candidato ou lead)

Escopo: vale tanto para **candidatos de recrutamento** quanto para **leads** (compra/captação/massa) — ambos têm `next_follow_up_date` na tabela de interações.

### Banco de dados

**Reaproveitar** a tabela `recruiter_notifications` renomeando a coluna `candidate_id` para genérica? Não — para evitar quebra, criamos os registros com type `follow_up_due` e adicionamos colunas:
- `lead_id` (nullable) → para follow-ups de leads
- `candidate_id` agora também nullable

Constraint: exatamente um dos dois deve estar preenchido.

Também renomear a tabela mentalmente para "notificações do usuário" (sem alterar nome para não quebrar). O nome `recruiter_notifications` permanece, mas atende admin, recrutador e corretor.

**Atualizar políticas RLS**: corretor passa a ver suas próprias notificações (já é `user_id = auth.uid()`, está ok).

**Função `enqueue_follow_up_notifications()`** (SECURITY DEFINER, scheduled):
- Busca interações com `next_follow_up_date::date = CURRENT_DATE` que ainda não geraram notificação
- Para cada interação:
  - Se `lead_interactions`: cria notificação para `assigned_to_user_id` (ou `created_by_user_id`) do lead
  - Se `broker_candidate_interactions`: cria notificação para `assigned_to_user_id` (ou `created_by_user_id`) do candidato
  - `type = 'follow_up_due'`, mensagem com nome do contato
- Idempotência: nova tabela `follow_up_notification_log(interaction_id, notified_on date, PRIMARY KEY)` para evitar duplicar no mesmo dia

**Agendamento**: rota pública `/api/public/hooks/follow-up-reminders` chamada por `pg_cron` a cada hora (autenticada via `apikey` header) que executa a função.

Disparo imediato (no caso de follow-up agendado para HOJE): trigger `AFTER INSERT/UPDATE` em `lead_interactions` e `broker_candidate_interactions` que, se `next_follow_up_date::date <= CURRENT_DATE`, chama a mesma função inline para aquele registro.

### Frontend

**Tipos no hook `useRecruiterNotifications`**: distinguir `assigned` (atual) vs `follow_up_due` (novo). Itens de follow-up recebem ícone de calendário no popover do sino.

**Novo componente `FollowUpSidebar`** (drawer à direita usando `Sheet` do shadcn):
- Lista os follow-ups do dia agrupados por contato
- Cada item: nome, telefone, observação da interação, botões "Abrir" (link para `/recrutamento/$id` ou `/leads/$id`) e "WhatsApp"
- Botão "Marcar como visto" individual ou em lote

**Comportamento de abertura automática**:
- Ao carregar o app, hook `useFollowUpToday()` busca todos os follow-ups do dia para o usuário atual
- Se houver itens não vistos hoje → abre o `FollowUpSidebar` automaticamente uma única vez por sessão (controle via `sessionStorage`)
- Botão fixo (ícone de calendário com badge) no header — desktop e mobile — para reabrir manualmente

**Integração no `AppLayout`**: ao lado do sino, adicionar botão `FollowUpButton` com badge do total de follow-ups do dia, que abre o `FollowUpSidebar`.

### Arquivos a criar/editar

Migração SQL:
- Alterar `recruiter_notifications` (lead_id nullable, candidate_id nullable, CHECK constraint)
- Criar `follow_up_notification_log`
- Criar função `enqueue_follow_up_notifications()` + triggers em `lead_interactions` e `broker_candidate_interactions`
- Habilitar `pg_cron` + `pg_net` se ainda não estiverem
- Agendar job horário via tool de insert

Código:
- `src/routes/api/public/hooks/follow-up-reminders.ts` (rota pública que executa a função)
- `src/hooks/useFollowUpToday.ts`
- `src/components/FollowUpSidebar.tsx`
- Editar `src/components/AppLayout.tsx` (adicionar botão + sidebar)
- Editar `src/hooks/useRecruiterNotifications.ts` e `src/components/NotificationBell.tsx` (suporte ao tipo `follow_up_due` com link correto)
