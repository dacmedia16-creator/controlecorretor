## Atalho para atribuir recrutador na lista

Adicionar, na coluna **Responsável** da tela `/recrutamento`, um atalho inline para o **admin** trocar o recrutador responsável sem precisar abrir o candidato.

### Comportamento

- **Admin**: a célula "Responsável" vira um `Select` compacto com a lista de recrutadores + admins (mesma query já usada no `BrokerCandidateFormDialog`). Opções:
  - "Sem responsável" (define `assigned_to_user_id = null`)
  - Cada recrutador/admin pelo nome
  - Mudança é salva imediatamente via `update` no `broker_candidates`, com `toast` de sucesso/erro e `invalidateQueries(["broker-candidates"])`.
- **Recrutador**: continua vendo apenas o nome em texto (sem permissão para reatribuir — já bloqueado pelo trigger `guard_broker_admin_fields`).

### Arquivos afetados

- `src/routes/_authenticated/recrutamento.index.tsx`
  - Adicionar query `recruiters-and-admins` (igual à do dialog), habilitada só para admin.
  - Trocar o texto da coluna "Responsável" por um `Select` inline quando `role === "admin"`.
  - Função `assignRecruiter(candidateId, userId | null)` que faz o update e invalida a query.

### Fora de escopo

- Atribuição em massa (selecionar vários candidatos) — pode ser feita depois se quiser.
- Mudar o atalho no Kanban — só na lista, conforme a tela do print.

Confirma que quero seguir assim?
