# Corrigir erro 403 "ACCESS_TOKEN_SCOPE_INSUFFICIENT"

## Diagnóstico
A conta `dacmedia16@gmail.com` foi conectada antes do escopo `calendar.events` ser solicitado. O token armazenado tem só `openid`/`email`, então qualquer chamada para `calendar.v3.Events.Insert` retorna 403.

A mensagem do Google é clara:
> "Request had insufficient authentication scopes" / `ACCESS_TOKEN_SCOPE_INSUFFICIENT`

Não é bug de código — é o token salvo no banco que está sem permissão de Calendar.

## Solução (1 clique seu, sem mudança de código)

1. No banner verde no topo da página de Recrutamento, clicar em **Desconectar**.
2. Clicar de novo em **Conectar Google Calendar**.
3. Na tela de consentimento do Google, **marcar a permissão** "Ver, editar, compartilhar e excluir permanentemente todos os calendários…" (a checkbox precisa ficar marcada — se desmarcar, o token volta a vir sem escopo de Calendar).
4. Tentar agendar a entrevista novamente.

## Por que não precisa código novo
- O fluxo OAuth já pede `calendar.events` no `scope` (`src/lib/google-calendar.server.ts` → `GOOGLE_CALENDAR_SCOPES`).
- Já uso `prompt: "consent"` e `access_type: "offline"`, então a reconexão vai exibir a tela de permissões de novo e gravar um novo `refresh_token` com o escopo correto.
- O `disconnectGoogleCalendar` apaga a linha em `user_google_calendar_connections`, então a próxima conexão grava tokens limpos.

## Opcional (posso fazer se quiser)
- Detectar a string `ACCESS_TOKEN_SCOPE_INSUFFICIENT` no `createGoogleCalendarEvent` e devolver uma mensagem amigável tipo *"Reconecte o Google Calendar para conceder permissão de agenda"* em vez do JSON cru do Google.

Me confirma se quer só reconectar (resolve agora) ou se quer também essa melhoria de mensagem de erro.
