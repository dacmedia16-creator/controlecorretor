# Novo papel: Gerente de Recrutamento

## O que esse usuário pode fazer
- **Cadastrar novos recrutadores** (mesma tela usada hoje pelo admin em `/corretores`, aba Recrutadores).
- **Ver todos os candidatos/contatos de todos os recrutadores** (módulo Recrutamento — lista, kanban, dashboard, detalhe do candidato e histórico de interações).
- **NÃO** acessa Leads, Captação, Importações nem cadastros administrativos. Não cria admins nem corretores.

## Banco de dados (1 migração)

1. Adicionar valor `gerente_recrutamento` ao enum `public.app_role`.
2. Atualizar `public.handle_new_user()` para aceitar `gerente_recrutamento` em `raw_user_meta_data.role` (hoje só aceita admin/corretor/recrutador).
3. Criar função helper `is_recruitment_manager(uuid)` (security definer) — atalho para `has_role(_user_id, 'gerente_recrutamento')`.
4. Estender RLS para o gerente conseguir **ver tudo** do recrutamento, mas só editar o que faria sentido:
   - `broker_candidates`: nova policy SELECT/UPDATE para quem é `gerente_recrutamento` (todos os registros).
   - `broker_candidate_interactions`: nova policy SELECT/INSERT para o gerente (todos).
   - `kanban_statuses` (tipo `broker_recruitment`): nova policy SELECT (já é público para autenticados — confirmar). Edição continua só admin/recrutador.
   - `profiles` + `user_roles`: SELECT já é liberado para autenticados; adicionar policy INSERT em `user_roles` **só** para criar role `recrutador` quando quem chama é `gerente_recrutamento` (na prática o trigger `handle_new_user` cria isso, então basta liberar via trigger — não precisa policy extra).

## Código (frontend)

1. **`src/lib/auth.tsx`** — adicionar `"gerente_recrutamento"` ao type `AppRole`.
2. **`src/components/AppLayout.tsx`** — incluir o novo papel em:
   - `/recrutamento` (lista)
   - `/recrutamento/kanban`
   - `/recrutamento/dashboard`
   - novo item de menu "Recrutadores" → `/corretores` (filtrado, só aba recrutadores) **ou** abrir uma versão simplificada da tela.
3. **`src/routes/_authenticated/corretores.tsx`**:
   - Permitir acesso para `admin` **ou** `gerente_recrutamento`.
   - Se for gerente: esconder aba "Corretores", deixar apenas "Recrutadores"; no formulário de novo usuário, fixar `role = recrutador` (sem o select).
4. **`src/routes/login.tsx`** — redirecionar gerente para `/recrutamento` após login (mesmo destino do recrutador).
5. **`src/routes/_authenticated/recrutamento.index.tsx`**, **`recrutamento.kanban.tsx`**, **`recrutamento.dashboard.tsx`**, **`recrutamento.$id.tsx`** — onde houver filtro do tipo "só meus candidatos" no client, garantir que o gerente vê todos (a RLS já libera; verificar se existe filtro `assigned_to_user_id === user.id` no front e remover para o gerente).
6. **`src/routes/index.tsx`** — landing por role: gerente cai em `/recrutamento`.

## Observações
- Senha provisória do recrutador segue o mesmo fluxo atual (signUp com e-mail de confirmação).
- Não vou tocar nas regras dos módulos de Leads/Captação — o gerente fica sem acesso a eles, como pedido.
- Quero confirmar 1 ponto antes de implementar (próxima resposta) — me responde rapidinho:

**Cadastro do primeiro gerente:** quem cria? Opções:
  - (a) Só o **admin** cria gerentes (e gerentes criam recrutadores). Mais seguro.
  - (b) Gerente também pode criar outros gerentes.