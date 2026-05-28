
## Objetivo

Quando um recrutador registrar uma interação do tipo **"entrevista"** com data/hora em um candidato, o evento é automaticamente criado no Google Calendar **dele** e o candidato é convidado por e-mail.

Cada recrutador conecta sua **própria** conta Google (OAuth offline com refresh token). Tabela `user_google_calendar_connections` já criada; secrets `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` já configurados.

## O que será implementado

### 1. Server functions (`src/lib/google-calendar.functions.ts`)
- `startGoogleCalendarConnect()` — gera URL OAuth do Google (`access_type=offline`, `prompt=consent`, scopes `calendar.events` + `userinfo.email`) com `state` assinado (HMAC com `LOVABLE_API_KEY` + `user_id` + nonce).
- `getMyGoogleCalendarStatus()` — retorna `{ connected, google_email }` para o usuário atual.
- `disconnectGoogleCalendar()` — apaga a linha do usuário.
- `createGoogleCalendarEvent({ candidateId, interactionId, startISO, durationMinutes, summary, description })`:
  - Carrega tokens do usuário via `supabaseAdmin`.
  - Se `expires_at` perto de vencer, faz refresh em `oauth2.googleapis.com/token` e atualiza a linha.
  - Busca o candidato (nome + email) via `supabaseAdmin`.
  - Faz `POST https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all` com `start`/`end` em America/Sao_Paulo, `attendees: [{ email: candidato.email }]` (só se houver email).
  - Retorna `{ eventId, htmlLink }`. Erros não derrubam o fluxo do chamador (try/catch no UI).

Todas protegidas por `requireSupabaseAuth`.

### 2. Server route do callback OAuth (`src/routes/oauth.google-calendar.callback.tsx`)
- Server handler `GET`: lê `code` + `state`, valida HMAC do state, troca code por tokens em `oauth2.googleapis.com/token`, busca email em `userinfo`, faz `upsert` na tabela com `supabaseAdmin`, redireciona para `/recrutamento/kanban?gcal=connected`.
- Componente client mínimo (caso o redirect não dispare) com mensagem.

### 3. UI
- **Banner em `/recrutamento` e `/recrutamento/kanban`**: quando `getMyGoogleCalendarStatus().connected === false`, mostra card "Conecte seu Google Calendar para sincronizar entrevistas" + botão **Conectar Google Calendar** (chama `startGoogleCalendarConnect` e redireciona). Quando conectado, mostra `Conectado como <email>` + botão **Desconectar**.
- **Diálogo de interação** (`BrokerCandidateInteractionDialog`): quando `type === "entrevista"` e `next_follow_up_date` preenchido, mostrar:
  - Campo "Duração (minutos)" (default 30).
  - Toggle "Adicionar ao Google Calendar e convidar candidato" (default ligado se conectado, desabilitado se não conectado com aviso).
  - Após salvar a interação, chamar `createGoogleCalendarEvent` em try/catch. Toast de sucesso com link do evento ou toast de erro (sem reverter a interação).

### 4. URLs de redirect para configurar no Google Cloud Console
Após o plano ser aprovado, eu confirmo as URLs exatas que você precisa colar em **Authorized redirect URIs** do seu OAuth Client:
- `https://controlecorretor.lovable.app/oauth/google-calendar/callback`
- `https://id-preview--6e049608-b16f-4955-a49b-3ad4d482ba57.lovable.app/oauth/google-calendar/callback`

## Segurança
- Tokens só são lidos/escritos via server functions usando `supabaseAdmin` (tabela já não tem policies de INSERT/UPDATE — apenas SELECT/DELETE para o dono).
- `state` assinado com HMAC-SHA256 (`LOVABLE_API_KEY` + user_id + nonce + expires) — previne CSRF.
- Refresh automático antes de cada chamada.
- Tokens nunca trafegam para o cliente.

## Ordem de execução (após aprovação)
1. Criar `google-calendar.functions.ts` + rota de callback.
2. Adicionar banner de conexão e botão.
3. Atualizar `BrokerCandidateInteractionDialog` com campo de duração e chamada ao criar evento.
4. Te passar as URLs para colar no Google Cloud Console.
