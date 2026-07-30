## Objetivo

Permitir conectar a agenda da RE/MAX usando a **conta de serviço** já criada no Google Cloud, em vez do fluxo OAuth (que está bloqueado pelo modo *Testing*). O app passa a poder criar, editar e excluir eventos, e ler eventos, em qualquer calendário compartilhado com o e-mail da conta de serviço.

## Como vai funcionar para você

1. No Google Agenda da RE/MAX: **Configurações do calendário → Compartilhar com pessoas específicas → adicionar o e-mail da conta de serviço** (algo como `recrutamento@<projeto>.iam.gserviceaccount.com`) com permissão **"Fazer alterações nos eventos"**.
2. No app, na **Agenda**, no card de contas Google, aparece um novo botão **"Conectar agenda de serviço"**.
3. Você informa o **ID do calendário** (o e-mail da agenda, visto em Configurações → Integrar agenda) e dá um apelido (ex.: "RE/MAX").
4. O app testa a conexão na hora e mostra sucesso ou o motivo da falha.
5. Depois disso a agenda de serviço funciona igual às demais: marcar "Enviar compromissos" e "Mostrar na Agenda", com sincronização nos dois sentidos.

A chave JSON será guardada como **segredo do backend** (vou pedir para você colar). Ela nunca aparece no navegador.

## Alterações técnicas

**Banco** — nova migração na tabela `user_google_calendar_connections`:
- `auth_type text not null default 'oauth'` (valores: `oauth` | `service_account`)
- `service_account_email text`, `display_name text`
- tornar `refresh_token`, `access_token` e `expires_at` anuláveis (conta de serviço não usa refresh token persistido)
- ajustar a constraint única para `(user_id, google_email)` continuar válida usando o ID do calendário como `google_email` nas conexões de serviço

**Backend** (`src/lib/google-calendar.server.ts`):
- ler o segredo `GOOGLE_SERVICE_ACCOUNT_JSON` dentro dos handlers
- nova função `serviceAccountToken()`: monta o JWT (`aud: https://oauth2.googleapis.com/token`, `scope: https://www.googleapis.com/auth/calendar`), assina com **WebCrypto RSASSA-PKCS1-v1_5 / SHA-256** (compatível com o runtime de Workers — `node:crypto.createSign` não é confiável lá) e troca por access token no endpoint `urn:ietf:params:oauth:grant-type:jwt-bearer`, com cache em memória por ~50 min
- `freshTokenFor(conn)` passa a ramificar: `service_account` → `serviceAccountToken()`; `oauth` → fluxo atual inalterado
- `GCAL_RECONNECT_ERROR` e a exclusão automática por `invalid_grant` só se aplicam a conexões OAuth

**Server functions** (`src/lib/google-calendar.functions.ts`):
- `connectServiceCalendar({ calendarId, displayName })` — apenas admin/gerente: valida chamando `GET /calendar/v3/calendars/{id}` com o token da conta de serviço; se der 404/403 retorna mensagem clara ("compartilhe o calendário com `<email da conta de serviço>` e dê permissão de alterar eventos"); em caso de sucesso grava a conexão
- `getServiceAccountEmail()` — devolve o e-mail da conta de serviço para exibir na UI (facilita o passo de compartilhamento)
- as funções existentes de criar/editar/excluir/listar eventos não mudam: já iteram sobre as conexões e usam `freshTokenFor`

**UI** (`src/components/GoogleCalendarBanner.tsx`):
- botão "Conectar agenda de serviço" abrindo um diálogo com: e-mail da conta de serviço (com botão copiar), campo de ID do calendário, apelido, instrução curta de compartilhamento e estado de carregamento/erro
- conexões de serviço aparecem na mesma lista, com selo "Conta de serviço" e sem o aviso de "reconectar"

**Segredo**: vou solicitar `GOOGLE_SERVICE_ACCOUNT_JSON` (conteúdo integral do arquivo JSON baixado) antes de implementar.

## Limitações a saber

- Só funciona em calendários explicitamente compartilhados com o e-mail da conta de serviço; não dá acesso automático a toda a conta Google da RE/MAX.
- Convites enviados por eventos criados pela conta de serviço saem em nome da conta de serviço (não do seu e-mail), salvo delegação de domínio configurada pelo admin da RE/MAX.
- O fluxo OAuth atual continua funcionando normalmente para as contas já conectadas.
