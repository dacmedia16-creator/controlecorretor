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
import { ArrowLeft, MessageCircle, Shuffle, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/constants";
import { formatPhoneDisplay, whatsappLink } from "@/lib/phone";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  applyAssignments,
  fetchBatchUnassignedCount,
  fetchBatchUnassignedIds,
} from "@/lib/bulk-leads";

export const Route = createFileRoute("/_authenticated/leads-em-massa/$batchId")({
  component: BatchDetailPage,
});

const PAGE_SIZE = 200;
const CONFIRM_THRESHOLD = 50;

type LeadRow = {
  id: string; name: string; phone: string | null;
  status_id: string | null; assigned_to_user_id: string | null;
};

function BatchDetailPage() {
  const { batchId } = Route.useParams();
  const { role } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chosenBroker, setChosenBroker] = useState<string>("");
  const [perBroker, setPerBroker] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirm, setConfirm] = useState<null | {
    title: string; description: string; action: () => Promise<void>;
  }>(null);

  if (role !== "admin") return <p className="text-muted-foreground">Acesso restrito ao administrador.</p>;

  const { data: meta, isLoading } = useQuery({
    queryKey: ["batch-meta", batchId],
    queryFn: async () => {
      const [b, brokers, statuses, total] = await Promise.all([
        supabase.from("lead_import_batches").select("*").eq("id", batchId).maybeSingle(),
        supabase.from("profiles").select("id,name,active").eq("active", true).order("name"),
        supabase.from("kanban_statuses").select("id,name,color").order("position"),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("import_batch_id", batchId),
      ]);
      return {
        batch: b.data,
        brokers: brokers.data ?? [],
        statuses: statuses.data ?? [],
        total: total.count ?? 0,
      };
    },
  });

  const { data: unassignedCount, refetch: refetchUnassigned } = useQuery({
    queryKey: ["batch-unassigned", batchId],
    queryFn: () => fetchBatchUnassignedCount(batchId),
  });

  const { data: leads, isFetching, refetch: refetchLeads } = useQuery({
    queryKey: ["batch-leads-page", batchId, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data } = await supabase
        .from("leads")
        .select("id,name,phone,status_id,assigned_to_user_id")
        .eq("import_batch_id", batchId)
        .order("created_at")
        .range(from, to);
      return (data ?? []) as LeadRow[];
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Carregando…</p>;
  if (!meta?.batch) return <p>Lote não encontrado.</p>;

  const brokerName = (id: string | null) => meta.brokers.find((b) => b.id === id)?.name ?? "—";
  const status = (id: string | null) => meta.statuses.find((s) => s.id === id);
  const totalPages = Math.max(1, Math.ceil(meta.total / PAGE_SIZE));

  function toggleAll(checked: boolean) {
    const n = new Set(selected);
    (leads ?? []).forEach((l) => (checked ? n.add(l.id) : n.delete(l.id)));
    setSelected(n);
  }
  function toggleOne(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  }

  async function runDistribution(label: string, plan: () => Promise<{ assignments: { id: string; userId: string }[]; preview: number }>) {
    setRunning(true);
    setProgress(null);
    try {
      const { assignments } = await plan();
      if (assignments.length === 0) {
        toast.error("Nada para atribuir");
        return;
      }
      setProgress({ done: 0, total: assignments.length });
      await applyAssignments(assignments, {
        onProgress: (done, total) => setProgress({ done, total }),
      });
      toast.success(`${label}: ${assignments.length} leads atribuídos`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["leads-admin"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      refetchUnassigned();
      refetchLeads();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao distribuir");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  async function planAllUnassigned(): Promise<{ assignments: { id: string; userId: string }[]; preview: number }> {
    const ids = await fetchBatchUnassignedIds(batchId, 100000);
    if (chosenBroker === "_even_") {
      const brokers = meta?.brokers ?? [];
      if (brokers.length === 0) throw new Error("Nenhum corretor ativo");
      return {
        assignments: ids.map((id, i) => ({ id, userId: brokers[i % brokers.length].id })),
        preview: ids.length,
      };
    }
    return { assignments: ids.map((id) => ({ id, userId: chosenBroker })), preview: ids.length };
  }

  function planSelected(): { assignments: { id: string; userId: string }[]; preview: number } {
    const ids = Array.from(selected);
    if (chosenBroker === "_even_") {
      const brokers = meta?.brokers ?? [];
      return {
        assignments: ids.map((id, i) => ({ id, userId: brokers[i % brokers.length].id })),
        preview: ids.length,
      };
    }
    return { assignments: ids.map((id) => ({ id, userId: chosenBroker })), preview: ids.length };
  }

  async function planEven(): Promise<{ assignments: { id: string; userId: string }[]; preview: number }> {
    const ids = await fetchBatchUnassignedIds(batchId, 100000);
    const brokers = meta?.brokers ?? [];
    if (brokers.length === 0) throw new Error("Nenhum corretor ativo");
    return {
      assignments: ids.map((id, i) => ({ id, userId: brokers[i % brokers.length].id })),
      preview: ids.length,
    };
  }

  async function planFixed(): Promise<{ assignments: { id: string; userId: string }[]; preview: number }> {
    const n = parseInt(perBroker, 10);
    if (isNaN(n) || n <= 0) throw new Error("Quantidade inválida");
    const brokers = meta?.brokers ?? [];
    if (brokers.length === 0) throw new Error("Nenhum corretor ativo");
    const ids = await fetchBatchUnassignedIds(batchId, brokers.length * n);
    const out: { id: string; userId: string }[] = [];
    let cursor = 0;
    for (const broker of brokers) {
      for (let k = 0; k < n && cursor < ids.length; k++, cursor++) {
        out.push({ id: ids[cursor], userId: broker.id });
      }
    }
    return { assignments: out, preview: out.length };
  }

  function distribute(mode: "all_unassigned" | "selected" | "even" | "fixed") {
    if (!meta) return;
    const brokers = meta.brokers;
    if (brokers.length === 0) return toast.error("Nenhum corretor ativo");

    if ((mode === "all_unassigned" || mode === "selected") && !chosenBroker) {
      return toast.error("Escolha um corretor (ou Distribuir igualmente)");
    }
    if (mode === "selected" && selected.size === 0) {
      return toast.error("Nenhum lead selecionado");
    }

    let label = "";
    let preview = 0;
    let plan: () => Promise<{ assignments: { id: string; userId: string }[]; preview: number }>;
    if (mode === "all_unassigned") {
      label = "Todos sem responsável";
      preview = unassignedCount ?? 0;
      plan = planAllUnassigned;
    } else if (mode === "selected") {
      label = "Selecionados";
      preview = selected.size;
      plan = async () => planSelected();
    } else if (mode === "even") {
      label = "Distribuição igualitária";
      preview = unassignedCount ?? 0;
      plan = planEven;
    } else {
      const n = parseInt(perBroker, 10) || 0;
      label = `${n} por corretor`;
      preview = Math.min(unassignedCount ?? 0, brokers.length * n);
      plan = planFixed;
    }

    if (preview === 0) return toast.error("Nada a distribuir");

    const action = () => runDistribution(label, plan);
    if (preview >= CONFIRM_THRESHOLD) {
      setConfirm({
        title: "Confirmar distribuição",
        description: `Você está prestes a atribuir cerca de ${preview} leads. Continuar?`,
        action: async () => { setConfirm(null); await action(); },
      });
    } else {
      void action();
    }
  }

  const stats = useMemo(() => {
    const assigned = meta.total - (unassignedCount ?? 0);
    return { total: meta.total, assigned, unassigned: unassignedCount ?? 0 };
  }, [meta, unassignedCount]);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/leads-em-massa" className="mb-1 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Voltar para Leads em Massa
        </Link>
        <h1 className="text-2xl font-bold">{meta.batch.name}</h1>
        <p className="text-sm text-muted-foreground">Importado em {formatDate(meta.batch.created_at)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Linhas" value={meta.batch.total_rows} />
        <Stat label="Importados" value={meta.batch.imported_count} />
        <Stat label="Inválidos" value={meta.batch.invalid_count} />
        <Stat label="Duplicados" value={meta.batch.duplicate_count} />
        <Stat label="Sem responsável" value={stats.unassigned} />
      </div>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Distribuir leads</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Corretor para selecionados / sem responsável</label>
            <Select value={chosenBroker} onValueChange={setChosenBroker}>
              <SelectTrigger><SelectValue placeholder="Escolher corretor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_even_">Distribuir igualmente entre todos</SelectItem>
                {meta.brokers.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={running} onClick={() => distribute("all_unassigned")}>
                <UserPlus className="mr-2 size-4" /> Todos sem responsável
              </Button>
              <Button size="sm" variant="outline" disabled={running || selected.size === 0} onClick={() => distribute("selected")}>
                <UserPlus className="mr-2 size-4" /> Selecionados ({selected.size})
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Distribuição igualitária</label>
            <Button onClick={() => distribute("even")} className="w-full" disabled={running}>
              <Shuffle className="mr-2 size-4" /> Dividir igualmente entre corretores
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Quantidade por corretor</label>
            <div className="flex gap-2">
              <Input type="number" min={1} max={5000} placeholder="Ex.: 50" value={perBroker} onChange={(e) => setPerBroker(e.target.value)} />
              <Button onClick={() => distribute("fixed")} disabled={running}>Distribuir</Button>
            </div>
          </div>
        </div>
        {progress && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Atribuindo {progress.done} / {progress.total}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={(leads ?? []).length > 0 && (leads ?? []).every((l) => selected.has(l.id))}
              onCheckedChange={(c) => toggleAll(!!c)}
            />
            <span className="text-sm">{selected.size} selecionado(s)</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {stats.total.toLocaleString("pt-BR")} leads no lote
          </span>
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
              {isFetching && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-4 animate-spin" />
                </td></tr>
              )}
              {!isFetching && (leads ?? []).map((l) => {
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
              {!isFetching && (leads ?? []).length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum lead nesta página</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t p-3 text-sm">
          <span className="text-muted-foreground">Página {page + 1} de {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        confirmLabel="Confirmar"
        loading={running}
        onConfirm={() => confirm?.action()}
      />
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
