## Situação atual (verificada agora)

- Você tem 2 agendas conectadas, ambas por **conta de serviço**:
  - **Denis Souza** (`dacmedia16@gmail.com`) — envio ligado (`sync_out = true`)
  - **REMAX** (`denissouza@remax.com.br`) — **somente leitura** (`sync_out = false`), porque o Workspace da RE/MAX só permite compartilhamento "ver detalhes"
- A tabela de eventos enviados (`google_calendar_events`) está **vazia**: nenhuma entrevista foi registrada como criada no Google até agora.
- A última entrevista foi salva às 18:36 (candidato agendado para 01/08), depois do último ajuste — e mesmo assim não gerou registro de evento.

Ou seja: ou a caixinha "Adicionar ao Google Agenda" não estava marcada/visível no momento do salvamento, ou a chamada ao Google falhou e o erro só apareceu num toast que passou. Hoje não há como saber depois do fato — não guardamos nenhum log.

Importante: se você está olhando a agenda **RE/MAX**, nada vai aparecer lá — ela está marcada como somente leitura. Eventos criados pelo app vão para a agenda **dacmedia16@gmail.com**.

## O que vou fazer

1. **Botão "Testar envio" na tela Agenda**
   Cria um evento de teste real em cada agenda com envio ligado e mostra, por agenda, sucesso ou o erro exato devolvido pelo Google (status + mensagem). Inclui botão para apagar o evento de teste.

2. **Registro de sincronização (log)**
   Nova tabela de log guardando cada tentativa de envio: agenda, resultado, status HTTP e mensagem do Google. Exibida na Agenda numa seção "Últimas sincronizações", para nunca mais depender de um toast que sumiu.

3. **Erros que não passam despercebidos**
   - Se a entrevista for salva com a agenda conectada mas o evento não for criado, mostrar alerta persistente (não só toast) com o motivo.
   - Se nenhuma conexão tiver envio ligado, avisar claramente antes de salvar: "Nenhuma agenda com permissão de escrita — o evento não será criado no Google".

4. **Deixar o destino explícito na tela de agendamento**
   No diálogo de interação, mostrar em qual(is) agenda(s) o evento será criado e sinalizar as somente-leitura, para não haver dúvida sobre onde procurar.

5. **Verificar a permissão real da agenda `dacmedia16@gmail.com`**
   Checar via API se a conta de serviço (`recrutamento-remax@recrutamento-504016.iam.gserviceaccount.com`) tem mesmo "Fazer alterações nos eventos" nessa agenda. Se tiver só leitura, ajusto o status no sistema e te digo exatamente o que mudar no Google.

## Detalhes técnicos

- Nova server fn `testGoogleCalendarWrite` (admin/gerente) em `src/lib/google-calendar.functions.ts`: cria e opcionalmente apaga um evento de teste, retornando `{ calendarId, ok, status, error }` por destino.
- Migration: tabela `google_calendar_sync_log` (user_id, connection_id, calendar_id, operation, ok, http_status, error, created_at) com GRANTs e RLS restrita ao dono/admin; gravação via `supabaseAdmin` dentro das server fns de create/update/delete.
- `createGoogleCalendarEvent` passa a registrar log em toda tentativa, inclusive falhas, e a retornar os destinos usados.
- UI: bloco de diagnóstico em `src/routes/agenda.tsx` (ou no `GoogleCalendarBanner`) e aviso de destino no `BrokerCandidateInteractionDialog.tsx`.

Nada do fluxo atual de recrutamento, kanban ou agenda é alterado — apenas diagnóstico, log e avisos.