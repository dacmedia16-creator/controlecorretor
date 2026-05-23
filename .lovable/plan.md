# Modo Mobile — Revisão Completa

## 1. Navegação mobile (drawer hambúrguer)

Substituir a barra inferior fixa de 4 ícones por uma **gaveta lateral** com todos os itens do menu.

- Em `src/components/AppLayout.tsx`:
  - Remover a `<nav>` inferior (`grid grid-cols-4`).
  - No header mobile, trocar o ícone do logo por um botão hambúrguer (`Menu`) que abre um `Sheet` lateral à esquerda.
  - Dentro do `Sheet`, renderizar **todos** os itens permitidos pelo role (mesma lista `items` do desktop), com ícone + label, item ativo destacado, nome/role do usuário no rodapé e botão "Sair".
  - Fechar a gaveta automaticamente ao clicar num item (via `onOpenChange`).
- Remover o `pb-20` do `<main>` (não tem mais barra inferior); manter `pt-14` no mobile.

## 2. Telas — ajustes responsivos

Para cada tela, garantir: padding adequado, sem scroll horizontal indesejado, botões/inputs alcançáveis com o polegar, tipografia legível.

### Listas / tabelas (Leads, Corretores, Recrutamento, Leads em Massa, Distribuição)
- Em `< md`, esconder a `<Table>` (`hidden md:table`) e renderizar uma **lista de cards** equivalente (`md:hidden`) mostrando os campos principais (nome, telefone, status, responsável, indicado por) + ações em menu de 3 pontos.
- Filtros/busca: empilhar verticalmente (`flex-col md:flex-row`), input full-width.
- Paginação: botões maiores, centralizados.

### Kanban (Compra, Captação, Recrutamento, versões "em Massa")
- Manter scroll horizontal das colunas, mas:
  - Largura de coluna fixa adequada ao mobile (`w-[85vw] md:w-72`) para mostrar ~1 coluna por vez com "espiada" da próxima.
  - Snap horizontal (`snap-x snap-mandatory`, colunas `snap-center`).
  - Header sticky por coluna.
  - Cards com `text-sm`, padding reduzido, badges em wrap.
- Drag-and-drop continua funcionando via touch (já é dnd-kit).

### Dashboards (Dashboard, Dashboard Recrutamento)
- Grids de cards: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
- Gráficos: `ResponsiveContainer` com altura menor no mobile.

### Formulários (LeadFormDialog, BrokerCandidateFormDialog, Interaction dialogs, Login)
- `Dialog` → no mobile virar tela cheia: `max-w-[100vw] h-[100dvh] md:h-auto md:max-w-lg rounded-none md:rounded-lg`.
- Campos em 1 coluna no mobile, 2 colunas em `sm:` quando fizer sentido.
- Botões do footer empilhados (`flex-col-reverse sm:flex-row`).

### Detalhe (Leads $id, Recrutamento $id)
- Layout 2 colunas vira 1 coluna no mobile.
- Linha do tempo / interações com avatar menor e texto compacto.
- Botões de ação (WhatsApp, Editar, etc.) viram barra sticky no rodapé.

### FollowUpSidebar / NotificationBell
- Já usam `Sheet` — só revisar largura (`w-full sm:max-w-md` já está ok) e tamanhos de toque.

## 3. Tokens / utilidades
- Não criar novos tokens de cor. Usar os existentes em `src/styles.css`.
- Garantir `min-h-[44px]` em alvos de toque principais (botões de ação, itens de nav).
- Trocar `text-xs` por `text-sm` quando virar conteúdo principal em mobile.

## 4. Validação
- Testar em viewport 430×777 (atual) e 360×800.
- Conferir: navegação abre/fecha, todas as rotas acessíveis pela gaveta, kanbans deslizam com snap, formulários cabem na tela, tabelas viram cards.

## Detalhes técnicos
- Componentes usados: `Sheet`, `SheetTrigger`, `SheetContent` (side="left"), `ScrollArea`, `DropdownMenu` (para ações nos cards de lista).
- Hook `useIsMobile` (já existe) para alternar render Table↔Cards quando for mais simples que classes Tailwind.
- Nenhuma mudança de banco, RLS, server functions ou lógica de negócio — só UI/apresentação.
