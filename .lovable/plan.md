# Corrigir erro "crypto externalized for browser"

## Causa
`src/lib/google-calendar.functions.ts` faz `import { createHmac } from "crypto"` no topo do arquivo. Esse arquivo também é importado por componentes do client (ex.: `GoogleCalendarBanner`, `BrokerCandidateInteractionDialog`). O Vite externaliza `crypto` no browser → qualquer acesso quebra o app inteiro com a tela "Algo deu errado".

A regra do TanStack: módulos com server-only code (Node `crypto`, service role key, etc.) devem viver em `*.server.ts` e nunca ser importados estaticamente por arquivos client.

## Mudanças

1. **Criar `src/lib/google-calendar-state.server.ts`**
   - Mover para lá as funções `signState()` e `verifyState()` que usam `createHmac` e `timingSafeEqual`.
   - Sufixo `.server.ts` garante que o bundler do client rejeite qualquer importação acidental.

2. **Editar `src/lib/google-calendar.functions.ts`**
   - Remover `import { createHmac, timingSafeEqual } from "crypto"`.
   - Importar `signState`/`verifyState` de `./google-calendar-state.server` (uso somente dentro de `.handler()` dos serverFns, então fica isolado no bundle server).
   - Manter toda a API pública (mesmas funções `startGoogleCalendarConnect`, `getMyGoogleCalendarStatus`, `disconnectGoogleCalendar`, `createGoogleCalendarEvent`) — nada muda para os componentes que já consomem.

3. **Editar `src/routes/oauth.google-calendar.callback.tsx`**
   - Se ele importar `crypto` diretamente, trocar pela mesma helper `verifyState` do `*.server.ts`. (Vou confirmar no arquivo antes de editar.)

## Sem mudanças
- Nenhuma alteração de UI, banco de dados, secrets, fluxo OAuth ou tabelas.
- Nenhuma alteração nas URIs de redirect do Google Cloud.

## Resultado esperado
Preview volta a abrir normalmente; banner do Google Calendar e fluxo de conexão continuam funcionando como antes.
