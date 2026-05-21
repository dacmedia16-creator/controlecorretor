import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trello, MessageCircle } from "lucide-react";
import { BrokerCandidateFormDialog } from "@/components/BrokerCandidateFormDialog";
import { whatsappUrl, labelOf, SOURCES, formatDate } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/recrutamento/")({
  component: RecrutamentoPage,
});

function RecrutamentoPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [search, setSearch] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [assignedFilter, setAssignedFilter] = useState<string>("all");

  if (role !== "admin" && role !== "recrutador") return <p>Acesso restrito.</p>;

  const { data, isLoading } = useQuery({
    queryKey: ["broker-candidates"],
    queryFn: async () => {
      const [cands, statuses, profiles] = await Promise.all([
        supabase.from("broker_candidates").select("*").order("updated_at", { ascending: false }),
        supabase.from("kanban_statuses").select("id,name,color").eq("kanban_type", "broker_recruitment"),
        supabase.from("profiles").select("id,name,email"),
      ]);
      return {
        candidates: cands.data ?? [],
        statuses: statuses.data ?? [],
        profiles: profiles.data ?? [],
      };
    },
  });

  if (isLoading || !data) return <div>Carregando…</div>;

  const term = search.trim().toLowerCase();
  const statusById = new Map(data.statuses.map((s) => [s.id, s]));
  const profileById = new Map(data.profiles.map((p) => [p.id, p]));

  let list = data.candidates;
  if (term) {
    list = list.filter((c) =>
      [c.name, c.email, c.phone, c.city, c.creci].some((v) => v?.toLowerCase().includes(term))
    );
  }
  if (isAdmin && assignedFilter !== "all") {
    list = list.filter((c) =>
      assignedFilter === "__none" ? !c.assigned_to_user_id : c.assigned_to_user_id === assignedFilter
    );
  }

  // Set of users that already appear as responsible (used to populate filter)
  const assignedOptions = Array.from(
    new Set(data.candidates.map((c) => c.assigned_to_user_id).filter(Boolean) as string[])
  )
    .map((id) => profileById.get(id))
    .filter(Boolean) as { id: string; name: string; email: string }[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Recrutamento de Corretores</h1>
          <p className="text-sm text-muted-foreground">Candidatos a entrar na equipe.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/recrutamento/kanban"><Trello className="mr-1 size-4" />Kanban</Link>
          </Button>
          <Button onClick={() => setOpenNew(true)}><Plus className="mr-1 size-4" />Novo candidato</Button>
        </div>
      </div>

      <Card className="p-3 flex flex-wrap gap-3">
        <Input
          className="flex-1 min-w-[240px]"
          placeholder="Buscar por nome, e-mail, telefone, cidade ou CRECI"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {isAdmin && (
          <Select value={assignedFilter} onValueChange={setAssignedFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os responsáveis</SelectItem>
              <SelectItem value="__none">Sem responsável</SelectItem>
              {assignedOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name || p.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Contato</th>
              <th className="px-3 py-2">Cidade</th>
              <th className="px-3 py-2">CRECI</th>
              <th className="px-3 py-2">Origem</th>
              <th className="px-3 py-2">Etapa</th>
              <th className="px-3 py-2">Responsável</th>
              <th className="px-3 py-2">Atualizado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => {
              const st = c.status_id ? statusById.get(c.status_id) : null;
              const resp = c.assigned_to_user_id ? profileById.get(c.assigned_to_user_id) : null;
              return (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2">
                    <Link to="/recrutamento/$id" params={{ id: c.id }} className="font-medium text-primary hover:underline">{c.name}</Link>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div>{c.email ?? "—"}</div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      {c.phone ?? "—"}
                      {c.phone && (
                        <a href={whatsappUrl(c.phone)} target="_blank" rel="noreferrer" className="text-emerald-600"><MessageCircle className="size-3" /></a>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">{c.city ?? "—"}</td>
                  <td className="px-3 py-2">{c.creci ?? "—"}</td>
                  <td className="px-3 py-2">{labelOf(SOURCES, c.source)}</td>
                  <td className="px-3 py-2">
                    {st ? <Badge style={{ backgroundColor: st.color, color: "white" }}>{st.name}</Badge> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {resp ? (resp.name || resp.email) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(c.updated_at)}</td>
                  <td className="px-3 py-2">
                    <Button asChild size="sm" variant="ghost"><Link to="/recrutamento/$id" params={{ id: c.id }}>Abrir</Link></Button>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Nenhum candidato cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <BrokerCandidateFormDialog open={openNew} onOpenChange={setOpenNew} />
    </div>
  );
}
