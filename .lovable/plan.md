## Situação atual (verificada)

- Hoje o sistema guarda **uma única conta Google por usuário**. A única conexão existente é `dacmedia16@gmail.com` — por isso os compromissos vão para esse calendário e não aparecem no calendário da conta RE/MAX do print.
- A sincronização é **de mão única**: o app grava eventos no Google, mas nunca lê eventos do Google. Por isso "Visita Prova com Denis" não aparece na Agenda do sistema.
- Só entrevistas registradas no Recrutamento criam evento no Google; a Agenda apenas edita/exclui os já criados.

## O que será feito

### 1. Várias contas Google por usuário
- Permitir conectar mais de uma conta (ex.: pessoal + RE/MAX). Cada conexão guarda o e-mail, os calendários escolhidos e duas opções:
  - **Enviar compromissos para esta conta** (escrita)
  - **Mostrar eventos desta conta na Agenda** (leitura)
- Botão "Conectar outra conta Google" no card do Google Calendar, com lista das contas conectadas, seleção de calendários por conta e botão de desconectar individual.

### 2. Envio para todas as contas marcadas
- Ao criar, reagendar ou excluir uma entrevista, o evento é replicado em todas as contas/calendários marcados para escrita (convite ao candidato enviado só uma vez, no calendário principal).

### 3. Eventos do Google dentro da Agenda (novo)
- A tela `/agenda` passa a buscar, via servidor, os eventos da semana visível em todos os calendários marcados para leitura.
- Eles aparecem no quadro semanal e na lista, com cor/etiqueta diferente ("Google") e o nome da conta de origem, para não se confundirem com entrevistas e follow-ups do sistema.
- Eventos vindos do Google são somente leitura nesta primeira versão (não arrastáveis, não excluíveis pelo app), com link "Abrir no Google Agenda".
- Botão de atualizar e cache curto para não pesar a tela.

### 4. Ajustes de robustez
- Guardar o ID do evento do Google criado (em vez de procurar pelo nome/horário), para que reagendar e excluir funcionem de forma confiável em cada conta.
- Se uma conta perder autorização, a Agenda mostra aviso de reconexão apenas daquela conta, sem quebrar as demais.

## Detalhes técnicos

- **Banco**: `user_google_calendar_connections` passa a ter `id` como chave primária, unicidade por (`user_id`, `google_email`), e as colunas `sync_out boolean default true` e `sync_in boolean default true`. Nova tabela `google_calendar_events` (interaction_id, connection_id, calendar_id, google_event_id) para rastrear os eventos criados.
- **OAuth**: acrescentar o escopo `calendar.readonly` (a conta precisará reautorizar uma vez); o `state` passa a permitir vincular uma nova conexão em vez de sobrescrever a existente.
- **Server functions** (`google-calendar.functions.ts`): `listMyGoogleConnections`, `setConnectionPrefs`, `disconnectGoogleConnection(id)`, `listGoogleEventsRange({startISO, endISO})`; criação/atualização/exclusão passam a iterar sobre as conexões com `sync_out`.
- **UI**: `GoogleCalendarBanner.tsx` vira lista de contas; `agenda.tsx` mescla os eventos externos no mesmo modelo `AgendaEvent` com `kind: "google"`.

## Observação

Para a conta RE/MAX aparecer, será preciso clicar em "Conectar outra conta Google" e autorizar com o login da RE/MAX. Se essa conta for do Google Workspace com restrições, o administrador pode precisar liberar o app.
