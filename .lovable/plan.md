# Plano: campo "Indicado por" + exibição nos cards de lead

## O que muda

### 1. Banco (1 migração)
- Adicionar coluna `referred_by text` em `public.leads` (texto livre, opcional).

### 2. Formulário de Lead (`src/components/LeadFormDialog.tsx`)
- Nova seção/campo **"Indicado por"** (input de texto livre) — para qualquer pessoa cadastrar quem indicou o lead (cliente, parceiro, corretor, etc.).
- Salvar no insert e update.

### 3. Cards/visualizações de lead — mostrar **Corretor responsável** + **Indicado por**
- **Kanban geral** (`src/routes/_authenticated/kanban.tsx`) — o card já mostra `brokerName`; adicionar linha "Indicado por: X" quando preenchido. Visível para admin (corretor já vê só os próprios).
- **Kanban captação** (`src/routes/_authenticated/kanban-captacao.tsx`) — idem.
- **Kanban em massa** (`src/components/BulkKanbanBoard.tsx`) — adicionar responsável + indicado por.
- **Lista admin** (`src/routes/_authenticated/leads.tsx`) — adicionar coluna "Indicado por".
- **Meus leads** (`src/routes/_authenticated/meus-leads.tsx`) — mostrar "Indicado por" no card.
- **Detalhe do lead** (`src/routes/_authenticated/leads.$id.tsx`) — adicionar campo "Indicado por" no bloco de dados.

## Pergunta antes de implementar

**Sobre "gerente":** hoje o papel `gerente_recrutamento` só acessa o módulo de Recrutamento (não vê Leads). Você quer:

- **(a)** Apenas o **admin** vê o responsável/indicação nos cards (gerente continua sem acesso a leads). *Mais simples — recomendado.*
- **(b)** Dar ao **gerente_recrutamento** acesso de leitura ao módulo de Leads também (ver todos os leads, com responsável e indicação).
- **(c)** Criar um novo papel **"gerente de leads"** separado, análogo ao gerente_recrutamento.

Confirme (a), (b) ou (c) — e o campo "Indicado por" pode ser texto livre, certo? Ou prefere selecionar de uma lista (ex.: outro corretor cadastrado)?
