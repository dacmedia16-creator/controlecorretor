## Objetivo

Facilitar a conexão da conta Google da RE/MAX colocando o gerenciador de contas Google também na tela **Agenda** (`/agenda`), onde ele faz mais sentido no uso diário.

## O que muda

- A Agenda passa a exibir, no topo, o mesmo card **"Contas Google conectadas"** já usado em Recrutamento:
  - botão "Conectar outra conta" (abre o consentimento do Google com seleção de conta, permitindo adicionar a RE/MAX sem substituir a conta atual);
  - por conta: interruptores "Enviar compromissos" e "Mostrar na Agenda", seletor de quais agendas usar e botão desconectar.
- O retorno do login do Google volta para a tela de origem (hoje sempre cai em Recrutamento → Kanban), para quem conectou pela Agenda continuar na Agenda.
- Ao conectar/alterar preferências, a Agenda recarrega os eventos externos automaticamente.

## Detalhes técnicos

- `src/routes/_authenticated/agenda.tsx`: renderizar `<GoogleCalendarBanner />` acima do cabeçalho da semana.
- `src/lib/google-calendar.functions.ts` (`startGoogleCalendarConnect`): aceitar um `returnPath` opcional e embuti-lo no `state` assinado.
- `src/routes/oauth.google-calendar.callback.tsx`: redirecionar para o `returnPath` do state (com fallback para `/recrutamento/kanban`), mantendo os parâmetros `gcal=connected|error`.
- `src/components/GoogleCalendarBanner.tsx`: enviar o caminho atual como `returnPath` e invalidar também a query `google-events`.

Nenhuma mudança de banco de dados é necessária.