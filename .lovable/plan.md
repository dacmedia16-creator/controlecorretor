## Objetivo

Criar um novo perfil de usuário **`recrutador`**, com acesso exclusivo ao módulo de Recrutamento de Corretores. O recrutador não vê leads, kanban de compra, captação nem dashboard comercial — só o pipeline de candidatos.

## Mudanças no banco

### 1. Ampliar enum `app_role`
```sql
ALTER TYPE app_role ADD VALUE 'recrutador';
```

### 2. Ajustar `handle_new_user`
Hoje promove o primeiro usuário a `admin` e os demais a `corretor`. Vai passar a respeitar `raw_user_meta_data->>'role'` quando o admin criar o usuário com role explícita. Default continua `corretor`.

### 3. RLS — habilitar acesso do recrutador
Atualizar as policies das tabelas de recrutamento para aceitar **admin OU recrutador**:
- `broker_candidates` — policy `admin OR recrutador` para ALL.
- `broker_candidate_interactions` — idem.
- `kanban_statuses` — recrutador pode gerenciar (SELECT/INSERT/UPDATE/DELETE) **somente** linhas onde `kanban_type = 'broker_recruitment'`. Admin mantém acesso total.
- `profiles` — recrutador lê o próprio perfil (já coberto pelo `read all authenticated`).

Helper opcional: `is_recruiter_or_admin()` security definer para evitar repetição.

### 4. Sem mudanças em `leads`, `lead_interactions`, `lead_import_batches`, `lead_distributions`
Recrutador não recebe nenhuma policy nessas tabelas → fica invisível para ele.

## Mudanças no frontend

### 1. Tipos
- `src/lib/auth.tsx`: `AppRole = "admin" | "corretor" | "recrutador"`.

### 2. Menu (`AppLayout.tsx`)
Adicionar `roles: ("admin" | "corretor" | "recrutador")[]` em `NavItem`. Para o recrutador, exibir apenas:
- **Dashboard Recrutamento** → `/recrutamento/dashboard` (novo)
- **Recrutamento (lista)** → `/recrutamento`
- **Kanban Recrutamento** → `/recrutamento/kanban`
- **Configurações de Etapas** → `/configuracoes/kanban` (mas com guarda na própria página, ver abaixo)

### 3. Redirect pós-login (`src/routes/index.tsx`)
```ts
if (role === "admin") → /dashboard
else if (role === "recrutador") → /recrutamento/dashboard
else → /meus-leads
```

### 4. Nova rota `recrutamento.dashboard.tsx`
KPIs simples consultando `broker_candidates`:
- Candidatos ativos (não Reprovado/Contratado)
- Total por etapa (barras)
- Contratados no mês
- Tempo médio entre Primeiro contato → Contratado
- Atalhos: "Novo candidato", "Abrir Kanban"

### 5. Guarda de rotas
Criar helper `requireRoles(roles[])` ou checagem inline nos `_authenticated/*` que hoje são admin-only (`leads.tsx`, `dashboard.tsx`, `corretores.tsx`, etc.) — se `role === 'recrutador'`, redireciona para `/recrutamento/dashboard`.

Rotas de recrutamento: liberar para `admin` e `recrutador`.

### 6. Configurações do Kanban (`configuracoes.kanban.tsx`)
- Admin: vê as 5 abas (general, captação, bulk_leads, bulk_captacao, broker_recruitment).
- Recrutador: vê **só** a aba "Recrutamento".

### 7. Tela de criação de usuários (admin)
Na página `/corretores` (ou nova aba "Usuários"):
- Botão "Novo usuário" → dialog com nome, email, telefone, senha provisória, **select de role** (`corretor` | `recrutador`).
- Submit chama uma server function `createUser` (`createServerFn` + `supabaseAdmin`) que:
  1. `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, phone, role } })`
  2. O trigger `handle_new_user` cria o profile e usa `user_metadata.role` para inserir em `user_roles`.
- Só admin pode chamar essa server function (checa `has_role(uid,'admin')` no handler).

## Arquivos novos

- `src/routes/_authenticated/recrutamento.dashboard.tsx`
- `src/lib/users.functions.ts` — server fn `createUser`, `deactivateUser`
- `src/components/CreateUserDialog.tsx`

## Arquivos alterados

- `supabase/migrations/<novo>.sql` — enum + policies + trigger
- `src/lib/auth.tsx` — tipo `AppRole`
- `src/components/AppLayout.tsx` — itens do menu por role
- `src/routes/index.tsx` — redirect pós-login
- `src/routes/_authenticated/configuracoes.kanban.tsx` — filtrar abas por role
- `src/routes/_authenticated/corretores.tsx` — listar/gerenciar usuários, botão "Novo usuário"
- `src/routes/_authenticated/recrutamento.tsx` / `.kanban.tsx` / `.$id.tsx` — liberar para recrutador

## Detalhes técnicos

- **Enum sem rollback fácil**: `ALTER TYPE ADD VALUE` não pode ser revertido em transação — migration roda em statement separado.
- **`supabaseAdmin.auth.admin.createUser`** roda só na server function (service role). Nunca expor no cliente.
- **Trigger `handle_new_user`** precisa ler `NEW.raw_user_meta_data->>'role'` com fallback para `corretor`. Manter regra "primeiro usuário = admin" como segurança caso o metadata venha vazio.
- **Guarda de UI ≠ segurança**: o que protege de verdade é a RLS. UI guard é só UX.

## Ordem de execução

1. Migration: enum, policies, ajuste do trigger.
2. `src/lib/auth.tsx` (tipo).
3. `src/routes/index.tsx` (redirect).
4. `src/components/AppLayout.tsx` (menu por role).
5. `recrutamento.dashboard.tsx` (nova).
6. Guards nas rotas admin-only.
7. `configuracoes.kanban.tsx` (filtrar abas).
8. `users.functions.ts` + `CreateUserDialog.tsx` + ajuste em `corretores.tsx`.
9. Smoke test: admin cria recrutador → recrutador loga → vê só recrutamento → cria candidato → move etapa.

## Fora do escopo

- Convite por email (admin define senha provisória, recrutador troca depois pela tela de perfil — fase 2).
- Desativar/reativar usuário (pode entrar junto com `corretores.tsx` se preferir).
- Permissão granular por etapa do funil.
