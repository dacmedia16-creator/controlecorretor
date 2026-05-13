import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, MessageCircle, Shuffle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/constants";
import { formatPhoneDisplay, whatsappLink } from "@/lib/phone";

export const Route = createFileRoute("/_authenticated/leads-em-massa/$batchId")({
  component: BatchDetailPage,
});

function BatchDetailPage() {
  const { batchId } = Route.useParams();
  const { role } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chosenBroker, setChosenBroker] = useState<string>("");
  const [perBroker, setPerBroker] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["batch-detail", batchId],
    queryFn: async () => {
      const [b, leads, brokers, statuses] = await Promise.all([
        supabase.from("lead_import_batches").select("*").eq("id", batchId).maybeSingle(),
        supabase.from("leads").select("*").eq("import_batch_id", batchId).order("created_at"),
        supabase.from("profiles").select("id,name,active").eq("active", true),
        supabase.from("kanban_statuses").select("id,name,color").order("position"),
      ]);
      return {
        batch: b.data,
        leads: leads.data ?? [],
        brokers: brokers.data ?? [],
        statuses: statuses.data ?? [],
      };
    },
  });

  if (role !== "admin") return <p className="text-muted-foreground">Acesso restrito ao administrador.</p>;
  if (isLoading) return <p>Carregando…</p>;
  if (!data?.batch) return <p>Lote não encontrado.</p>;

  const brokerName = (id: string | null) => data.brokers.find((b) => b.id === id)?.name ?? "—";
  const status = (id: string | null) => data.statuses.find((s) => s.id === id);

  function toggleAll(checked: boolean) {
    if (!data) return;
    if (checked) setSelected(new Set(data.leads.map((l) => l.id)));
    else setSelected(new Set());
  }
  function toggleOne(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  }

  async function applyAssignments(assignments: { id: string; userId: string }[]) {
    if (assignments.length === 0) return;
    // Agrupa por userId pra reduzir round-trips
    const byUser = new Map<string, string[]>();
    assignments.forEach((a) => {
      const arr = byUser.get(a.userId) ?? [];
      arr.push(a.id);
      byUser.set(a.userId, arr);
    });
    for (const [userId, ids] of byUser) {
      const { error } = await supabase.from("leads").update({ assigned_to_user_id: userId }).in("id", ids);
      if (error) throw error;
    }
  }

  async function distribute(mode: "all_unassigned" | "selected" | "even" | "fixed") {
    if (!data) return;
    try {
      const activeBrokers = data.brokers;
      if (activeBrokers.length === 0) {
        toast.error("Nenhum corretor ativo");
        return;
      }
      let target: typeof data.leads = [];

      if (mode === "all_unassigned") target = data.leads.filter((l) => !l.assigned_to_user_id);
      if (mode === "selected") target = data.leads.filter((l) => selected.has(l.id));

      if (mode === "all_unassigned" || mode === "selected") {
        if (!chosenBroker) {
          toast.error("Escolha um corretor");
          return;
        }
        if (chosenBroker === "_even_") {
          // distribui igualmente
          const assignments = target.map((l, i) => ({ id: l.id, userId: activeBrokers[i % activeBrokers.length].id }));
          await applyAssignments(assignments);
        } else {
          await applyAssignments(target.map((l) => ({ id: l.id, userId: chosenBroker })));
        }
      }

      if (mode === "even") {
        const unassigned = data.leads.filter((l) => !l.assigned_to_user_id);
        const assignments = unassigned.map((l, i) => ({ id: l.id, userId: activeBrokers[i % activeBrokers.length].id }));
        await applyAssignments(assignments);
      }

      if (mode === "fixed") {
        const n = parseInt(perBroker, 10);
        if (isNaN(n) || n <= 0) {
          toast.error("Informe uma quantidade válida");
          return;
        }
        const unassigned = data.leads.filter((l) => !l.assigned_to_user_id);
        const assignments: { id: string; userId: string }[] = [];
        let idx = 0;
        for (const broker of activeBrokers) {
          for (let k = 0; k < n && idx < unassigned.length; k++, idx++) {
            assignments.push({ id: unassigned[idx].id, userId: broker.id });
          }
        }
        await applyAssignments(assignments);
      }

      toast.success("Distribuição concluída");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["batch-detail", batchId] });
      qc.invalidateQueries({ queryKey: ["leads-admin"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao distribuir");
    }
  }

  const stats = useMemo(() => {
    const assigned = data.leads.filter((l) => l.assigned_to_user_id).length;
    return { total: data.leads.length, assigned, unassigned: data.leads.length - assigned };
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/leads-em-massa" className="mb-1 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Voltar para Leads em Massa
          </Link>
          <h1 className="text-2xl font-bold">{data.batch.name}</h1>
          <p className="text-sm text-muted-foreground">Importado em {formatDate(data.batch.created_at)}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Linhas" value={data.batch.total_rows} />
        <Stat label="Importados" value={data.batch.imported_count} />
        <Stat label="Inválidos" value={data.batch.invalid_count} />
        <Stat label="Duplicados" value={data.batch.duplicate_count} />
        <Stat label="Sem responsável" value={stats.unassigned} />
      </div>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Distribuir leads</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Corretor para os selecionados / sem responsável</label>
            <Select value={chosenBroker} onValueChange={setChosenBroker}>
              <SelectTrigger><SelectValue placeholder="Escolher corretor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_even_">Distribuir igualmente entre todos</SelectItem>
                {data.brokers.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => distribute("all_unassigned")}>
                <UserPlus className="mr-2 size-4" /> Todos sem responsável
              </Button>
              <Button size="sm" variant="outline" onClick={() => distribute("selected")} disabled={selected.size === 0}>
                <UserPlus className="mr-2 size-4" /> Selecionados ({selected.size})
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Distribuição igualitária</label>
            <Button onClick={() => distribute("even")} className="w-full">
              <Shuffle className="mr-2 size-4" /> Dividir igualmente entre corretores ativos
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Quantidade por corretor</label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                placeholder="Ex.: 50"
                value={perBroker}
                onChange={(e) => setPerBroker(e.target.value)}
              />
              <Button onClick={() => distribute("fixed")}>Distribuir</Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selected.size > 0 && selected.size === data.leads.length}
              onCheckedChange={(c) => toggleAll(!!c)}
            />
            <span className="text-sm">{selected.size} selecionado(s)</span>
          </div>
          <span className="text-sm text-muted-foreground">{stats.total} leads neste lote</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 w-10"></th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Telefone</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Corretor</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.leads.map((l) => {
                const st = status(l.status_id);
                return (
                  <tr key={l.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggleOne(l.id)} />
                    </td>
                    <td className="px-3 py-2 font-medium">
                      <Link to="/leads/$id" params={{ id: l.id }} className="hover:text-primary">{l.name}</Link>
                    </td>
                    <td className="px-3 py-2">{l.phone ? formatPhoneDisplay(l.phone) : "—"}</td>
                    <td className="px-3 py-2">
                      {st ? <Badge style={{ backgroundColor: st.color, color: "white" }}>{st.name}</Badge> : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">{brokerName(l.assigned_to_user_id)}</td>
                    <td className="px-3 py-2">
                      {l.phone && (
                        <a href={whatsappLink(l.phone)} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline">
                            <MessageCircle className="mr-2 size-4" /> WhatsApp
                          </Button>
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
              {data.leads.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum lead neste lote</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </Card>
  );
}
