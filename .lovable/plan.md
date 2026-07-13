## O que fazer

Adicionar em `/recrutamento/dashboard` um card "Candidatos que passaram por Entrevista marcada", com filtros de período (data início/fim) e recrutador — respeitando o histórico de mudanças de etapa (não só quem está lá agora).

## Como funciona a contagem

Já existe o trigger `log_broker_status_change` que grava em `broker_candidate_interactions` uma linha `interaction_type = 'status_change'` com nota `"Etapa alterada para: <nome da etapa>"` toda vez que a etapa muda. Vou usar essa tabela como fonte histórica — sem migration.

Regra do count:
- `interaction_type = 'status_change'`
- `notes ILIKE 'Etapa alterada para: Entrevista marcada%'` (nome exato da etapa do kanban de recrutamento)
- Filtro por `created_at` entre início/fim
- Filtro por `user_id` do responsável (opcional)
- `COUNT(DISTINCT candidate_id)` — se um candidato entrou/saiu/voltou, conta 1 no período

## Arquivos

**`src/routes/_authenticated/recrutamento.dashboard.tsx`**
- Novo bloco de filtros no topo: dois `<Input type="date">` (início/fim, default = mês atual) + `<Select>` de recrutador (lista via query em `profiles` ∩ `user_roles` com role `recrutador|admin|gerente_recrutamento`; recrutador logado vê só a si mesmo e o select fica oculto).
- Nova query TanStack que faz o SELECT descrito acima em `broker_candidate_interactions` e retorna a lista distinta de `candidate_id`s.
- Novo `<Card>` "Passaram por Entrevista marcada" mostrando o número, com subtítulo do período aplicado.
- Ao clicar no card, expande uma tabela pequena com nome do candidato, data em que entrou na etapa e responsável atual (join simples com `broker_candidates` + `profiles`).

Sem mudanças no banco, sem novas policies (a tabela já é legível para admin/gerente/recrutador dono).

## Observação de precisão

Se um dia a etapa for renomeada, a busca por nome deixa de casar. Se quiser blindar isso, no futuro dá pra guardar `status_id` também no log — mas fica fora do escopo agora.
