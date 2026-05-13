import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Shuffle, History, Users, CheckCircle2, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/constants";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  applyAssignments,
  fetchBatchUnassignedCount,
  fetchBatchUnassignedIds,
  fetchBrokerLeadCounts,
  fetchBulkAssignedStatusId,
} from "@/lib/bulk-leads";

export const Route = createFileRoute("/_authenticated/distribuicao")({
  component: QuickDistributionPage,
});

const PAGE_SIZE = 100;
const CONFIRM_THRESHOLD = 50;
type Broker = { id: string; name: string };
type LeadRow = { id: string; name: string; phone: string | null };

function QuickDistributionPage() {
  const { role, user } = useAuth();
  const qc = useQueryClient();

  const [batchId, setBatchId] = useState<string>("");
  const [selectedBrokers, setSelectedBrokers] = useState<Set<string>>(new Set());
  const [perBroker, setPerBroker] = useState<string>("");

  const [manualSelected, setManualSelected] = useState<Set<string>>(new Set());
  const [manualBroker, setManualBroker] = useState<string>("");
  const [manualPage, setManualPage] = useState(0);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<null | "quick" | "manual">(null);
  const [lastResult, setLastResult] = useState<{
    total: number;
    perBroker: Array<{ id: string; name: string; count: number }>;
    remainingUnassigned: number;
  } | null>(null);

  if (role !== "admin") return <p className="text-muted-foreground">Acesso restrito ao administrador.</p>;

  const { data: meta, isLoading: metaLoading } = useQuery({
    queryKey: ["distrib-meta"],
    queryFn: async () => {
      const [b, p] = await Promise.all([
        supabase
          .from("lead_import_batches")
          .select("id,name,created_at,imported_count")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("profiles").select("id,name,active").eq("active", true).order("name"),
      ]);
      return { batches: b.data ?? [], brokers: (p.data ?? []) as Broker[] };
    },
  });

  const { data: brokerCounts, refetch: refetchCounts } = useQuery({
    queryKey: ["distrib-broker-counts"],
    queryFn: fetchBrokerLeadCounts,
  });

  const { data: unassignedCount, refetch: refetchUnassigned } = useQuery({
    queryKey: ["distrib-unassigned-count", batchId],
    enabled: !!batchId,
    queryFn: () => fetchBatchUnassignedCount(batchId),
  });

  const { data: batchTotal } = useQuery({
    queryKey: ["distrib-batch-total", batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("import_batch_id", batchId);
      return count ?? 0;
    },
  });

  const { data: manualLeads, isFetching: manualFetching, refetch: refetchManual } = useQuery({
    queryKey: ["distrib-manual-page", batchId, manualPage],
    enabled: !!batchId,
    queryFn: async () => {
      const from = manualPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data } = await supabase
        .from("leads")
        .select("id,name,phone")
        .eq("import_batch_id", batchId)
        .is("assigned_to_user_id", null)
        .order("created_at")
        .range(from, to);
      return (data ?? []) as LeadRow[];
    },
  });

  const { data: history } = useQuery({
    queryKey: ["distrib-history"],
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_distributions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!batchId && meta?.batches && meta.batches.length > 0) {
      setBatchId(meta.batches[0].id);
    }
  }, [meta, batchId]);

  function toggleBroker(id: string) {
    const n = new Set(selectedBrokers);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelectedBrokers(n);
  }
  function toggleManual(id: string) {
    const n = new Set(manualSelected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setManualSelected(n);
  }

  const perBrokerNum = parseInt(perBroker, 10) || 0;
  const totalPlanned = Math.min(unassignedCount ?? 0, selectedBrokers.size * perBrokerNum);

  async function logDistribution(stats: Array<{ id: string; name: string; count: number }>, total: number) {
    if (!user || total === 0) return;
    await supabase.from("lead_distributions").insert({
      batch_id: batchId || null,
      admin_id: user.id,
      total_distributed: total,
      details: stats,
    });
  }

  async function executeQuick() {
    setConfirmOpen(null);
    if (!batchId || selectedBrokers.size === 0 || perBrokerNum <= 0) return;
    setRunning(true);
    setProgress({ done: 0, total: totalPlanned });
    try {
      const brokers = (meta?.brokers ?? []).filter((b) => selectedBrokers.has(b.id));
      const need = brokers.length * perBrokerNum;
      const ids = await fetchBatchUnassignedIds(batchId, need);
      if (ids.length === 0) {
        toast.error("Não há leads sem responsável neste lote");
        return;
      }
      const stats: Array<{ id: string; name: string; count: number }> = [];
      const assignments: { id: string; userId: string }[] = [];
      let cursor = 0;
      for (const broker of brokers) {
        const slice = ids.slice(cursor, cursor + perBrokerNum);
        cursor += slice.length;
        slice.forEach((id) => assignments.push({ id, userId: broker.id }));
        stats.push({ id: broker.id, name: broker.name, count: slice.length });
        if (cursor >= ids.length) break;
      }

      const total = assignments.length;
      setProgress({ done: 0, total });
      const distributedStatusId = await fetchBulkAssignedStatusId();
      await applyAssignments(assignments, {
        statusId: distributedStatusId,
        onProgress: (done, t) => setProgress({ done, total: t }),
      });
      await logDistribution(stats.filter((s) => s.count > 0), total);

      const remaining = (unassignedCount ?? 0) - total;
      setLastResult({
        total,
        perBroker: stats.filter((s) => s.count > 0),
        remainingUnassigned: Math.max(0, remaining),
      });
      toast.success(`${total} leads distribuídos com sucesso`);
      qc.invalidateQueries({ queryKey: ["distrib-history"] });
      qc.invalidateQueries({ queryKey: ["leads-admin"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      refetchUnassigned();
      refetchCounts();
      refetchManual();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao distribuir leads");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  async function executeManual() {
    setConfirmOpen(null);
    if (!manualBroker || manualSelected.size === 0) return;
    setRunning(true);
    const ids = Array.from(manualSelected);
    setProgress({ done: 0, total: ids.length });
    try {
      const broker = meta?.brokers.find((b) => b.id === manualBroker);
      const distributedStatusId = await fetchBulkAssignedStatusId();
      await applyAssignments(
        ids.map((id) => ({ id, userId: manualBroker })),
        { statusId: distributedStatusId, onProgress: (done, total) => setProgress({ done, total }) },
      );
      await logDistribution([{ id: manualBroker, name: broker?.name ?? "—", count: ids.length }], ids.length);
      setLastResult({
        total: ids.length,
        perBroker: [{ id: manualBroker, name: broker?.name ?? "—", count: ids.length }],
        remainingUnassigned: Math.max(0, (unassignedCount ?? 0) - ids.length),
      });
      toast.success(`${ids.length} leads atribuídos a ${broker?.name}`);
      setManualSelected(new Set());
      qc.invalidateQueries({ queryKey: ["distrib-history"] });
      qc.invalidateQueries({ queryKey: ["leads-admin"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      refetchUnassigned();
      refetchCounts();
      refetchManual();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao atribuir");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  function handleQuickClick() {
    if (!batchId) return toast.error("Escolha um lote");
    if (selectedBrokers.size === 0) return toast.error("Selecione ao menos um corretor");
    if (perBrokerNum <= 0) return toast.error("Informe a quantidade por corretor");
    if (totalPlanned === 0) return toast.error("Não há leads sem responsável neste lote");
    if (totalPlanned >= CONFIRM_THRESHOLD) setConfirmOpen("quick");
    else void executeQuick();
  }

  function handleManualClick() {
    if (!manualBroker) return toast.error("Escolha o corretor");
    if (manualSelected.size === 0) return toast.error("Selecione ao menos um lead");
    if (manualSelected.size >= CONFIRM_THRESHOLD) setConfirmOpen("manual");
    else void executeManual();
  }

  const adminName = (id: string) => meta?.brokers.find((b) => b.id === id)?.name ?? id.slice(0, 8);
  const totalManualPages = Math.max(1, Math.ceil((unassignedCount ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Distribuição Rápida</h1>
        <p className="text-sm text-muted-foreground">
          Distribua leads importados de forma equilibrada entre os corretores.
        </p>
      </div>

      {metaLoading && <p className="text-sm text-muted-foreground">Carregando dados…</p>}

      <Tabs defaultValue="quick">
        <TabsList>
          <TabsTrigger value="quick"><Shuffle className="mr-2 size-4" />Distribuir</TabsTrigger>
          <TabsTrigger value="manual"><UserPlus className="mr-2 size-4" />Manual</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-2 size-4" />Histórico</TabsTrigger>
        </TabsList>

        {/* QUICK */}
        <TabsContent value="quick" className="space-y-4">
          <Card className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium">Lote de importação</label>
                <Select value={batchId} onValueChange={(v) => { setBatchId(v); setLastResult(null); setManualPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="Escolher lote" /></SelectTrigger>
                  <SelectContent>
                    {(meta?.batches ?? []).map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} — {formatDate(b.created_at)} ({b.imported_count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Quantidade por corretor</label>
                <Input
                  type="number"
                  min={1}
                  max={5000}
                  placeholder="Ex.: 200"
                  value={perBroker}
                  onChange={(e) => setPerBroker(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Leads no lote" value={batchTotal ?? 0} />
              <Stat label="Sem responsável" value={unassignedCount ?? 0} tone="warn" />
              <Stat label="A distribuir" value={totalPlanned} tone="primary" />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="size-4" /> Corretores ativos ({meta?.brokers.length ?? 0})
              </div>
              <span className="text-xs text-muted-foreground">{selectedBrokers.size} selecionado(s)</span>
            </div>
            <div className="divide-y">
              {(meta?.brokers ?? []).map((b) => {
                const checked = selectedBrokers.has(b.id);
                const current = brokerCounts?.get(b.id) ?? 0;
                const willGet = checked ? Math.min(perBrokerNum, unassignedCount ?? 0) : 0;
                return (
                  <label key={b.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/30">
                    <Checkbox checked={checked} onCheckedChange={() => toggleBroker(b.id)} />
                    <div className="flex-1">
                      <div className="font-medium">{b.name}</div>
                      <div className="text-xs text-muted-foreground">{current} leads atualmente</div>
                    </div>
                    {checked && willGet > 0 && <Badge variant="secondary">+{willGet}</Badge>}
                  </label>
                );
              })}
              {(meta?.brokers ?? []).length === 0 && (
                <div className="p-6 text-center text-muted-foreground">Nenhum corretor ativo.</div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t p-3">
              {progress && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Atribuindo {progress.done} / {progress.total}
                </div>
              )}
              <Button onClick={handleQuickClick} disabled={running} className="ml-auto">
                {running ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Shuffle className="mr-2 size-4" />}
                {running ? "Distribuindo…" : "Distribuir agora"}
              </Button>
            </div>
          </Card>

          {lastResult && (
            <Card className="space-y-3 border-emerald-500/40 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-5" /> Resumo da distribuição
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Total distribuído" value={lastResult.total} tone="primary" />
                <Stat label="Corretores beneficiados" value={lastResult.perBroker.length} />
                <Stat label="Restantes sem responsável" value={lastResult.remainingUnassigned} tone="warn" />
              </div>
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {lastResult.perBroker.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-md bg-background/60 px-3 py-2">
                    <span>{p.name}</span>
                    <Badge>+{p.count}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </TabsContent>

        {/* MANUAL */}
        <TabsContent value="manual" className="space-y-4">
          <Card className="space-y-3 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Lote</label>
                <Select value={batchId} onValueChange={(v) => { setBatchId(v); setManualPage(0); setManualSelected(new Set()); }}>
                  <SelectTrigger><SelectValue placeholder="Escolher lote" /></SelectTrigger>
                  <SelectContent>
                    {(meta?.batches ?? []).map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Atribuir a</label>
                <div className="flex gap-2">
                  <Select value={manualBroker} onValueChange={setManualBroker}>
                    <SelectTrigger><SelectValue placeholder="Escolher corretor" /></SelectTrigger>
                    <SelectContent>
                      {(meta?.brokers ?? []).map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleManualClick} disabled={running || manualSelected.size === 0}>
                    {running ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Atribuir ({manualSelected.size})
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b p-3 text-sm">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={(manualLeads ?? []).length > 0 && (manualLeads ?? []).every((l) => manualSelected.has(l.id))}
                  onCheckedChange={(c) => {
                    const n = new Set(manualSelected);
                    (manualLeads ?? []).forEach((l) => (c ? n.add(l.id) : n.delete(l.id)));
                    setManualSelected(n);
                  }}
                />
                <span>Selecionar página atual</span>
              </div>
              <span className="text-muted-foreground">{unassignedCount ?? 0} sem responsável</span>
            </div>
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 w-10"></th>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Telefone</th>
                  </tr>
                </thead>
                <tbody>
                  {manualFetching && (
                    <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">
                      <Loader2 className="mx-auto size-4 animate-spin" />
                    </td></tr>
                  )}
                  {!manualFetching && (manualLeads ?? []).map((l) => (
                    <tr key={l.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Checkbox checked={manualSelected.has(l.id)} onCheckedChange={() => toggleManual(l.id)} />
                      </td>
                      <td className="px-3 py-2">{l.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{l.phone ?? "—"}</td>
                    </tr>
                  ))}
                  {!manualFetching && (manualLeads ?? []).length === 0 && (
                    <tr><td colSpan={3} className="py-8 text-center text-muted-foreground">
                      Nenhum lead sem responsável nesta página.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-2 border-t p-3 text-sm">
              <span className="text-muted-foreground">
                Página {manualPage + 1} de {totalManualPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={manualPage === 0} onClick={() => setManualPage((p) => Math.max(0, p - 1))}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={manualPage + 1 >= totalManualPages} onClick={() => setManualPage((p) => p + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* HISTORY */}
        <TabsContent value="history">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Lote</th>
                  <th className="px-3 py-2">Administrador</th>
                  <th className="px-3 py-2">Corretores</th>
                  <th className="px-3 py-2 text-right">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {(history ?? []).map((h: any) => {
                  const batch = meta?.batches.find((b: any) => b.id === h.batch_id);
                  const details: Array<{ id: string; name: string; count: number }> = h.details ?? [];
                  return (
                    <tr key={h.id} className="border-t align-top">
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(h.created_at)}</td>
                      <td className="px-3 py-2">
                        {batch ? (
                          <Link to="/leads-em-massa/$batchId" params={{ batchId: batch.id }} className="font-medium hover:text-primary">
                            {batch.name}
                          </Link>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs">{adminName(h.admin_id)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {details.map((d) => (
                            <Badge key={d.id} variant="secondary" className="text-xs">
                              {d.name}: {d.count}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{h.total_distributed}</td>
                    </tr>
                  );
                })}
                {(history ?? []).length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">
                    Nenhuma distribuição registrada ainda.
                  </td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmOpen === "quick"}
        onOpenChange={(o) => !o && setConfirmOpen(null)}
        title="Confirmar distribuição"
        description={
          <span>
            Você está prestes a distribuir <strong>{totalPlanned}</strong> leads entre{" "}
            <strong>{selectedBrokers.size}</strong> corretores ({perBrokerNum} por corretor).
            Essa ação não pode ser desfeita automaticamente.
          </span>
        }
        confirmLabel="Distribuir"
        loading={running}
        onConfirm={executeQuick}
      />
      <ConfirmDialog
        open={confirmOpen === "manual"}
        onOpenChange={(o) => !o && setConfirmOpen(null)}
        title="Confirmar atribuição manual"
        description={
          <span>
            Você está prestes a atribuir <strong>{manualSelected.size}</strong> leads ao corretor{" "}
            <strong>{meta?.brokers.find((b) => b.id === manualBroker)?.name ?? "—"}</strong>.
          </span>
        }
        confirmLabel="Atribuir"
        loading={running}
        onConfirm={executeManual}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" | "primary" }) {
  const color = tone === "warn" ? "text-destructive" : tone === "primary" ? "text-primary" : "";
  return (
    <Card className="p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${color}`}>{value}</div>
    </Card>
  );
}
