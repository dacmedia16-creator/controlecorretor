## Atribuir candidatos a um recrutador específico

Adicionar o conceito de "recrutador responsável" para cada candidato. Admin vê todos; cada recrutador vê só os candidatos atribuídos a ele (ou criados por ele).

### 1. Banco de dados (migration)

- Adicionar coluna `assigned_to_user_id uuid` em `broker_candidates` (nullable, FK lógico para `profiles.id`).
- Índice em `assigned_to_user_id`.
- Atualizar RLS de `broker_candidates`:
  - Admin: acesso total (como hoje).
  - Recrutador: vê/edita apenas linhas onde `assigned_to_user_id = auth.uid()` **ou** `created_by_user_id = auth.uid()`.
  - Apenas admin pode alterar `assigned_to_user_id` (trigger `guard_broker_admin_fields`, espelhando `guard_lead_admin_fields`).
- Atualizar RLS de `broker_candidate_interactions` para seguir a visibilidade do candidato pai.

### 2. Cadastro/edição de candidato

- No `BrokerCandidateFormDialog`, adicionar campo "Recrutador responsável" (select com a lista de usuários com role `recrutador` + admins).
  - Visível só para admin.
  - Recrutador que cria um candidato: `assigned_to_user_id` é setado automaticamente para ele mesmo.

### 3. Lista de recrutamento (`/recrutamento`)

- Nova coluna "Responsável" na tabela.
- Filtro por responsável (visível só para admin).
- Para recrutador, a query já vem filtrada pela RLS.

### 4. Kanban de recrutamento

- Mostrar o nome do responsável no card.
- Filtro por responsável no topo (admin).

### Pontos em aberto (decidir depois, se quiser)

- Distribuição em massa estilo `/distribuicao` — fica para um segundo passo se você sentir falta.
- Reatribuir candidato em lote a partir da lista — pode entrar junto ou depois.

Confirma que sigo com esse plano? Se quiser, já incluo a reatribuição em lote a partir da lista também.