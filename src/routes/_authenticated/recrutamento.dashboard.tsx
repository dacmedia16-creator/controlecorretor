import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trello, Users, UserCheck, Clock, CalendarCheck2, ChevronDown } from "lucide-react";
import { BrokerCandidateFormDialog } from "@/components/BrokerCandidateFormDialog";

const INTERVIEW_STAGE = "Entrevista marcada";

export const Route = createFileRoute("/_authenticated/recrutamento/dashboard")({
  component: RecrutamentoDashboard,
});

function firstOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

function RecrutamentoDashboard() {
  const { role, profile, user } = useAuth();
  const [openNew, setOpenNew] = useState(false);
  const [start, setStart] = useState(firstOfMonth());
  const [end, setEnd] = useState(today());
  const [recruiterId, setRecruiterId] = useState<string>("all");
  const [showInterviewList, setShowInterviewList] = useState(false);

  const isPrivileged = role === "admin" || role === "gerente_recrutamento";

  if (role !== "admin" && role !== "recrutador" && role !== "gerente_recrutamento") return <p>Acesso restrito.</p>;

  const { data, isLoading } = useQuery({
    queryKey: ["recrutamento-dashboard"],
    queryFn: async () => {
      const [cands, statuses] = await Promise.all([
        supabase.from("broker_candidates").select("id,status_id,created_at,updated_at"),
        supabase
          .from("kanban_statuses")
          .select("id,name,color,position,active")
          .eq("kanban_type", "broker_recruitment")
          .order("position"),
      ]);
      return { candidates: cands.data ?? [], statuses: statuses.data ?? [] };
    },
  });

  const { data: recruiters } = useQuery({
    queryKey: ["dashboard-recruiters"],
    enabled: isPrivileged,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["recrutador", "admin", "gerente_recrutamento"]);
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      if (ids.length === 0) return [] as { id: string; name: string }[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", ids)
        .order("name");
      return (profs ?? []) as { id: string; name: string }[];
    },
  });

  // Effective user filter for the interview metric
  const effectiveUserId = isPrivileged ? (recruiterId === "all" ? null : recruiterId) : user?.id ?? null;

  const { data: interviewData, isLoading: loadingInterview } = useQuery({
    queryKey: ["interview-marked-history", start, end, effectiveUserId],
    queryFn: async () => {
      const startIso = new Date(`${start}T00:00:00`).toISOString();
      const endIso = new Date(`${end}T23:59:59.999`).toISOString();
      let q = supabase
        .from("broker_candidate_interactions")
        .select("candidate_id, created_at, user_id")
        .eq("interaction_type", "status_change")
        .ilike("notes", `Etapa alterada para: ${INTERVIEW_STAGE}%`)
        .gte("created_at", startIso)
        .lte("created_at", endIso);
      if (effectiveUserId) q = q.eq("user_id", effectiveUserId);
      const { data: logs } = await q;
      const rows = logs ?? [];
      // distinct by candidate: keep earliest date in range
      const byCand = new Map<string, { candidate_id: string; created_at: string }>();
      for (const r of rows) {
        const prev = byCand.get(r.candidate_id);
        if (!prev || new Date(r.created_at) < new Date(prev.created_at)) {
          byCand.set(r.candidate_id, { candidate_id: r.candidate_id, created_at: r.created_at });
        }
      }
      const distinct = Array.from(byCand.values());
      if (distinct.length === 0) return { count: 0, items: [] as Array<{ id: string; name: string; when: string; responsible: string | null }> };

      const ids = distinct.map((d) => d.candidate_id);
      const { data: cands } = await supabase
        .from("broker_candidates")
        .select("id, name, assigned_to_user_id")
        .in("id", ids);
      const assignedIds = Array.from(new Set((cands ?? []).map((c) => c.assigned_to_user_id).filter(Boolean))) as string[];
      const { data: profs } = assignedIds.length
        ? await supabase.from("profiles").select("id, name").in("id", assignedIds)
        : { data: [] as { id: string; name: string }[] };
      const profMap = new Map((profs ?? []).map((p) => [p.id, p.name]));
      const candMap = new Map((cands ?? []).map((c) => [c.id, c]));

      const items = distinct
        .map((d) => {
          const c = candMap.get(d.candidate_id);
          return {
            id: d.candidate_id,
            name: c?.name ?? "—",
            when: d.created_at,
            responsible: c?.assigned_to_user_id ? profMap.get(c.assigned_to_user_id) ?? null : null,
          };
        })
        .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

      return { count: items.length, items };
    },
  });

  const periodLabel = useMemo(() => {
    const f = (s: string) => s.split("-").reverse().join("/");
    return `${f(start)} → ${f(end)}`;
  }, [start, end]);

  if (isLoading || !data) return <div>Carregando…</div>;

  const hiredStatus = data.statuses.find((s) => s.name.toLowerCase().includes("contratad"));
  const rejectedStatus = data.statuses.find((s) => s.name.toLowerCase().includes("reprovad"));

  const total = data.candidates.length;
  const active = data.candidates.filter(
    (c) => c.status_id !== hiredStatus?.id && c.status_id !== rejectedStatus?.id,
  ).length;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const hiredThisMonth = data.candidates.filter(
    (c) => c.status_id === hiredStatus?.id && new Date(c.updated_at) >= monthStart,
  ).length;

  const hiredAll = data.candidates.filter((c) => c.status_id === hiredStatus?.id);
  const avgDays =
    hiredAll.length > 0
      ? Math.round(
          hiredAll.reduce((acc, c) => {
            const days = (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24);
            return acc + days;
          }, 0) / hiredAll.length,
        )
      : 0;

  const byStatus = data.statuses.map((s) => ({
    ...s,
    count: data.candidates.filter((c) => c.status_id === s.id).length,
  }));
  const maxCount = Math.max(1, ...byStatus.map((s) => s.count));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Recrutamento</h1>
          <p className="text-sm text-muted-foreground">
            Olá{profile?.name ? `, ${profile.name}` : ""}. Acompanhe o pipeline de candidatos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/recrutamento/kanban"><Trello className="mr-1 size-4" />Kanban</Link>
          </Button>
          <Button onClick={() => setOpenNew(true)}><Plus className="mr-1 size-4" />Novo candidato</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Candidatos ativos" value={active} icon={<Users className="size-5" />} />
        <KpiCard label="Total cadastrados" value={total} icon={<Users className="size-5" />} />
        <KpiCard label="Contratados no mês" value={hiredThisMonth} icon={<UserCheck className="size-5" />} />
        <KpiCard label="Tempo médio (dias)" value={avgDays} icon={<Clock className="size-5" />} hint="Primeiro contato → Contratado" />
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <CalendarCheck2 className="size-5 text-primary" />
            <h2 className="font-semibold">Passaram por "Entrevista marcada"</h2>
          </div>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-xs">Início</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 w-[150px]" />
            </div>
            <div>
              <Label className="text-xs">Fim</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 w-[150px]" />
            </div>
            {isPrivileged && (
              <div>
                <Label className="text-xs">Responsável</Label>
                <Select value={recruiterId} onValueChange={setRecruiterId}>
                  <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {(recruiters ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowInterviewList((v) => !v)}
          className="flex w-full items-center justify-between rounded-md border p-3 text-left hover:bg-muted/50 transition"
        >
          <div>
            <div className="text-3xl font-bold tabular-nums">
              {loadingInterview ? "…" : interviewData?.count ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">
              Candidatos distintos que entraram na etapa no período {periodLabel}
              {isPrivileged && recruiterId !== "all" && recruiters
                ? ` · ${recruiters.find((r) => r.id === recruiterId)?.name ?? ""}`
                : ""}
            </div>
          </div>
          <ChevronDown className={`size-5 transition-transform ${showInterviewList ? "rotate-180" : ""}`} />
        </button>

        {showInterviewList && (interviewData?.items?.length ?? 0) > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Candidato</th>
                  <th className="py-2 pr-3">Entrou na etapa</th>
                  <th className="py-2 pr-3">Responsável atual</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {interviewData!.items.map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="py-2 pr-3 font-medium">{it.name}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {new Date(it.when).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="py-2 pr-3">{it.responsible ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/recrutamento/$id" params={{ id: it.id }}>Abrir</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {showInterviewList && (interviewData?.items?.length ?? 0) === 0 && !loadingInterview && (
          <p className="mt-3 text-sm text-muted-foreground">Nenhum candidato entrou nessa etapa no período.</p>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold">Distribuição por etapa</h2>
        <div className="space-y-2">
          {byStatus.map((s) => (
            <div key={s.id} className="flex items-center gap-3">
              <Badge style={{ backgroundColor: s.color, color: "white" }} className="min-w-[160px] justify-center">
                {s.name}
              </Badge>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(s.count / maxCount) * 100}%`, backgroundColor: s.color }}
                />
              </div>
              <span className="w-10 text-right text-sm font-medium tabular-nums">{s.count}</span>
            </div>
          ))}
          {byStatus.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma etapa cadastrada.</p>
          )}
        </div>
      </Card>

      <BrokerCandidateFormDialog open={openNew} onOpenChange={setOpenNew} />
    </div>
  );
}

function KpiCard({ label, value, icon, hint }: { label: string; value: number; icon: React.ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-sm">{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
