## O que vou fazer

Adicionar, no bloco de diagnóstico da tela **Agenda**, um botão **"Sincronizar agora"** ao lado de "Testar envio".

Comportamento:

1. O sistema procura a **próxima entrevista pendente**: interação do tipo `entrevista` com data/hora futura que ainda **não tem evento registrado** no Google (sem linha correspondente em `google_calendar_events`).
2. Cria o evento na agenda **Denis Souza** (`dacmedia16@gmail.com`) — e em qualquer outra agenda com envio ligado.
3. Mostra o resultado: nome do candidato, data/hora e em qual agenda foi criado; se falhar, exibe o erro exato devolvido pelo Google (status + mensagem).
4. Se não houver nada pendente, informa "Nenhuma entrevista pendente de envio".
5. Toda tentativa fica gravada em **Últimas sincronizações**, como já acontece hoje.

O botão mostra também **quantas entrevistas estão pendentes**, para você saber se vale clicar de novo (cada clique envia a próxima). Se você preferir enviar todas de uma vez, é só dizer que troco por um botão único "Sincronizar todas".

## Detalhes técnicos

- Nova server fn `syncNextPendingInterview` em `src/lib/google-calendar.functions.ts` (protegida por `requireSupabaseAuth`): busca em `broker_candidate_interactions` (tipo `entrevista`, `next_follow_up_date >= now()`) a mais antiga sem linha em `google_calendar_events`, e reaproveita a mesma lógica de criação de `createGoogleCalendarEvent` (extraída para um helper compartilhado em `google-calendar.server.ts` para evitar duplicação), com log via `logSync`.
- Nova server fn `countPendingInterviewSync` (ou o mesmo retorno da consulta) para exibir o contador no botão.
- UI: botão + área de resultado em `src/components/GoogleCalendarDiagnostics.tsx`, invalidando as queries `gcal-sync-log`, `google-events` e a da agenda após sucesso.
- Nenhuma alteração de schema; nada do fluxo atual de recrutamento, kanban ou agenda muda.
