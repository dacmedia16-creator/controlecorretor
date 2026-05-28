## Causa raiz

No `EventPopover.save()` em `src/routes/_authenticated/agenda.tsx` chamamos:

```ts
supabase.from(table).update({ next_follow_up_date: newIso }).eq("id", rowId)
```

Mas as policies RLS atuais dessas tabelas **não cobrem UPDATE** para recrutador / corretor / gerente:

- `broker_candidate_interactions`: tem `admin all`, `recruiter select/insert`, `gerente select/insert`, `owner delete`, `gerente delete` — **nenhuma para UPDATE**.
- `lead_interactions`: tem `admin all`, `broker select/insert`, `owner delete` — **nenhuma para UPDATE**.

Sem policy de UPDATE, o Postgres não retorna erro: simplesmente filtra 0 linhas. Por isso o `update` "funciona" mas a data não muda. Depois do `invalidateQueries`, a agenda recarrega com o valor antigo.

Admins não veem o problema porque o `... admin all` cobre UPDATE.

## Correção

Migration adicionando policies de UPDATE para o dono da interação (coerente com o que já fizemos para DELETE):

```sql
-- broker_candidate_interactions
CREATE POLICY "broker_interactions owner update"
ON public.broker_candidate_interactions
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "broker_interactions gerente update"
ON public.broker_candidate_interactions
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gerente_recrutamento'))
WITH CHECK (public.has_role(auth.uid(), 'gerente_recrutamento'));

-- lead_interactions
CREATE POLICY "interactions owner update"
ON public.lead_interactions
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

## Robustez no cliente (mesma edit)

Em `src/routes/_authenticated/agenda.tsx`, fazer o `update` retornar a linha alterada e tratar "0 linhas" como erro explícito, para não engolir silenciosamente esse tipo de problema no futuro:

```ts
const { data: updated, error } = await supabase
  .from(table)
  .update({ next_follow_up_date: newIso })
  .eq("id", rowId)
  .select("id");

if (error) { toast.error(error.message); return; }
if (!updated || updated.length === 0) {
  toast.error("Sem permissão para alterar este compromisso.");
  return;
}
```

## Fora do escopo

- Permitir que qualquer usuário (não dono e não gerente) edite interações alheias.
- Mudar lógica de Google Calendar (que já funciona quando a interação está no escopo do usuário).
