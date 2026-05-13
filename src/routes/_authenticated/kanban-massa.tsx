import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { whatsappUrl } from "@/lib/constants";
import { MessageCircle, Phone, ClipboardList, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { InteractionDialog } from "@/components/InteractionDialog";

export const Route = createFileRoute("/_authenticated/kanban-massa")({
  component: BulkKanbanPage,
});

type Lead = {
  id: string;
  name: string;
  phone: string | null;
  status_id: string | null;
  assigned_to_user_id: string | null;
  import_batch_id: string | null;
  city: string | null;
  neighborhood: string | null;
  source: string | null;
  updated_at: string;
};

const QUICK_ACTIONS: { label: string; statusName: string }[] = [
  { label: "Não atendeu", statusName: "Não atendeu" },
  { label: "Mandou WhatsApp", statusName: "Mandou WhatsApp" },
  { label: "Interessado", statusName: "Interessado" },
  { label: "Sem interesse", statusName: "Sem interesse" },
  { label: "Número inválido", statusName: "Número inválido" },
];

function BulkKanbanPage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["kanban-massa", user?.id, role];

  const [activeId, setActiveId] = useState<string | null>(null);
  const [fBatch, setFBatch] = useState("all");
  const [fBroker, setFBroker] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fCity, setFCity] = useState("all");
  const [fNeigh, setFNeigh] = useState("all");
  const [fSource, setFSource] = useState("all");
  const [fSpecial, setFSpecial] = useState<"none" | "no_interaction" | "today_followup">("none");
  const [search, setSearch] = useState("");
  const [interactLead, setInteractLead] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select(
          "id,name,phone,status_id,assigned_to_user_id,import_batch_id,city,neighborhood,source,updated_at",
        )
        .not("import_batch_id", "is", null);
      if (role === "corretor") q = q.eq("assigned_to_user_id", user!.id);
      const [leads, statuses, brokers, lastInter, batches] = await Promise.all([
        q.order("updated_at", { ascending: false }).limit(2000),
        supabase
          .from("kanban_statuses")
          .select("id,name,color,position")
          .eq("active", true)
          .eq("kanban_type", "bulk_leads")
          .order("position"),
        supabase.from("profiles").select("id,name").eq("active", true).order("name"),
        supabase
          .from("lead_interactions")
          .select("lead_id, created_at, next_follow_up_date")
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("lead_import_batches")
          .select("id,name,created_at")
          .order("created_at", { ascending: false }),
      ]);
      const lastByLead = new Map<string, { last: string; next: string | null }>();
      (lastInter.data ?? []).forEach((i: any) => {
        if (!lastByLead.has(i.lead_id))
          lastByLead.set(i.lead_id, { last: i.created_at, next: i.next_follow_up_date });
      });
      return {
        leads: (leads.data ?? []) as Lead[],
        statuses: statuses.data ?? [],
        brokers: brokers.data ?? [],
        batches: batches.data ?? [],
        lastByLead,
      };
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function setStatus(leadId: string, newStatusId: string) {
    const lead = data?.leads.find((l) => l.id === leadId);
    if (!lead || lead.status_id === newStatusId) return;
    qc.setQueryData<any>(queryKey, (old: any) =>
      !old
        ? old
        : { ...old, leads: old.leads.map((l: Lead) => (l.id === leadId ? { ...l, status_id: newStatusId } : l)) },
    );
    const { error } = await supabase.from("leads").update({ status_id: newStatusId }).eq("id", leadId);
    if (error) {
      toast.error(error.message);
      qc.invalidateQueries({ queryKey });
    } else {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey });
    }
  }

  async function quickStatusByName(leadId: string, statusName: string) {
    const s = data?.statuses.find((x) => x.name === statusName);
    if (!s) {
      toast.error(`Status "${statusName}" não está configurado`);
      return;
    }
    await setStatus(leadId, s.id);
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over) return;
    await setStatus(String(e.active.id), String(e.over.id));
  }

  const filterOptions = useMemo(() => {
    const cities = new Set<string>();
    const neighs = new Set<string>();
    const sources = new Set<string>();
    (data?.leads ?? []).forEach((l) => {
      if (l.city) cities.add(l.city);
      if (l.neighborhood) neighs.add(l.neighborhood);
      if (l.source) sources.add(l.source);
    });
    return {
      cities: Array.from(cities).sort(),
      neighs: Array.from(neighs).sort(),
      sources: Array.from(sources).sort(),
    };
  }, [data]);

  if (isLoading || !data) return <div>Carregando…</div>;

  const brokerName = (id: string | null) =>
    data.brokers.find((b) => b.id === id)?.name ?? "Sem responsável";
  const batchName = (id: string | null) =>
    data.batches.find((b) => b.id === id)?.name ?? "—";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const visibleLeads = data.leads.filter((l) => {
    if (fBatch !== "all" && l.import_batch_id !== fBatch) return false;
    if (fBroker !== "all") {
      if (fBroker === "_none_" && l.assigned_to_user_id) return false;
      if (fBroker !== "_none_" && l.assigned_to_user_id !== fBroker) return false;
    }
    if (fStatus !== "all" && l.status_id !== fStatus) return false;
    if (fCity !== "all" && l.city !== fCity) return false;
    if (fNeigh !== "all" && l.neighborhood !== fNeigh) return false;
    if (fSource !== "all" && l.source !== fSource) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const digits = q.replace(/\D/g, "");
      const hit =
        l.name.toLowerCase().includes(q) ||
        (digits && l.phone && l.phone.replace(/\D/g, "").includes(digits));
      if (!hit) return false;
    }
    if (fSpecial === "no_interaction" && data.lastByLead.has(l.id)) return false;
    if (fSpecial === "today_followup") {
      const last = data.lastByLead.get(l.id);
      if (!last?.next) return false;
      const d = new Date(last.next);
      if (d < today || d >= tomorrow) return false;
    }
    return true;
  });

  const activeLead = activeId ? data.leads.find((l) => l.id === activeId) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kanban Leads em Massa</h1>
          <p className="text-sm text-muted-foreground">
            Leads importados em massa. Arraste para mudar o status.
          </p>
        </div>
        <Input
          placeholder="Buscar por nome ou telefone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64"
        />
      </div>

      <Card className="grid gap-2 p-3 md:grid-cols-4 lg:grid-cols-7">
        <Filter label="Lote" value={fBatch} onChange={setFBatch}
          options={[["all", "Todos os lotes"], ...data.batches.map((b: any) => [b.id, b.name] as [string, string])]} />
        {role === "admin" && (
          <Filter label="Corretor" value={fBroker} onChange={setFBroker}
            options={[["all", "Todos"], ["_none_", "Sem responsável"], ...data.brokers.map((b) => [b.id, b.name] as [string, string])]} />
        )}
        <Filter label="Status" value={fStatus} onChange={setFStatus}
          options={[["all", "Todos"], ...data.statuses.map((s: any) => [s.id, s.name] as [string, string])]} />
        <Filter label="Cidade" value={fCity} onChange={setFCity}
          options={[["all", "Todas"], ...filterOptions.cities.map((c) => [c, c] as [string, string])]} />
        <Filter label="Bairro" value={fNeigh} onChange={setFNeigh}
          options={[["all", "Todos"], ...filterOptions.neighs.map((c) => [c, c] as [string, string])]} />
        <Filter label="Origem" value={fSource} onChange={setFSource}
          options={[["all", "Todas"], ...filterOptions.sources.map((c) => [c, c] as [string, string])]} />
        <Filter label="Especiais" value={fSpecial} onChange={(v) => setFSpecial(v as any)}
          options={[["none", "—"], ["no_interaction", "Sem interação"], ["today_followup", "Retorno hoje"]]} />
      </Card>

      <div className="text-xs text-muted-foreground">
        Exibindo {visibleLeads.length.toLocaleString("pt-BR")} de {data.leads.length.toLocaleString("pt-BR")} leads em massa
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {data.statuses.map((s: any) => {
            const colLeads = visibleLeads.filter((l) => l.status_id === s.id);
            return (
              <Column key={s.id} id={s.id} name={s.name} color={s.color} count={colLeads.length}>
                {colLeads.slice(0, 100).map((l) => (
                  <BulkCard
                    key={l.id}
                    lead={l}
                    brokerName={brokerName(l.assigned_to_user_id)}
                    batchName={batchName(l.import_batch_id)}
                    statusName={s.name}
                    last={data.lastByLead.get(l.id)}
                    onQuick={(name) => quickStatusByName(l.id, name)}
                    onInteract={() => setInteractLead(l.id)}
                  />
                ))}
                {colLeads.length > 100 && (
                  <div className="px-2 py-1 text-[11px] text-muted-foreground">
                    +{colLeads.length - 100} ocultos. Use os filtros para refinar.
                  </div>
                )}
              </Column>
            );
          })}
        </div>
        <DragOverlay>
          {activeLead && (
            <Card className="w-72 p-3 shadow-lg">
              <div className="font-medium">{activeLead.name}</div>
              <div className="text-xs text-muted-foreground">{activeLead.phone}</div>
            </Card>
          )}
        </DragOverlay>
      </DndContext>

      {interactLead && (
        <InteractionDialog
          open={!!interactLead}
          onOpenChange={(o) => !o && setInteractLead(null)}
          leadId={interactLead}
          onSaved={() => qc.invalidateQueries({ queryKey })}
        />
      )}
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-muted-foreground">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Column({
  id,
  name,
  color,
  count,
  children,
}: {
  id: string;
  name: string;
  color: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-lg bg-muted/40 p-2 ${isOver ? "ring-2 ring-primary" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold">{name}</span>
        </div>
        <Badge variant="secondary">{count}</Badge>
      </div>
      <div className="flex-1 space-y-2 min-h-[200px]">{children}</div>
    </div>
  );
}

function BulkCard({
  lead,
  brokerName,
  batchName,
  statusName,
  last,
  onQuick,
  onInteract,
}: {
  lead: Lead;
  brokerName: string;
  batchName: string;
  statusName: string;
  last?: { last: string; next: string | null };
  onQuick: (statusName: string) => void;
  onInteract: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`p-2.5 cursor-grab text-sm ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="font-medium leading-tight">{lead.name}</div>
      <div className="text-xs text-muted-foreground">{lead.phone ?? "Sem telefone"}</div>
      <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
        <span>👤 {brokerName}</span>
        <span>📦 {batchName}</span>
      </div>
      {last?.last && (
        <div className="text-[10px] text-muted-foreground">
          ⏱ {new Date(last.last).toLocaleDateString("pt-BR")}
        </div>
      )}
      {last?.next && (
        <div className="text-[10px] text-primary">
          📅 {new Date(last.next).toLocaleDateString("pt-BR")}
        </div>
      )}

      <div
        className="mt-2 flex flex-wrap gap-1"
        onPointerDown={stop}
        onClick={stop}
      >
        {lead.phone && (
          <a href={`tel:${lead.phone}`} onClick={stop}>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Ligar">
              <Phone className="size-3.5" />
            </Button>
          </a>
        )}
        {lead.phone && (
          <a href={whatsappUrl(lead.phone)} target="_blank" rel="noreferrer" onClick={stop}>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="WhatsApp">
              <MessageCircle className="size-3.5 text-emerald-600" />
            </Button>
          </a>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Registrar interação" onClick={onInteract}>
          <ClipboardList className="size-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Agendar retorno" onClick={onInteract}>
          <CalendarPlus className="size-3.5" />
        </Button>
      </div>

      <div className="mt-1 flex flex-wrap gap-1" onPointerDown={stop} onClick={stop}>
        {QUICK_ACTIONS.filter((a) => a.statusName !== statusName).slice(0, 3).map((a) => (
          <Badge
            key={a.statusName}
            variant="outline"
            className="cursor-pointer text-[10px] hover:bg-muted"
            onClick={() => onQuick(a.statusName)}
          >
            {a.label}
          </Badge>
        ))}
      </div>
    </Card>
  );
}
