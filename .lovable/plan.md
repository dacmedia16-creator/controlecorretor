## Situação atual (verificada no código)

- A conexão com o Google é por usuário (tabela `user_google_calendar_connections`, com e-mail, tokens e validade).
- Todas as operações (criar, remover, reagendar entrevista) usam **fixamente** o calendário `primary` da conta conectada — o código chama `.../calendars/primary/events` em `src/lib/google-calendar.functions.ts`.
- Hoje não existe nenhuma forma de escolher outro calendário.

## O que será feito

Você poderá escolher **quais calendários da sua conta Google recebem as entrevistas** — o principal e/ou um segundo (por exemplo, "Recrutamento" ou a agenda da equipe).

1. **Escolha de calendários na tela de Recrutamento**
   - No card do Google Calendar (onde hoje aparece "Conectado como ..."), listar todos os calendários em que você tem permissão de escrever.
   - Caixas de seleção para marcar um ou mais calendários de destino. Sem escolha, continua usando o principal.
   - Salvar a seleção por usuário.

2. **Criar entrevista**
   - O evento passa a ser criado em cada calendário selecionado (convite ao candidato enviado apenas uma vez, pelo calendário principal da seleção, para o candidato não receber e-mails duplicados).

3. **Reagendar e excluir**
   - Ao arrastar na Agenda ou mover para "Reagendar", o evento é atualizado/removido em **todos** os calendários selecionados, mantendo tudo em sincronia.
   - Se um calendário falhar, os outros continuam e a mensagem indica exatamente qual falhou.

4. **Mensagens e estados**
   - Loading enquanto a lista de calendários carrega, aviso claro se a conexão expirou (reaproveita o fluxo de reconexão já existente).

## Detalhes técnicos

- Banco: nova coluna `calendar_ids text[]` (padrão `{primary}`) em `user_google_calendar_connections`.
- Novas server functions: `listMyGoogleCalendars` (GET em `/calendar/v3/users/me/calendarList`, filtrando `accessRole` writer/owner) e `setMyGoogleCalendars`.
- `createGoogleCalendarEvent`, `updateGoogleCalendarEvent` e `deleteGoogleCalendarEvent` passam a iterar sobre os calendários salvos em vez do literal `primary`.
- Não é necessário alterar escopos OAuth: `calendar.events` já cobre a listagem básica de calendários; se a API recusar, incluo `calendar.readonly` e você refaz a conexão uma vez.
- UI alterada: `src/components/GoogleCalendarBanner.tsx`.

## Sobre a chave enviada

O arquivo de conta de serviço enviado **não será usado** — você vai revogá-lo e gerar outro. A integração continua pelo login OAuth de cada usuário, que é o modelo correto aqui (o evento aparece na agenda pessoal de quem agendou). Recomendo revogar essa chave no Google Cloud hoje.
