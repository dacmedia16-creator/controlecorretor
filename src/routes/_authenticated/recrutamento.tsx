import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trello, MessageCircle } from "lucide-react";
import { BrokerCandidateFormDialog } from "@/components/BrokerCandidateFormDialog";
import { whatsappUrl, labelOf, SOURCES, formatDate } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/recrutamento")({
  component: RecrutamentoPage,
});

function RecrutamentoPage() {
  const { role } = useAuth();
  const [search, setSearch] = useState("");
  const [openNew, setOpenNew] = useState(false);

  if (role !== "admin" && role !== "recrutador") return <p>Acesso restrito.</p>;

  const { data, isLoading } = useQuery({
    queryKey: ["broker-candidates"],
    queryFn: async () => {
      const [cands, statuses] = await Promise.all([
        supabase.from("broker_candidates").select("*").order("updated_at", { ascending: false }),
        supabase.from("kanban_statuses").select("id,name,color").eq("kanban_type", "broker_recruitment"),
      ]);
      return { candidates: cands.data ?? [], statuses: statuses.data ?? [] };
    },
  });

  if (isLoading || !data) return <div>Carregando…</div>;

  const term = search.trim().toLowerCase();
  const list = term
    ? data.candidates.filter((c) =>
        [c.name, c.email, c.phone, c.city, c.creci].some((v) => v?.toLowerCase().includes(term))
      )
    : data.candidates;
  const statusById = new Map(data.statuses.map((s) => [s.id, s]));

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

      <Card className="p-3">
        <Input placeholder="Buscar por nome, e-mail, telefone, cidade ou CRECI" value={search} onChange={(e) => setSearch(e.target.value)} />
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
              <th className="px-3 py-2">Atualizado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => {
              const st = c.status_id ? statusById.get(c.status_id) : null;
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
                  <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(c.updated_at)}</td>
                  <td className="px-3 py-2">
                    <Button asChild size="sm" variant="ghost"><Link to="/recrutamento/$id" params={{ id: c.id }}>Abrir</Link></Button>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Nenhum candidato cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <BrokerCandidateFormDialog open={openNew} onOpenChange={setOpenNew} />
    </div>
  );
}
