## O que é o erro

`Refresh falhou: 400 {"error":"invalid_grant"}` vem do Google, não do seu app. O *refresh token* salvo na sua conexão não vale mais. Isso acontece quando:

- o acesso foi revogado na conta Google (Segurança → Apps com acesso),
- o app OAuth ainda está em modo "Testing" no Google Cloud (nesse caso o token expira em 7 dias),
- a senha da conta Google mudou ou o token ficou muito tempo sem uso,
- o Client ID/Secret foi trocado depois da conexão.

O agendamento foi salvo no sistema normalmente — só a sincronização com o Google falhou.

## Correção imediata

Reconectar o Google Calendar (botão "Desconectar" e depois "Conectar Google Calendar" na página de Recrutamento) resolve na hora. O problema é que hoje o app não avisa isso: só mostra um erro técnico e continua achando que está conectado.

## O que vou implementar

**`src/lib/google-calendar.server.ts`**
- Em `getFreshAccessToken`, quando o refresh retornar `invalid_grant`: apagar a linha do usuário em `user_google_calendar_connections` (conexão morta) e lançar um erro claro em português: "Sua conexão com o Google Calendar expirou. Reconecte na página de Recrutamento."

**`src/components/GoogleCalendarBanner.tsx`**
- Como a conexão passa a ser removida automaticamente, o banner volta a mostrar "Conectar Google Calendar" sem ação manual.
- Invalidar a query `gcal-status` quando uma operação de calendário falhar por expiração.

**Agenda (`src/routes/_authenticated/agenda.tsx`) e diálogo de interação**
- Trocar o toast técnico por: "Atualizado no sistema, mas o Google Calendar precisa ser reconectado." e invalidar `gcal-status` para o banner reaparecer.

## Recomendação (fora do código)

Se o app OAuth no Google Cloud estiver como "Testing", publique-o (Publishing status → In production). Enquanto estiver em teste, o Google invalida o refresh token a cada 7 dias e o erro vai voltar sempre.
