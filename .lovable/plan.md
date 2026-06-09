## Causa raiz

O drag-and-drop da `/agenda` chama `UPDATE` em `broker_candidate_interactions` / `lead_interactions` e mostra **"Sem permissão para alterar este compromisso"** quando o `UPDATE` retorna 0 linhas — que é exatamente o que acontece hoje para qualquer usuário que **não é o autor original da interação**.

Hoje as policies de UPDATE são:

- `broker_candidate_interactions`: só `admin`, `gerente_recrutamento` ou o **owner** (`user_id = auth.uid()`). Recrutador comum não consegue reagendar entrevista que outro recrutador criou — mesmo que o candidato esteja atribuído a ele.
- `lead_interactions`: só `admin` ou o **owner**. Corretor que recebeu o lead não consegue reagendar follow-up criado por outro.

As policies de SELECT/INSERT já liberam acesso baseado em "candidato/lead atribuído ou criado pelo usuário" — falta espelhar isso no UPDATE.

## Mudança (migração SQL apenas, sem mexer em código)

Adicionar duas policies novas, espelhando a lógica das policies de INSERT existentes:

### 1. `broker_candidate_interactions` — recrutador pode UPDATE se o candidato é dele

```sql
CREATE POLICY "broker_interactions recruiter update"
ON public.broker_candidate_interactions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.broker_candidates c
    WHERE c.id = broker_candidate_interactions.candidate_id
      AND (c.assigned_to_user_id = auth.uid() OR c.created_by_user_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.broker_candidates c
    WHERE c.id = broker_candidate_interactions.candidate_id
      AND (c.assigned_to_user_id = auth.uid() OR c.created_by_user_id = auth.uid())
  )
);
```

### 2. `lead_interactions` — corretor pode UPDATE se o lead é dele

```sql
CREATE POLICY "interactions broker update"
ON public.lead_interactions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_interactions.lead_id
      AND (l.assigned_to_user_id = auth.uid() OR l.created_by_user_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_interactions.lead_id
      AND (l.assigned_to_user_id = auth.uid() OR l.created_by_user_id = auth.uid())
  )
);
```

## Resultado

- Drag-and-drop na agenda volta a funcionar para recrutador/corretor reagendar compromissos de candidatos/leads que estão atribuídos a eles.
- O popover de edição (mesma rota de UPDATE) também passa a funcionar.
- Mantém o isolamento: você não consegue mexer em interação de candidato/lead que não é seu.

## Fora do escopo

- Não muda nada no front-end da `/agenda`.
- Não muda policies de DELETE (continua só admin/owner — exclusão segue restrita).
- Não muda Google Calendar nem outras telas.
