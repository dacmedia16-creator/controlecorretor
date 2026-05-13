import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { whatsappUrl } from "@/lib/constants";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/kanban")({
  component: KanbanPage,
});

type Lead = {
  id: string;
  name: string;
  phone: string | null;
  status_id: string | null;
  assigned_to_user_id: string | null;
  import_batch_id: string | null;
  updated_at: string;
};

function KanbanPage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fBatch, setFBatch] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["kanban", user?.id, role],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select("id,name,phone,status_id,assigned_to_user_id,import_batch_id,updated_at")
        .is("import_batch_id", null);
      if (role === "corretor") q = q.or(`assigned_to_user_id.eq.${user!.id},created_by_user_id.eq.${user!.id}`);
      const [leads, statuses, brokers, lastInter, batches] = await Promise.all([
        q.order("updated_at", { ascending: false }),
        supabase.from("kanban_statuses").select("id,name,color,position").eq("active", true).eq("kanban_type", "general").order("position"),
        supabase.from("profiles").select("id,name"),
        supabase.from("lead_interactions").select("lead_id, created_at, next_follow_up_date").order("created_at", { ascending: false }),
        supabase.from("lead_import_batches").select("id,name").order("created_at", { ascending: false }),
      ]);
      const lastByLead = new Map<string, { last: string; next: string | null }>();
      (lastInter.data ?? []).forEach((i) => {
        if (!lastByLead.has(i.lead_id)) lastByLead.set(i.lead_id, { last: i.created_at, next: i.next_follow_up_date });
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

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over) return;
    const leadId = String(e.active.id);
    const newStatusId = String(e.over.id);
    const lead = data?.leads.find((l) => l.id === leadId);
    if (!lead || lead.status_id === newStatusId) return;

    // optimistic
    qc.setQueryData<any>(["kanban", user?.id, role], (old: any) => {
      if (!old) return old;
      return { ...old, leads: old.leads.map((l: Lead) => l.id === leadId ? { ...l, status_id: newStatusId } : l) };
    });

    const { error } = await supabase.from("leads").update({ status_id: newStatusId }).eq("id", leadId);
    if (error) {
      toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["kanban", user?.id, role] });
    } else {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["kanban", user?.id, role] });
    }
  }

  if (isLoading || !data) return <div>Carregando…</div>;

  const activeLead = activeId ? data.leads.find((l) => l.id === activeId) : null;
  const brokerName = (id: string | null) => data.brokers.find((b) => b.id === id)?.name ?? "Sem responsável";

  const visibleLeads = data.leads.filter((l) => {
    if (fBatch === "all") return true;
    if (fBatch === "_none_") return !l.import_batch_id;
    return l.import_batch_id === fBatch;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kanban</h1>
          <p className="text-sm text-muted-foreground">Leads cadastrados manualmente. Arraste para mudar o status.</p>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {data.statuses.map((s) => {
            const colLeads = visibleLeads.filter((l) => l.status_id === s.id);
            return (
              <Column key={s.id} id={s.id} name={s.name} color={s.color} count={colLeads.length}>
                {colLeads.map((l) => (
                  <KanbanCard
                    key={l.id}
                    lead={l}
                    brokerName={brokerName(l.assigned_to_user_id)}
                    last={data.lastByLead.get(l.id)}
                  />
                ))}
              </Column>
            );
          })}
        </div>
        <DragOverlay>
          {activeLead && (
            <Card className="w-72 p-3 shadow-lg cursor-grabbing">
              <div className="font-medium">{activeLead.name}</div>
              <div className="text-xs text-muted-foreground">{activeLead.phone}</div>
            </Card>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({ id, name, color, count, children }: { id: string; name: string; color: string; count: number; children: React.ReactNode }) {
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

function KanbanCard({ lead, brokerName, last }: { lead: Lead; brokerName: string; last?: { last: string; next: string | null } }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`p-3 cursor-grab text-sm ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="font-medium">{lead.name}</div>
      <div className="text-xs text-muted-foreground">{lead.phone ?? "Sem telefone"}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">👤 {brokerName}</div>
      {last?.last && <div className="text-[11px] text-muted-foreground">⏱ {new Date(last.last).toLocaleDateString("pt-BR")}</div>}
      {last?.next && <div className="text-[11px] text-primary">📅 {new Date(last.next).toLocaleDateString("pt-BR")}</div>}
      {lead.phone && (
        <a href={whatsappUrl(lead.phone)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <Badge variant="outline" className="mt-2"><MessageCircle className="mr-1 size-3" />WhatsApp</Badge>
        </a>
      )}
    </Card>
  );
}
