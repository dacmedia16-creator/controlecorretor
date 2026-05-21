## Objetivo

Criar um funil de **Recrutamento de Corretores** (candidatos a entrar na equipe), com Kanban próprio, totalmente isolado do módulo de Leads. Só admin gerencia.

## Por que tabela separada (e não reaproveitar `leads`)

- Campos diferentes: CRECI, anos de experiência, currículo, pretensão, cidade de atuação, LinkedIn.
- RLS diferente: candidatos não são "atribuídos" a corretores — só admin vê.
- Pipeline curto e simples — não precisa carregar regras de leads (import em massa, distribuição, interações comerciais, captação de imóvel etc).
- Evita poluir o trigger `enforce_lead_status_kanban_type` com mais um tipo.

## Mudanças no banco

### 1. Nova tabela `broker_candidates`
Campos de domínio:
- `name`, `email`, `phone`, `phone_normalized`
- `city`, `creci`, `years_experience` (int), `linkedin_url`, `resume_url`
- `source` (indicação, site, Instagram, etc — mesma lista de `SOURCES`)
- `status_id` → referencia `kanban_statuses` filtrando `kanban_type='broker_recruitment'`
- `general_notes`
- `hired_user_id` (uuid, opcional) — quando contratado, aponta para o `profiles.id` criado
- `created_by_user_id`, `created_at`, `updated_at`

Triggers:
- `set_updated_at`
- `set_phone_normalized`
- Novo `log_broker_status_change` → grava em `broker_candidate_interactions`

### 2. Nova tabela `broker_candidate_interactions`
- `candidate_id`, `user_id`, `interaction_type` (ligacao, whatsapp, email, entrevista, observacao, status_change), `notes`, `next_follow_up_date`, `created_at`

### 3. Extensão de `kanban_statuses`
Adicionar `broker_recruitment` na lista de `kanban_type` aceitos. Seed inicial:
1. Primeiro contato
2. Entrevista marcada
3. Entrevista realizada
4. Contratado
5. Reprovado (inativo)

### 4. RLS
Ambas as tabelas: **somente admin** (`has_role(auth.uid(),'admin')`) para SELECT/INSERT/UPDATE/DELETE.

## Mudanças no frontend

### Menu lateral (`AppLayout.tsx`)
Nova seção/entrada visível só para admin:
- **Recrutamento** → `/recrutamento` (lista) e `/recrutamento/kanban`

### Novas rotas
- `src/routes/_authenticated/recrutamento.tsx` — lista de candidatos (tabela com filtros por status, cidade, source).
- `src/routes/_authenticated/recrutamento.kanban.tsx` — Kanban com colunas vindas de `kanban_type='broker_recruitment'`, drag-and-drop entre etapas (mesmo padrão do Kanban geral).
- `src/routes/_authenticated/recrutamento.$id.tsx` — detalhe do candidato: dados, histórico de interações, botão "Registrar interação", botão "Mover etapa", botão "Marcar como contratado".

### Componentes novos
- `BrokerCandidateFormDialog.tsx` — criar/editar candidato.
- `BrokerCandidateInteractionDialog.tsx` — registrar interação (clone enxuto do `InteractionDialog`).

### Configurações do Kanban
Adicionar 5ª aba em `configuracoes.kanban.tsx`: **Recrutamento** (`broker_recruitment`), reusando o `KanbanTypeEditor` já existente.

### Ação "Contratado"
Quando admin move um candidato para a coluna "Contratado":
- Dialog confirma e oferece **"Criar acesso de corretor agora"** (opcional, fase 2).
- Por ora, só atualiza o status e grava `hired_user_id` manualmente se já existir profile. Convite/criação de usuário fica para próxima etapa para não acoplar com `auth.admin`.

## O que NÃO muda

- Tabela `leads`, `lead_interactions`, fluxos de leads/captação/massa.
- RLS de leads, autenticação, dashboard atual.
- Trigger `enforce_lead_status_kanban_type` (broker_recruitment não passa por ela porque usa outra tabela).

## Ordem de execução

1. Migration: tabelas `broker_candidates` + `broker_candidate_interactions`, RLS, triggers, ampliar `kanban_type`, seed das 5 colunas.
2. Atualizar `configuracoes.kanban.tsx` (5ª aba).
3. Criar rotas `recrutamento`, `recrutamento.kanban`, `recrutamento.$id`.
4. Criar `BrokerCandidateFormDialog` e `BrokerCandidateInteractionDialog`.
5. Atualizar menu lateral.
6. Smoke test: criar candidato, mover entre colunas, registrar interação, marcar como contratado.

## Diagrama

```text
Recrutamento (admin-only)
  /recrutamento          → lista
  /recrutamento/kanban   → Kanban (broker_recruitment)
  /recrutamento/:id      → detalhe + histórico

broker_candidates ──(status_id)──> kanban_statuses(kanban_type='broker_recruitment')
broker_candidate_interactions ──(candidate_id)──> broker_candidates
```

## Próximos passos (fase 2, fora deste plano)

- Convite/criação automática de usuário corretor ao marcar como "Contratado".
- Upload de currículo via storage.
- Métricas de recrutamento no Dashboard (candidatos ativos, taxa de contratação, tempo médio por etapa).
