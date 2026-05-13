import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, MessageCircle, ExternalLink } from "lucide-react";
import { LeadFormDialog } from "@/components/LeadFormDialog";
import { whatsappUrl, formatDate } from "@/lib/constants";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads")({
  component: LeadsPage,
});

function LeadsPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const [fBroker, setFBroker] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fCity, setFCity] = useState("");
  const [fSource, setFSource] = useState("all");
  const [fSearch, setFSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["leads-admin"],
    queryFn: async () => {
      const [leads, brokers, statuses] = await Promise.all([
        // Apenas leads manuais (não importados em massa)
        supabase.from("leads").select("*").is("import_batch_id", null).order("created_at", { ascending: false }),
        supabase.from("profiles").select("id,name"),
        supabase.from("kanban_statuses").select("id,name,color")
          .eq("active", true).eq("kanban_type", "general").order("position"),
      ]);
      return { leads: leads.data ?? [], brokers: brokers.data ?? [], statuses: statuses.data ?? [] };
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.leads.filter((l) => {
      if (fBroker !== "all" && l.assigned_to_user_id !== fBroker) return false;
      if (fStatus !== "all" && l.status_id !== fStatus) return false;
      if (fSource !== "all" && l.source !== fSource) return false;
      if (fCity && !(l.city ?? "").toLowerCase().includes(fCity.toLowerCase())) return false;
      if (fSearch && !(l.name ?? "").toLowerCase().includes(fSearch.toLowerCase()) && !(l.phone ?? "").includes(fSearch) && !(l.email ?? "").toLowerCase().includes(fSearch.toLowerCase())) return false;
      return true;
    });
  }, [data, fBroker, fStatus, fCity, fSource, fSearch]);

  const brokerName = (id: string | null) => data?.brokers.find((b) => b.id === id)?.name ?? "—";
  const status = (id: string | null) => data?.statuses.find((s) => s.id === id);

  async function del(id: string) {
    if (!confirm("Excluir este lead?")) return;
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Lead excluído"); qc.invalidateQueries({ queryKey: ["leads-admin"] }); }
  }

  if (role !== "admin") return <p>Acesso restrito.</p>;

  const sources = Array.from(new Set((data?.leads ?? []).map((l) => l.source).filter(Boolean))) as string[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} de {data?.leads.length ?? 0} leads manuais</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 size-4" /> Novo lead
        </Button>
      </div>

      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
          <Input placeholder="Buscar nome / telefone / e-mail" value={fSearch} onChange={(e) => setFSearch(e.target.value)} />
          <Select value={fBroker} onValueChange={setFBroker}>
            <SelectTrigger><SelectValue placeholder="Corretor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os corretores</SelectItem>
              {data?.brokers.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              {data?.statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Cidade" value={fCity} onChange={(e) => setFCity(e.target.value)} />
          <Select value={fSource} onValueChange={setFSource}>
            <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas origens</SelectItem>
              {sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fBatch} onValueChange={setFBatch}>
            <SelectTrigger><SelectValue placeholder="Lote" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os lotes</SelectItem>
              <SelectItem value="_none_">Sem lote</SelectItem>
              {data?.batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Contato</th>
                <th className="px-3 py-2">Cidade / Bairro</th>
                <th className="px-3 py-2">Interesse</th>
                <th className="px-3 py-2">Origem</th>
                <th className="px-3 py-2">Corretor</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Cadastro</th>
                <th className="px-3 py-2">Atualizado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">Carregando…</td></tr>}
              {!isLoading && filtered.map((l) => {
                const st = status(l.status_id);
                return (
                  <tr key={l.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">
                      <Link to="/leads/$id" params={{ id: l.id }} className="hover:text-primary">{l.name}</Link>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{l.phone ?? "—"}</div>
                      <div className="text-muted-foreground">{l.email ?? ""}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{l.city ?? "—"} {l.neighborhood ? `/ ${l.neighborhood}` : ""}</td>
                    <td className="px-3 py-2 text-xs capitalize">{l.interest_type ?? "—"}</td>
                    <td className="px-3 py-2 text-xs capitalize">{l.source ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{brokerName(l.assigned_to_user_id)}</td>
                    <td className="px-3 py-2">
                      {st ? <Badge style={{ backgroundColor: st.color, color: "white" }}>{st.name}</Badge> : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(l.created_at)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(l.updated_at)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {l.phone && (
                          <a href={whatsappUrl(l.phone)} target="_blank" rel="noreferrer" title="WhatsApp">
                            <Button size="icon" variant="ghost"><MessageCircle className="size-4" /></Button>
                          </a>
                        )}
                        <Link to="/leads/$id" params={{ id: l.id }}>
                          <Button size="icon" variant="ghost"><ExternalLink className="size-4" /></Button>
                        </Link>
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(l); setOpen(true); }}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => del(l.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">Nenhum lead encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <LeadFormDialog open={open} onOpenChange={setOpen} lead={editing} onSaved={() => qc.invalidateQueries({ queryKey: ["leads-admin"] })} />
    </div>
  );
}
