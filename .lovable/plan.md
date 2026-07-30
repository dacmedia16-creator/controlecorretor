## Por que hoje não deixa

Os cards em azul escuro não são compromissos do sistema — são o espelho **somente leitura** dos eventos lidos das agendas do Google conectadas. Na Agenda eles são marcados como tipo `google`: não são arrastáveis, não abrem o painel de edição e mostram "Evento externo — edite no Google Calendar". Isso vale para qualquer perfil (não é uma restrição específica da Nicole). As funções existentes de alterar/excluir no Google (`updateGoogleCalendarEvent`, `deleteGoogleCalendarEvent`) só funcionam para eventos criados a partir de uma interação do sistema.

## O que será feito

1. **Novas ações diretas no Google**
   - Criar duas funções de servidor: alterar horário/duração e excluir um evento pelo par (conexão da agenda + id do evento no Google), sem depender de existir interação vinculada.
   - Usar as mesmas conexões de recrutamento já compartilhadas, respeitando o token de OAuth ou da conta de serviço.
   - Só permitir a operação se a agenda tiver permissão de escrita (`owner`/`writer`); em agenda somente leitura, retornar mensagem clara vinda do próprio Google.
   - Registrar cada tentativa (sucesso ou erro) no log de sincronização já existente.

2. **Agenda: card do Google passa a ser editável**
   - Tornar o card azul escuro arrastável, com o mesmo encaixe de 30 min usado nos demais.
   - No popover do evento do Google, adicionar campos de data/hora e duração, botão "Salvar" e botão "Excluir compromisso" com confirmação.
   - Manter o link "Abrir no Google".
   - Após salvar/excluir, recarregar os eventos do Google na semana.

3. **Segurança e permissões**
   - As ações continuam exigindo usuário autenticado; recrutador, gerente e admin podem operar as agendas compartilhadas de recrutamento, igual à regra já usada no envio.
   - Se o evento no Google já não existir (404), tratar como excluído e apenas atualizar a tela.
   - Se a agenda for somente leitura, desabilitar os botões e explicar o motivo no popover.

4. **Validação**
   - Mover um evento do Google pela Agenda e conferir a mudança no Google.
   - Excluir um evento e conferir o sumiço nos dois lados.
   - Conferir que os compromissos do sistema continuam funcionando como antes.

## Observação técnica

Alterações previstas em `src/lib/google-calendar.functions.ts` (novas server functions `patchRawGoogleEvent` / `deleteRawGoogleEvent`), possivelmente auxiliares em `src/lib/google-calendar.server.ts`, e em `src/routes/_authenticated/agenda.tsx` (drag + popover de edição para `kind: "google"`). Nenhuma mudança de banco é necessária.
