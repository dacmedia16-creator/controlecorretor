import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trello, Users, UserCheck, Clock } from "lucide-react";
import { BrokerCandidateFormDialog } from "@/components/BrokerCandidateFormDialog";

export const Route = createFileRoute("/_authenticated/recrutamento/dashboard")({
  component: RecrutamentoDashboard,
});

function RecrutamentoDashboard() {
  const { role, profile } = useAuth();
  const [openNew, setOpenNew] = useState(false);

  if (role !== "admin" && role !== "recrutador") return <p>Acesso restrito.</p>;

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
