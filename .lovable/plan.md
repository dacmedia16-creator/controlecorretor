## Diagnóstico (verificado agora)

Existem duas agendas conectadas, ambas por **conta de serviço**:

| Agenda | Acesso real da conta de serviço | `sync_out` salvo |
|---|---|---|
| `dacmedia16@gmail.com` ("Denis Souza") | **owner** (pode escrever) | true |
| `denissouza@remax.com.br` ("REMAX") | **reader** (só leitura) | true (incorreto) |

A tabela `google_calendar_events` está **vazia** — nenhum evento criado pelo app foi gravado no Google até agora.

Causa provável (não confirmada por escrita, pois exigiria criar evento real): ao agendar uma entrevista o app envia **convidados (`attendees`) e `sendUpdates`**. O Google **bloqueia contas de serviço que tentam convidar participantes sem Domain-Wide Delegation** (403 `forbiddenForServiceAccounts`), então a criação falha nas duas agendas. Além disso, a agenda RE/MAX está marcada como gravável, o que gera 403 adicional.

## O que fazer

1. **Confirmar a causa**: criar um evento de teste via servidor nas duas agendas (com e sem `attendees`) e ler o erro exato do Google. O diagnóstico acima orienta a correção, mas o fix final segue o erro real.
2. **Ajustar a criação/edição/exclusão de eventos** em `src/lib/google-calendar.functions.ts`:
   - Para conexões `auth_type = "service_account"`: não enviar `attendees` nem `sendUpdates` (usar `sendUpdates=none`); incluir os dados do candidato (nome, telefone, e-mail) na descrição do evento.
   - Convite por e-mail ao candidato continua apenas em conexões OAuth (se houver).
3. **Respeitar somente-leitura**: corrigir o `sync_out` da conexão RE/MAX para `false` (a detecção de `accessRole` já existe, mas essa conexão foi gravada antes da correção) e re-checar o acesso ao reconectar.
4. **Mensagens claras**: quando alguma agenda falhar, mostrar no toast qual agenda falhou e o motivo, em vez de só "falhou no Google Calendar" (o retorno já traz `failures`, falta exibir em `BrokerCandidateInteractionDialog.tsx`).
5. **Validar**: agendar uma entrevista de teste e conferir que ela aparece em `dacmedia16@gmail.com`, e que a RE/MAX é ignorada na escrita (continua aparecendo na Agenda em modo leitura). Remover o evento de teste depois.

## Observação

Enquanto o Workspace da RE/MAX só permitir compartilhamento externo "Ver todos os detalhes", nenhum evento criado aqui poderá ser gravado lá — a agenda RE/MAX seguirá só como leitura na Agenda do app.
