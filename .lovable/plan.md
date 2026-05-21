## Atalho de Observação no card do Kanban

Adicionar, em cada card do kanban de recrutamento, um botão de **Observação** que abre o `BrokerCandidateInteractionDialog` já existente com o tipo pré-selecionado como "Observação".

### Mudanças

- `src/components/BrokerCandidateInteractionDialog.tsx`
  - Aceitar prop opcional `defaultType` (default `"ligacao"`).
  - Inicializar o `useState` do tipo com `defaultType` e resetar para esse valor ao salvar/fechar.

- `src/routes/_authenticated/recrutamento.kanban.tsx`
  - No `CandidateCard`, adicionar um botão pequeno "Observação" (ícone `StickyNote` ou `MessageSquare`) ao lado do badge do WhatsApp.
  - Estado local no card (`obsOpen`) controlando o dialog.
  - Bloquear o drag no botão (`onPointerDown` stop propagation).
  - Ao abrir, usa `<BrokerCandidateInteractionDialog defaultType="observacao" candidateId={cand.id} />`.

### Fora de escopo

- Mostrar a última observação no próprio card.
- Adicionar o mesmo atalho na tela de lista (`/recrutamento`).

Confirma?
