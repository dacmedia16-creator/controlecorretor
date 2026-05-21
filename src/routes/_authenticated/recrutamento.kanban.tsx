import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { whatsappUrl } from "@/lib/constants";
import { MessageCircle, Plus, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { BrokerCandidateFormDialog } from "@/components/BrokerCandidateFormDialog";
import { BrokerCandidateInteractionDialog } from "@/components/BrokerCandidateInteractionDialog";

export const Route = createFileRoute("/_authenticated/recrutamento/kanban")({
  component: BrokerKanbanPage,
});

type Candidate = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  status_id: string | null;
  assigned_to_user_id: string | null;
  updated_at: string;
};

function BrokerKanbanPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [assignedFilter, setAssignedFilter] = useState<string>("all");

  if (role !== "admin" && role !== "recrutador") return <p>Acesso restrito.</p>;
  const isAdmin = role === "admin";

  const queryKey = ["broker-kanban"];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const [cands, statuses, profiles] = await Promise.all([
        supabase.from("broker_candidates").select("id,name,phone,email,city,status_id,assigned_to_user_id,updated_at").order("updated_at", { ascending: false }),
        supabase.from("kanban_statuses").select("id,name,color,position").eq("kanban_type", "broker_recruitment").eq("active", true).order("position"),
        supabase.from("profiles").select("id,name,email"),
      ]);
      return {
        candidates: (cands.data ?? []) as Candidate[],
        statuses: statuses.data ?? [],
        profiles: profiles.data ?? [],
      };
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over || !data) return;
    const id = String(e.active.id);
    const newStatusId = String(e.over.id);
    const c = data.candidates.find((x) => x.id === id);
    if (!c || c.status_id === newStatusId) return;

    qc.setQueryData<any>(queryKey, (old: any) => {
      if (!old) return old;
      return { ...old, candidates: old.candidates.map((x: Candidate) => x.id === id ? { ...x, status_id: newStatusId } : x) };
    });

    const { error } = await supabase.from("broker_candidates").update({ status_id: newStatusId }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Etapa atualizada");
    qc.invalidateQueries({ queryKey });
  }

  if (isLoading || !data) return <div>Carregando…</div>;
  const activeCand = activeId ? data.candidates.find((c) => c.id === activeId) : null;
  const profileById = new Map(data.profiles.map((p) => [p.id, p]));
  const assignedOptions = Array.from(
    new Set(data.candidates.map((c) => c.assigned_to_user_id).filter(Boolean) as string[])
  )
    .map((id) => profileById.get(id))
    .filter(Boolean) as { id: string; name: string; email: string }[];

  const filteredCandidates = isAdmin && assignedFilter !== "all"
    ? data.candidates.filter((c) =>
        assignedFilter === "__none" ? !c.assigned_to_user_id : c.assigned_to_user_id === assignedFilter
      )
    : data.candidates;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kanban — Recrutamento</h1>
          <p className="text-sm text-muted-foreground">Arraste o candidato para mudar a etapa.</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os responsáveis</SelectItem>
                <SelectItem value="__none">Sem responsável</SelectItem>
                {assignedOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name || p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button asChild variant="outline"><Link to="/recrutamento">Lista</Link></Button>
          <Button onClick={() => setOpenNew(true)}><Plus className="mr-1 size-4" />Novo candidato</Button>
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
            const col = filteredCandidates.filter((c) => c.status_id === s.id);
            return (
              <Column key={s.id} id={s.id} name={s.name} color={s.color} count={col.length}>
                {col.map((c) => (
                  <CandidateCard
                    key={c.id}
                    cand={c}
                    respName={c.assigned_to_user_id ? (profileById.get(c.assigned_to_user_id)?.name ?? null) : null}
                  />
                ))}
              </Column>
            );
          })}
        </div>
        <DragOverlay>
          {activeCand && (
            <Card className="w-72 p-3 shadow-lg cursor-grabbing">
              <div className="font-medium">{activeCand.name}</div>
              <div className="text-xs text-muted-foreground">{activeCand.phone}</div>
            </Card>
          )}
        </DragOverlay>
      </DndContext>

      <BrokerCandidateFormDialog open={openNew} onOpenChange={setOpenNew} />
    </div>
  );
}

function Column({ id, name, color, count, children }: { id: string; name: string; color: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`flex w-72 shrink-0 flex-col rounded-lg bg-muted/40 p-2 ${isOver ? "ring-2 ring-primary" : ""}`}>
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

function CandidateCard({ cand, respName }: { cand: Candidate; respName: string | null }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: cand.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  const [obsOpen, setObsOpen] = useState(false);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <Card ref={setNodeRef} style={style} {...attributes} {...listeners} className={`p-3 cursor-grab text-sm ${isDragging ? "opacity-40" : ""}`}>
      <Link to="/recrutamento/$id" params={{ id: cand.id }} onPointerDown={(e) => e.stopPropagation()} className="font-medium hover:underline">{cand.name}</Link>
      <div className="text-xs text-muted-foreground">{cand.phone ?? "Sem telefone"}</div>
      {cand.city && <div className="text-[11px] text-muted-foreground">📍 {cand.city}</div>}
      {respName && <div className="text-[11px] text-muted-foreground">👤 {respName}</div>}
      <div className="mt-2 flex flex-wrap gap-1">
        {cand.phone && (
          <a href={whatsappUrl(cand.phone)} target="_blank" rel="noreferrer" onClick={stop} onPointerDown={stop}>
            <Badge variant="outline"><MessageCircle className="mr-1 size-3" />WhatsApp</Badge>
          </a>
        )}
        <button
          type="button"
          onClick={(e) => { stop(e); setObsOpen(true); }}
          onPointerDown={stop}
        >
          <Badge variant="outline"><StickyNote className="mr-1 size-3" />Observação</Badge>
        </button>
      </div>
      <BrokerCandidateInteractionDialog
        open={obsOpen}
        onOpenChange={setObsOpen}
        candidateId={cand.id}
        defaultType="observacao"
      />
    </Card>
  );
}
