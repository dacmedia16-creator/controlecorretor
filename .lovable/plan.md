## Excluir evento direto da Agenda

Adicionar botão **Excluir** no `Popover` de cada evento em `src/routes/_authenticated/agenda.tsx`.

### Comportamento
- Botão "Excluir" (variant destructive) abaixo dos botões Salvar/Abrir.
- Confirmação via `AlertDialog` antes de excluir.
- Ao confirmar:
  - Faz `delete` em `broker_candidate_interactions` (id `bci-…`) ou `lead_interactions` (id `li-…`) na linha correspondente.
  - Se for entrevista e Google Calendar conectado, chamar novo server fn `deleteGoogleCalendarEvent({ candidateId, startISO })` em `src/lib/google-calendar.functions.ts` que busca pelo nome do candidato no `events.list` no horário e chama `events.delete`. Se não encontrar, retorna `{ deleted:false }` e mostra aviso.
  - Toast de sucesso/erro e `queryClient.invalidateQueries(["agenda", weekStartIso])`.

### Permissões
RLS atual já cobre DELETE via policy "admin all" para admin e "gerente all" para gerente em `broker_candidate_interactions`. Para recrutador/corretor, **não existe policy de DELETE** nas tabelas de interação hoje — só INSERT/SELECT. Logo, recrutadores e corretores receberão erro de permissão ao tentar excluir.

Opções:
1. **Manter como está** — apenas admin/gerente conseguem excluir; UI mostra erro do Supabase para os demais.
2. **Adicionar policies de DELETE** para o dono da interação (`user_id = auth.uid()`) em ambas as tabelas via migration.

Recomendo a opção 2 para coerência com a expectativa do usuário ("Todos veem tudo" já foi definido para o escopo da agenda).

### Fora do escopo
- Excluir o candidato/lead vinculado.
- Lixeira / soft-delete (será DELETE definitivo).
