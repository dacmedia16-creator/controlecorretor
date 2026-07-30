## Objetivo

Testar a conexão da agenda RE/MAX (`denissouza@remax.com.br`) via conta de serviço, em modo somente leitura, e confirmar que os eventos aparecem na tela Agenda.

## Passos

1. **Verificar a conta de serviço**
   - Confirmar que o segredo `GOOGLE_SERVICE_ACCOUNT_JSON` está presente e que o token RS256 é emitido com sucesso (`serviceAccountToken()` em `src/lib/google-calendar.server.ts`).

2. **Testar acesso ao calendário**
   - Chamar a API do Google para `calendars/denissouza@remax.com.br` e `users/me/calendarList/...` usando o token da conta de serviço.
   - Resultados esperados:
     - `200` + `accessRole: "reader"` → conexão somente leitura (esperado).
     - `404/403` → o compartilhamento no Google ainda não propagou ou o ID está errado.

3. **Executar a conexão real**
   - Rodar `connectServiceCalendar` para gravar a conexão com `sync_in: true`, `sync_out: false`.

4. **Validar na Agenda**
   - Abrir `/agenda` no preview autenticado e confirmar:
     - a conexão "RE/MAX" aparece no banner com o aviso de somente leitura;
     - eventos do Google da agenda RE/MAX são listados na semana atual;
     - nenhuma tentativa de escrita é feita nessa conexão (erros 403 não devem ocorrer).

5. **Relatar o resultado**
   - Se o acesso falhar, indicar exatamente o que ajustar no Google (e-mail compartilhado / ID do calendário) sem alterar código.

## Detalhes técnicos

- Nenhuma mudança de schema prevista; a coluna `sync_out` já controla a escrita.
- Se o teste revelar que algum caminho de escrita ignora `sync_out`, corrigir o filtro em `src/lib/google-calendar.server.ts`.
- Se `accessRole` vier `freeBusyReader`, os eventos aparecem sem título — nesse caso avisar o usuário e sugerir pedir "Ver todos os detalhes".