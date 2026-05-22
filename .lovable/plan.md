# Por que Mary (gerente) não aparece

Na tela `/recrutamento`, o dropdown "Responsável" é populado pela query `recruiters-and-admins` que filtra apenas papéis `recrutador` e `admin`. Como Mary tem papel `gerente_recrutamento`, ela é excluída — por isso não aparece nem como opção para atribuir, nem no filtro de responsáveis.

## Correção (1 arquivo)

**`src/routes/_authenticated/recrutamento.index.tsx`**
- Na query `recruiters-and-admins`, alterar o filtro de papéis para incluir o gerente:
  ```ts
  .in("role", ["recrutador", "admin", "gerente_recrutamento"])
  ```
- Renomear a queryKey para refletir (ex.: `recruiters-managers-and-admins`) para evitar cache antigo.

Isso fará a Mary aparecer:
- no dropdown "Responsável" da tabela de candidatos (para o admin atribuí-la);
- automaticamente no filtro "Responsável" do topo, assim que ela tiver pelo menos 1 candidato atribuído (esse filtro já usa todos os `assigned_to_user_id` presentes).

## Confirmar antes de implementar

Você quer mesmo permitir que o **gerente de recrutamento seja designado como responsável** de um candidato (além de ver todos)? Ou ela deve apenas **visualizar/gerenciar** sem ser atribuída como dona? Se for só visualizar, mantemos a lista como está.
