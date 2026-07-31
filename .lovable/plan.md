## Objetivo

Na Agenda, os cards em azul escuro (espelho do Google) estão se sobrepondo aos compromissos do sistema. Vou ocultá-los da visualização.

## O que muda

Arquivo: `src/routes/_authenticated/agenda.tsx`

1. Adicionar um estado `mostrarGoogle`, iniciando **desligado** — a Agenda passa a exibir apenas os compromissos do sistema (entrevistas e follow-ups).
2. Incluir um botão/switch discreto no topo da Agenda ("Mostrar Google Agenda") para quem quiser reativar o espelho pontualmente.
3. Quando desligado: não montar a lista `googleEvents` na grade nem na vista em lista, e desabilitar a busca `listGoogleEventsRange` (menos chamadas ao Google).
4. Toda a lógica de envio/sincronização para o Google continua igual — apenas a exibição do espelho é ocultada.

## Detalhe técnico

O filtro é aplicado no `useMemo` que combina `localEvents` + `googleEvents`, e a query `["google-events", ...]` recebe `enabled: mostrarGoogle`. Nenhuma alteração de backend, banco ou permissões.
