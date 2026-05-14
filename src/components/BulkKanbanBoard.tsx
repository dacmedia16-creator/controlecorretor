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
import { useEffect, useMemo, useState } from "react";
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
import {
  MessageCircle,
  Phone,
  ClipboardList,
  CalendarPlus,
  ChevronRight,
  ChevronLeft,
  Focus,
  LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";
import { InteractionDialog } from "@/components/InteractionDialog";

export type BulkBoardMode = "compra" | "captacao";

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

type QuickAction = {
  label: string;
  statusName: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  opensInteraction?: boolean;
};

const COMPRA_ACTIONS: QuickAction[] = [
  { label: "Não atendeu", statusName: "Não atendeu", tone: "warning" },
  { label: "WhatsApp enviado", statusName: "Mandou WhatsApp", tone: "info" },
  { label: "Aguardando resposta", statusName: "Aguardando resposta", tone: "default" },
  { label: "Respondeu", statusName: "Respondeu", tone: "info" },
  { label: "Interessado", statusName: "Interessado", tone: "success" },
  { label: "Sem interesse", statusName: "Sem interesse", tone: "danger" },
  { label: "Número inválido", statusName: "Número inválido", tone: "danger" },
  { label: "Agendar retorno", statusName: "Agendar retorno", tone: "info", opensInteraction: true },
];

const CAPTACAO_ACTIONS: QuickAction[] = [
  { label: "Não atendeu", statusName: "Não atendeu", tone: "warning" },
  { label: "WhatsApp enviado", statusName: "Mandou WhatsApp", tone: "info" },
  { label: "Aguardando resposta", statusName: "Aguardando resposta", tone: "default" },
  { label: "Respondeu", statusName: "Respondeu", tone: "info" },
  { label: "Avaliação agendada", statusName: "Avaliação agendada", tone: "info" },
  { label: "Captado", statusName: "Captado", tone: "success" },
  { label: "Sem interesse", statusName: "Sem interesse", tone: "danger" },
  { label: "Número inválido", statusName: "Número inválido", tone: "danger" },
];

const TONE_CLASSES: Record<NonNullable<QuickAction["tone"]>, string> = {
  default: "bg-muted hover:bg-muted/80 text-foreground border-border",
  success: "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent",
  warning: "bg-amber-500 hover:bg-amber-600 text-white border-transparent",
  danger: "bg-red-600 hover:bg-red-700 text-white border-transparent",
  info: "bg-sky-600 hover:bg-sky-700 text-white border-transparent",
};

export function BulkKanbanBoard({ mode }: { mode: BulkBoardMode }) {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isCaptacao = mode === "captacao";
  const kanbanType = isCaptacao ? "bulk_captacao" : "bulk_leads";
  const queryKey = ["bulk-kanban-board", mode, user?.id, role];
  const QUICK_ACTIONS = isCaptacao ? CAPTACAO_ACTIONS : COMPRA_ACTIONS;
  const title = isCaptacao ? "Kanban Captação em Massa" : "Kanban Leads em Massa";
  const subtitle = isCaptacao
    ? "Trabalhe captações importadas em sequência."
    : "Trabalhe leads em sequência com ações de um clique.";

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
  const [forceFocus, setForceFocus] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select(
          "id,name,phone,status_id,assigned_to_user_id,import_batch_id,city,neighborhood,source,updated_at,interest_type",
        )
        .not("import_batch_id", "is", null);
      if (isCaptacao) q = q.eq("interest_type", "captar");
      else q = q.or("interest_type.is.null,interest_type.neq.captar");
      if (role === "corretor") q = q.eq("assigned_to_user_id", user!.id);
      const [leads, statuses, brokers, lastInter, batches] = await Promise.all([
        q.order("updated_at", { ascending: false }).limit(2000),
        supabase
          .from("kanban_statuses")
          .select("id,name,color,position")
          .eq("active", true)
          .eq("kanban_type", kanbanType)
          .order("position"),
        supabase.from("profiles").select("id,name").eq("active", true).order("name"),
        supabase
          .from("lead_interactions")
          .select("lead_id, created_at, next_follow_up_date")
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("lead_import_batches")
          .select("id,name,created_at,default_interest_type")
          .order("created_at", { ascending: false }),
      ]);
      const lastByLead = new Map<string, { last: string; next: string | null }>();
      (lastInter.data ?? []).forEach((i: any) => {
        if (!lastByLead.has(i.lead_id))
          lastByLead.set(i.lead_id, { last: i.created_at, next: i.next_follow_up_date });
      });
      const filteredBatches = (batches.data ?? []).filter((b: any) =>
        isCaptacao ? b.default_interest_type === "captar" : b.default_interest_type !== "captar",
      );
      return {
        leads: (leads.data ?? []) as Lead[],
        statuses: statuses.data ?? [],
        brokers: brokers.data ?? [],
        batches: filteredBatches,
        lastByLead,
      };
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function setStatus(leadId: string, newStatusId: string, opts?: { silent?: boolean }) {
    const lead = data?.leads.find((l) => l.id === leadId);
    if (!lead || lead.status_id === newStatusId) return;
    const nowIso = new Date().toISOString();
    qc.setQueryData<any>(queryKey, (old: any) =>
      !old
        ? old
        : {
            ...old,
            leads: old.leads.map((l: Lead) =>
              l.id === leadId ? { ...l, status_id: newStatusId, updated_at: nowIso } : l,
            ),
          },
    );
    const { error } = await supabase
      .from("leads")
      .update({ status_id: newStatusId, updated_at: nowIso })
      .eq("id", leadId);
    if (error) {
      toast.error(error.message);
      qc.invalidateQueries({ queryKey });
      return;
    }
    if (!opts?.silent) toast.success("Status atualizado");
    qc.invalidateQueries({ queryKey });
  }

  async function quickAction(leadId: string, action: QuickAction) {
    const s = data?.statuses.find((x) => x.name === action.statusName);
    if (!s) {
      toast.error(`Status "${action.statusName}" não está configurado`);
      return;
    }
    await setStatus(leadId, s.id, { silent: action.opensInteraction });
    if (action.opensInteraction) setInteractLead(leadId);
    else toast.success(action.label);
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
    data.batches.find((b: any) => b.id === id)?.name ?? "—";
  const statusNameOf = (id: string | null) =>
    data.statuses.find((s: any) => s.id === id)?.name ?? "—";

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
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar por nome ou telefone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64"
          />
          <Button
            variant="outline"
            size="sm"
            className="hidden md:inline-flex"
            onClick={() => {
              setForceFocus((v) => !v);
              setFocusIndex(0);
            }}
          >
            {forceFocus ? <LayoutGrid className="mr-1 size-4" /> : <Focus className="mr-1 size-4" />}
            {forceFocus ? "Quadro" : "Modo foco"}
          </Button>
        </div>
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
        Exibindo {visibleLeads.length.toLocaleString("pt-BR")} de {data.leads.length.toLocaleString("pt-BR")} leads
      </div>

      <div className={forceFocus ? "" : "md:hidden"}>
        <FocusView
          leads={visibleLeads}
          index={focusIndex}
          setIndex={setFocusIndex}
          brokerName={brokerName}
          batchName={batchName}
          statusName={(id) => statusNameOf(id)}
          last={(id) => data.lastByLead.get(id)}
          onQuick={(id, a) => quickAction(id, a)}
          onInteract={(id) => setInteractLead(id)}
          quickActions={QUICK_ACTIONS}
        />
      </div>

      <div className={forceFocus ? "hidden" : "hidden md:block"}>
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
                      onQuick={(a) => quickAction(l.id, a)}
                      onInteract={() => setInteractLead(l.id)}
                      quickActions={QUICK_ACTIONS}
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
      </div>

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
  quickActions,
}: {
  lead: Lead;
  brokerName: string;
  batchName: string;
  statusName: string;
  last?: { last: string; next: string | null };
  onQuick: (a: QuickAction) => void;
  onInteract: () => void;
  quickActions: QuickAction[];
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

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

      <div className="mt-2 flex flex-wrap gap-1" onPointerDown={stop} onClick={stop}>
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

      <div className="mt-2 grid grid-cols-2 gap-1" onPointerDown={stop} onClick={stop}>
        {quickActions.filter((a) => a.statusName !== statusName).map((a) => (
          <button
            key={a.statusName}
            type="button"
            className={`rounded border px-1.5 py-1 text-[10px] font-medium transition ${TONE_CLASSES[a.tone ?? "default"]}`}
            onClick={() => onQuick(a)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

function FocusView({
  leads,
  index,
  setIndex,
  brokerName,
  batchName,
  statusName,
  last,
  onQuick,
  onInteract,
  quickActions,
}: {
  leads: Lead[];
  index: number;
  setIndex: (i: number) => void;
  brokerName: (id: string | null) => string;
  batchName: (id: string | null) => string;
  statusName: (id: string | null) => string;
  last: (id: string) => { last: string; next: string | null } | undefined;
  onQuick: (leadId: string, a: QuickAction) => void;
  onInteract: (leadId: string) => void;
  quickActions: QuickAction[];
}) {
  useEffect(() => {
    if (index >= leads.length) setIndex(0);
  }, [leads.length, index, setIndex]);

  if (leads.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Nenhum lead encontrado com os filtros atuais.
      </Card>
    );
  }

  const lead = leads[Math.min(index, leads.length - 1)];
  const li = last(lead.id);
  const goNext = () => setIndex((index + 1) % leads.length);
  const goPrev = () => setIndex((index - 1 + leads.length) % leads.length);

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Lead {Math.min(index, leads.length - 1) + 1} de {leads.length}</span>
        <Badge variant="secondary">{statusName(lead.status_id)}</Badge>
      </div>

      <div className="mt-2">
        <div className="text-xl font-bold leading-tight sm:text-2xl">{lead.name}</div>
        <div className="text-base text-muted-foreground">{lead.phone ?? "Sem telefone"}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>👤 {brokerName(lead.assigned_to_user_id)}</span>
          <span>📦 {batchName(lead.import_batch_id)}</span>
          {lead.city && <span>📍 {lead.city}{lead.neighborhood ? ` / ${lead.neighborhood}` : ""}</span>}
        </div>
        {li?.last && <div className="mt-1 text-xs text-muted-foreground">Última interação: {new Date(li.last).toLocaleString("pt-BR")}</div>}
        {li?.next && <div className="text-xs text-primary">Próximo retorno: {new Date(li.next).toLocaleString("pt-BR")}</div>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {lead.phone ? (
          <a href={whatsappUrl(lead.phone)} target="_blank" rel="noreferrer">
            <Button className="h-12 w-full bg-emerald-600 text-base hover:bg-emerald-700">
              <MessageCircle className="mr-2 size-5" /> WhatsApp
            </Button>
          </a>
        ) : (
          <Button disabled className="h-12 w-full text-base"><MessageCircle className="mr-2 size-5" /> WhatsApp</Button>
        )}
        {lead.phone ? (
          <a href={`tel:${lead.phone}`}>
            <Button className="h-12 w-full bg-sky-600 text-base hover:bg-sky-700"><Phone className="mr-2 size-5" /> Ligar</Button>
          </a>
        ) : (
          <Button disabled className="h-12 w-full text-base"><Phone className="mr-2 size-5" /> Ligar</Button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {quickActions.map((a) => (
          <button
            key={a.statusName}
            type="button"
            onClick={() => {
              onQuick(lead.id, a);
              if (!a.opensInteraction) setTimeout(goNext, 200);
            }}
            className={`h-12 rounded-md border px-2 text-sm font-medium transition ${TONE_CLASSES[a.tone ?? "default"]}`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button variant="outline" className="h-11 flex-1" onClick={() => onInteract(lead.id)}>
          <ClipboardList className="mr-2 size-4" /> Registrar
        </Button>
        <Button variant="outline" size="icon" className="h-11 w-11" onClick={goPrev} title="Anterior">
          <ChevronLeft className="size-5" />
        </Button>
        <Button className="h-11 flex-1" onClick={goNext}>
          Próximo lead <ChevronRight className="ml-2 size-5" />
        </Button>
      </div>
    </Card>
  );
}
