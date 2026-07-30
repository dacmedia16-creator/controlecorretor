## Diagnóstico confirmado

O envio está sendo bloqueado por uma incompatibilidade de usuário:

- A agenda **Denis Souza** está conectada ao usuário administrador `dacmedia16@gmail.com`, com envio e recebimento ativos.
- As 6 entrevistas futuras pertencem à recrutadora `nicole@gmail.com`.
- O código atual busca **entrevistas e conexão Google pelo mesmo usuário logado**.
- Assim, o administrador encontra a agenda, mas nenhuma entrevista pendente; a recrutadora encontra as entrevistas, mas nenhuma agenda de envio.
- O teste técnico da agenda retornou sucesso, porém não criou evento real e não estava ligado a nenhuma entrevista. Não há registros em `google_calendar_events` e não houve tentativas de criação nos logs.

## Implementação

1. **Transformar a agenda de serviço em agenda compartilhada do recrutamento**
   - Manter agendas OAuth pessoais vinculadas ao próprio usuário.
   - Permitir que administradores, gerentes de recrutamento e recrutadores autorizados usem a conexão de conta de serviço “Denis Souza” para enviar entrevistas.
   - Centralizar essa resolução em uma função segura no servidor, sem expor credenciais.

2. **Corrigir o envio ao criar uma entrevista**
   - Ao salvar uma entrevista por qualquer recrutador, localizar a agenda compartilhada com `sync_out` ativo.
   - Criar o evento no Google e registrar o vínculo em `google_calendar_events`.
   - Persistir sucesso ou erro real em `google_calendar_sync_log`.

3. **Corrigir “Sincronizar agora”**
   - Recrutador: processar as próprias entrevistas pendentes.
   - Gerente/admin: processar entrevistas pendentes de toda a equipe.
   - Usar a agenda compartilhada Denis Souza mesmo quando ela estiver cadastrada por outro administrador.
   - Mostrar candidato, horário, agenda de destino e eventual mensagem exata do Google.

4. **Evitar duplicações**
   - Antes de criar, conferir o rastreamento por interação, conexão e agenda.
   - Não reenviar entrevistas que já tenham evento confirmado.
   - Se uma tentativa falhar, manter a entrevista como pendente para nova sincronização.

5. **Validar ponta a ponta**
   - Reenviar uma das entrevistas futuras já existentes.
   - Confirmar resposta de criação do Google, ID do evento salvo e log de sucesso.
   - Conferir que o evento aparece na agenda `dacmedia16@gmail.com` e que o contador de pendências diminui.