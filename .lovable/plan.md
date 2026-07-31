## Objetivo

Remover da tela da Agenda o card azul "Conecte uma conta Google para sincronizar as entrevistas com o Google Agenda" (com os botões "Conectar Google Calendar" e "Agenda de serviço"), que aparece quando nenhuma conta Google está conectada.

## O que muda

- Em `src/components/GoogleCalendarBanner.tsx`, quando a lista de conexões estiver vazia, o componente deixa de renderizar qualquer coisa (retorna nada), em vez de exibir o card de convite.
- Quando existir pelo menos uma conta conectada, tudo continua igual: lista de contas, calendários, opções de sincronização e diagnóstico.

## O que não muda

- Nenhuma alteração de banco de dados, permissões ou sincronização.
- As funções de conectar conta e conectar agenda de serviço continuam existindo no código; apenas o aviso deixa de aparecer nessa situação.
