# BrokerFlow CRM — Plano de Implementação

CRM imobiliário responsivo com dois perfis (administrador e corretor), gestão de leads, Kanban editável, histórico de interações e gestão de corretores. Backend via **Lovable Cloud** (Postgres + Auth + RLS).

## Stack
- Frontend: TanStack Start + React 19 + Tailwind v4 + shadcn/ui
- Backend: Lovable Cloud (Postgres, Auth email/senha, RLS)
- Drag & drop Kanban: `@dnd-kit/core`
- Estado servidor: TanStack Query

## Estrutura de telas / rotas
- `/login` — login email+senha; redireciona por papel
- `/_authenticated` — guard de sessão + carrega papel
  - `/dashboard` — admin only (cards + tabela desempenho)
  - `/leads` — admin (tabela completa com filtros)
  - `/leads/$id` — detalhes + histórico (admin e corretor dono)
  - `/kanban` — Kanban (admin vê tudo, corretor só seus)
  - `/meus-leads` — visão do corretor (lista + ações rápidas)
  - `/corretores` — admin (CRUD corretores)
  - `/configuracoes/kanban` — admin (CRUD etapas, cor, ordem, ativo)

## Layout
- Sidebar fixa no desktop (shadcn sidebar), bottom nav no mobile
- Header com perfil + logout
- Mobile-first nas telas do corretor

## Banco de dados (Lovable Cloud)

Tabela separada de papéis (segurança):
```
app_role enum: 'admin' | 'corretor'
user_roles(id, user_id→auth.users, role, unique(user_id, role))
has_role(uid, role) SECURITY DEFINER
```

Tabelas de domínio:
- `profiles(id=auth.users.id, name, email, phone, active, created_at)` — auto-criada via trigger no signup
- `kanban_statuses(id, name, position, color, active, created_at)` — seed com os 10 status pedidos
- `leads(id, name, phone, email, city, neighborhood, property_type, interest_type, source, assigned_to_user_id, status_id→kanban_statuses, general_notes, created_by_user_id, created_at, updated_at)` — trigger updated_at
- `lead_interactions(id, lead_id, user_id, interaction_type, interaction_result, notes, next_follow_up_date, created_at)`

### RLS (resumo)
- `profiles`: admin lê todos; corretor lê o próprio; admin escreve
- `kanban_statuses`: todos autenticados leem; só admin escreve
- `leads`:
  - SELECT: admin OU `assigned_to_user_id = auth.uid()` OU `created_by_user_id = auth.uid()`
  - INSERT: qualquer autenticado (corretor força `assigned_to_user_id = auth.uid()` no client; admin livre)
  - UPDATE: admin (qualquer campo) OU corretor dono (apenas `status_id`, `general_notes`)
  - DELETE: só admin
- `lead_interactions`:
  - SELECT: admin OU usuário com acesso ao lead
  - INSERT: usuário com acesso ao lead; `user_id = auth.uid()`

## Funcionalidades-chave

**Login** — Supabase auth (email/senha). Após login, busca papel em `user_roles` e redireciona: admin → `/dashboard`, corretor → `/meus-leads`.

**Dashboard admin** — 7 cards de contagem (queries agregadas por status) + tabela desempenho por corretor (joins agrupados).

**Leads (admin)** — DataTable com filtros (corretor, status, cidade, origem, intervalo de datas), paginação client-side, ações: criar/editar/excluir/atribuir/mudar status/ver histórico (sheet lateral).

**Kanban** — colunas dinâmicas a partir de `kanban_statuses` ativos ordenados por `position`. Drag & drop com `@dnd-kit`; ao soltar, update otimista do `status_id` + cria interação automática "mudança de status". Card mostra: nome, telefone, corretor, status (cor), última interação, próximo retorno.

**Tela do corretor (`/meus-leads`)** — lista mobile-first com cards, botões: novo lead, registrar interação (modal), mudar status (select), abrir WhatsApp (`https://wa.me/<phone>`).

**Detalhes do lead** — todos os campos + timeline de `lead_interactions` em ordem desc + form para nova interação.

**Configurações Kanban** — lista reordenável (drag handle), edit inline, color picker, toggle ativo, criar nova etapa.

**Gestão de corretores** — admin cria via convite (signup com email + role = corretor inserido em `user_roles`); editar nome/telefone/ativo; mostra contagem de leads e métricas.

## Seed de exemplo
Migration insere: 10 statuses padrão; o primeiro usuário registrado vira admin (via lógica no trigger). Dados de demonstração (corretores fictícios + leads) podem ser inseridos manualmente após o primeiro login para evitar conflito com auth real.

## Considerações futuras (SaaS multiempresa)
Estrutura preparada: adicionar coluna `tenant_id` em todas as tabelas no futuro + RLS por tenant. Não implementado agora para manter simplicidade.

## Entrega em fases
1. Habilitar Lovable Cloud + schema + RLS + seed de statuses
2. Auth (login, guard, hook de papel) + layout (sidebar/bottom nav)
3. Gestão de corretores + dashboard admin
4. CRUD de leads (tabela admin + detalhes + histórico)
5. Kanban com drag & drop
6. Tela do corretor (mobile) + WhatsApp + interações rápidas
7. Configurações do Kanban
8. Polimento responsivo + dados de exemplo

## Pontos a confirmar
- **Primeiro admin**: criar via "primeiro usuário registrado = admin" automaticamente, ou você prefere que eu defina um email específico como admin no seed?
- **Cadastro de corretor**: o admin envia convite por email (Supabase magic link) ou cria com senha temporária que o corretor troca depois?
