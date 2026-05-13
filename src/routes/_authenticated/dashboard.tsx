import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Users, ListChecks, PhoneCall, CalendarClock, Trophy, XCircle, UserCheck, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { role } = useAuth();
  if (role !== "admin") {
    return <p className="text-muted-foreground">Acesso restrito ao administrador.</p>;
  }

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [leads, brokers, statuses, batches] = await Promise.all([
        supabase.from("leads").select("id, status_id, assigned_to_user_id, import_batch_id"),
        supabase.from("profiles").select("id, name, active").eq("active", true),
        supabase.from("kanban_statuses").select("id, name"),
        supabase.from("lead_import_batches").select("id"),
      ]);
      return {
        leads: leads.data ?? [],
        brokers: brokers.data ?? [],
        statuses: statuses.data ?? [],
        batches: batches.data ?? [],
      };
    },
  });

  if (isLoading || !data) return <div className="text-muted-foreground">Carregando…</div>;

  const byStatusName = (n: string) => {
    const s = data.statuses.find((x) => x.name === n);
    return s ? data.leads.filter((l) => l.status_id === s.id).length : 0;
  };

  const cards = [
    { label: "Total de leads", value: data.leads.length, icon: ListChecks, color: "bg-blue-500" },
    { label: "Sem responsável", value: data.leads.filter((l) => !l.assigned_to_user_id).length, icon: XCircle, color: "bg-orange-500" },
    { label: "Em contato", value: byStatusName("Tentativa de contato") + byStatusName("Conversei com o lead"), icon: PhoneCall, color: "bg-cyan-500" },
    { label: "Retorno agendado", value: byStatusName("Retorno agendado"), icon: CalendarClock, color: "bg-sky-500" },
    { label: "Imóveis captados", value: byStatusName("Imóvel captado"), icon: Trophy, color: "bg-green-500" },
    { label: "Descartados", value: byStatusName("Descartado") + byStatusName("Sem interesse"), icon: XCircle, color: "bg-rose-500" },
    { label: "Corretores ativos", value: data.brokers.length, icon: UserCheck, color: "bg-violet-500" },
  ];

  // Per-broker performance
  const perBroker = data.brokers.map((b) => {
    const myLeads = data.leads.filter((l) => l.assigned_to_user_id === b.id);
    const contactedStatuses = data.statuses
      .filter((s) => ["Tentativa de contato", "Conversei com o lead", "Lead interessado", "Retorno agendado"].includes(s.name))
      .map((s) => s.id);
    const captadoStatusId = data.statuses.find((s) => s.name === "Imóvel captado")?.id;
    const semRetornoStatusId = data.statuses.find((s) => s.name === "Não atendeu")?.id;
    return {
      id: b.id,
      name: b.name,
      total: myLeads.length,
      contatados: myLeads.filter((l) => contactedStatuses.includes(l.status_id ?? "")).length,
      captados: myLeads.filter((l) => l.status_id === captadoStatusId).length,
      semRetorno: myLeads.filter((l) => l.status_id === semRetornoStatusId).length,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da operação</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">{c.label}</div>
                <div className="mt-1 text-3xl font-bold">{c.value}</div>
              </div>
              <div className={`flex size-10 items-center justify-center rounded-lg ${c.color} text-white`}>
                <c.icon className="size-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="mb-4 flex items-center gap-2">
          <Users className="size-5" />
          <h2 className="font-semibold">Desempenho por corretor</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4">Corretor</th>
                <th className="py-2 pr-4">Leads atribuídos</th>
                <th className="py-2 pr-4">Contatados</th>
                <th className="py-2 pr-4">Captados</th>
                <th className="py-2 pr-4">Sem retorno</th>
              </tr>
            </thead>
            <tbody>
              {perBroker.map((b) => (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{b.name}</td>
                  <td className="py-2 pr-4">{b.total}</td>
                  <td className="py-2 pr-4">{b.contatados}</td>
                  <td className="py-2 pr-4">{b.captados}</td>
                  <td className="py-2 pr-4">{b.semRetorno}</td>
                </tr>
              ))}
              {perBroker.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">
                  Nenhum corretor cadastrado. <Link to="/corretores" className="text-primary underline">Adicionar</Link>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
