# Integração Google Calendar — cada recrutador conecta o próprio

Quando uma interação do tipo **entrevista** for criada com data/hora, criar automaticamente um evento no Google Calendar do recrutador e convidar o candidato (se tiver e-mail).

## 1. Pré-requisito (você faz no Google Cloud Console)

1. Criar projeto e habilitar **Google Calendar API**
2. Tela de consentimento OAuth: adicionar escopos `calendar.events`, `userinfo.email`
3. Criar credencial **OAuth Client ID** tipo **Web application**
4. **Authorized redirect URI** (eu te passo a URL exata após criar a rota): `https://controlecorretor.lovable.app/oauth/google-calendar/callback` e a do preview
5. Copiar **Client ID** e **Client Secret** → colar via tool de secrets (vou pedir)

Secrets a criar: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`

## 2. Banco de dados (migration)

Tabela `user_google_calendar_connections`:
- `user_id uuid PK` (FK lógico para auth.users)
- `access_token text`, `refresh_token text`, `expires_at timestamptz`
- `google_email text`
- `created_at`, `updated_at`

RLS: usuário só lê/edita o próprio registro; service_role acesso total (server functions usam admin client para gravar tokens com segurança).

## 3. Server functions (`src/lib/google-calendar.functions.ts`)

- `startGoogleCalendarConnect()` → gera URL de auth Google com `access_type=offline&prompt=consent&scope=calendar.events+email`, state assinado
- `getMyGoogleCalendarStatus()` → retorna `{ connected, googleEmail }`
- `disconnectGoogleCalendar()` → apaga linha
- `createGoogleCalendarEvent({ summary, description, startISO, durationMin, attendeeEmail })`:
  - Carrega tokens do user logado
  - Se `expires_at` próximo → refresh via `https://oauth2.googleapis.com/token`
  - `POST https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all`
  - Retorna `htmlLink` do evento

## 4. Rota de callback OAuth

`src/routes/oauth.google-calendar.callback.tsx`:
- Lê `code` e `state` da query
- Chama server fn `handleGoogleCalendarCallback({code, state})` que troca code por tokens, salva na tabela, retorna `googleEmail`
- Redireciona para `/recrutamento` com toast de sucesso

## 5. UI

**Página `/recrutamento`** (e `/recrutamento/kanban`):
- Banner discreto "Conectar Google Calendar" quando `connected=false`, botão abre `authorizationUrl` em nova aba/redirect
- Quando conectado, mostra `📅 Calendar conectado: email@gmail.com` + botão "Desconectar"

**`BrokerCandidateInteractionDialog.tsx`** (quando `interaction_type === "entrevista"`):
- Adicionar campo **Duração (minutos)** com default 30
- Após salvar a interação no banco, se `next_follow_up_date` existir:
  - Chamar `createGoogleCalendarEvent` (try/catch, não-bloqueante)
  - Sucesso → toast "Evento criado no Google Calendar"
  - Erro de "não conectado" → toast com link para conectar
  - Outro erro → toast com mensagem

## 6. Segurança

- Tokens só acessados via server functions (admin client)
- `state` OAuth assinado com `LOVABLE_API_KEY` (HMAC) + user_id + nonce, validado no callback
- Refresh automático antes de cada chamada à API
- Nada de token no client

## Detalhes técnicos

- Server functions ficam em `src/lib/` (cliente-safe import path)
- Usar `supabaseAdmin` em `client.server.ts` para gravar tokens
- Usar `requireSupabaseAuth` middleware em todas as fns (exceto callback que valida via state)
- Garantir `attachSupabaseAuth` em `src/start.ts`

## Ordem de execução

1. Migration da tabela (peço aprovação)
2. Pedir secrets `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET`
3. Implementar server functions + rota callback + UI
4. Te dar a URL de redirect exata para colar no Google Cloud Console
