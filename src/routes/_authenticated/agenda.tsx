import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, MessageCircle, Trash2 } from "lucide-react";
import { whatsappUrl } from "@/lib/constants";
import { toast } from "sonner";
import { getMyGoogleCalendarStatus, updateGoogleCalendarEvent, deleteGoogleCalendarEvent, listGoogleEventsRange, patchRawGoogleEvent, deleteRawGoogleEvent } from "@/lib/google-calendar.functions";
import { GoogleCalendarBanner } from "@/components/GoogleCalendarBanner";
import { gcalErrorMessage, isGcalReconnectError } from "@/lib/gcal-error";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/agenda")({
  component: AgendaPage,
});


type EventKind = "entrevista" | "followup_candidato" | "followup_lead" | "google";
type AgendaEvent = {
  id: string;
  kind: EventKind;
  date: Date;
  title: string;
  phone: string | null;
  notes: string | null;
  link: { to: "/recrutamento/$id" | "/leads/$id"; params: { id: string } } | null;
  /** eventos vindos do Google (editáveis diretamente na agenda) */
  google?: {
    accountEmail: string;
    htmlLink: string | null;
    allDay: boolean;
    endISO: string | null;
    connectionId: string;
    calendarId: string;
    eventId: string;
  };

};

const HOUR_START = 7;
const HOUR_END = 21;
const SLOT_MIN = 30;
const PX_PER_MIN = 1.2; // 60 min = 72px

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 = dom
  const diff = day === 0 ? -6 : 1 - day; // segunda como início
  x.setDate(x.getDate() + diff);
  return x;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtDay(d: Date) { return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }); }
function fmtRange(a: Date, b: Date) {
  return `${a.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${b.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;
}

type DragPayload = {
  eventId: string;
  oldIso: string;
  kind: EventKind;
  refId: string;
  offsetY: number;
  duration?: number;
  google?: { connectionId: string; calendarId: string; eventId: string };
};


function AgendaPage() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [dropPreview, setDropPreview] = useState<{ dayIso: string; topPx: number } | null>(null);
  const [view, setView] = useState<"semana" | "lista">("semana");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const patchEvent = useServerFn(updateGoogleCalendarEvent);
  const patchRaw = useServerFn(patchRawGoogleEvent);

  const getStatus = useServerFn(getMyGoogleCalendarStatus);
  const fetchGoogleEvents = useServerFn(listGoogleEventsRange);
  const { data: gcalStatus } = useQuery({
    queryKey: ["gcal-status"],
    queryFn: () => getStatus(),
  });
  const calendarConnected = !!gcalStatus?.connected;

  const googleQuery = useQuery({
    queryKey: ["google-events", weekStart.toISOString()],
    queryFn: () => fetchGoogleEvents({
      data: { startISO: weekStart.toISOString(), endISO: weekEnd.toISOString() },
    }),
    enabled: (gcalStatus?.accountsCount ?? 0) > 0,
    staleTime: 60_000,
    retry: false,
  });

  const googleEvents = useMemo<AgendaEvent[]>(() => {
    return (googleQuery.data?.events ?? []).map((e) => {
      // id vem como `${connectionId}:${calendarId}:${googleEventId}`
      const first = e.id.indexOf(":");
      const last = e.id.lastIndexOf(":");
      const connectionId = first > 0 ? e.id.slice(0, first) : "";
      const eventId = last > first ? e.id.slice(last + 1) : "";
      return {
        id: `g-${e.id}`,
        kind: "google" as const,
        date: new Date(e.startISO),
        title: e.title,
        phone: null,
        notes: [e.location, e.description].filter(Boolean).join("\n") || null,
        link: null,
        google: {
          accountEmail: e.accountEmail,
          htmlLink: e.htmlLink,
          allDay: e.allDay,
          endISO: e.endISO,
          connectionId,
          calendarId: e.calendarId,
          eventId,
        },
      };
    });
  }, [googleQuery.data]);


  const { data: localEvents = [], isLoading } = useQuery({

    queryKey: ["agenda", weekStart.toISOString()],
    queryFn: async () => {
      const startIso = weekStart.toISOString();
      const endIso = weekEnd.toISOString();

      const [bci, li, cands, leads] = await Promise.all([
        supabase.from("broker_candidate_interactions")
          .select("id,candidate_id,interaction_type,next_follow_up_date,notes")
          .not("next_follow_up_date", "is", null)
          .gte("next_follow_up_date", startIso)
          .lt("next_follow_up_date", endIso),
        supabase.from("lead_interactions")
          .select("id,lead_id,next_follow_up_date,notes")
          .not("next_follow_up_date", "is", null)
          .gte("next_follow_up_date", startIso)
          .lt("next_follow_up_date", endIso),
        supabase.from("broker_candidates").select("id,name,phone"),
        supabase.from("leads").select("id,name,phone"),
      ]);

      const candMap = new Map((cands.data ?? []).map((c) => [c.id, c]));
      const leadMap = new Map((leads.data ?? []).map((l) => [l.id, l]));

      const out: AgendaEvent[] = [];
      for (const i of bci.data ?? []) {
        const c = candMap.get(i.candidate_id);
        if (!c || !i.next_follow_up_date) continue;
        out.push({
          id: `bci-${i.id}`,
          kind: i.interaction_type === "entrevista" ? "entrevista" : "followup_candidato",
          date: new Date(i.next_follow_up_date as string),
          title: c.name,
          phone: c.phone,
          notes: i.notes,
          link: { to: "/recrutamento/$id", params: { id: c.id } },
        });
      }
      for (const i of li.data ?? []) {
        const l = leadMap.get(i.lead_id);
        if (!l || !i.next_follow_up_date) continue;
        out.push({
          id: `li-${i.id}`,
          kind: "followup_lead",
          date: new Date(i.next_follow_up_date as string),
          title: l.name,
          phone: l.phone,
          notes: i.notes,
          link: { to: "/leads/$id", params: { id: l.id } },
        });
      }
      return out;
    },
  });

  const events = useMemo(() => [...localEvents, ...googleEvents], [localEvents, googleEvents]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));


  // amplia a faixa de horas quando existem compromissos fora do padrão
  const [hourStart, hourEnd] = useMemo(() => {
    let s = HOUR_START;
    let e = HOUR_END;
    for (const ev of events) {
      s = Math.min(s, ev.date.getHours());
      e = Math.max(e, ev.date.getHours() + 1);
    }
    return [Math.max(0, s), Math.min(24, e)] as const;
  }, [events]);

  const totalMinutes = (hourEnd - hourStart) * 60;
  const slots = Array.from({ length: (hourEnd - hourStart) * (60 / SLOT_MIN) + 1 }, (_, i) => i * SLOT_MIN);
  const now = new Date();
  const nowInRange = now >= weekStart && now < weekEnd;
  const nowTop = nowInRange ? (now.getHours() * 60 + now.getMinutes() - hourStart * 60) * PX_PER_MIN : 0;

  function eventStyle(ev: AgendaEvent) {
    const mins = ev.date.getHours() * 60 + ev.date.getMinutes() - hourStart * 60;
    return { top: `${Math.max(0, mins) * PX_PER_MIN}px`, height: `${30 * PX_PER_MIN - 2}px`, minHeight: "40px" };
  }

  // rola até o horário atual (ou primeiro compromisso da semana) ao abrir
  const scrollKey = `${weekStart.toISOString()}-${view}-${events.length}`;
  const scrolledRef = useRef<string>("");
  useEffect(() => {
    if (view !== "semana") return;
    const el = scrollRef.current;
    if (!el || scrolledRef.current === scrollKey) return;
    const target = nowInRange
      ? now.getHours() * 60 + now.getMinutes()
      : events.length
        ? Math.min(...events.map((e) => e.date.getHours() * 60 + e.date.getMinutes()))
        : hourStart * 60;
    const top = Math.max(0, (target - hourStart * 60) * PX_PER_MIN - 80);
    el.scrollTo({ top, behavior: "smooth" });
    scrolledRef.current = scrollKey;
  }, [scrollKey, view, nowInRange, events, hourStart]);


  const colorOf: Record<EventKind, string> = {
    entrevista: "bg-primary text-primary-foreground border-primary",
    followup_candidato: "bg-amber-500 text-white border-amber-600",
    followup_lead: "bg-blue-500 text-white border-blue-600",
    google: "bg-slate-600 text-white border-slate-700",
  };
  const labelOf: Record<EventKind, string> = {
    entrevista: "Entrevista",
    followup_candidato: "Follow-up candidato",
    followup_lead: "Follow-up lead",
    google: "Google Agenda",
  };

  function snapMinutes(y: number) {
    const raw = y / PX_PER_MIN;
    const snapped = Math.round(raw / SLOT_MIN) * SLOT_MIN;
    return Math.max(0, Math.min(totalMinutes - SLOT_MIN, snapped));
  }

  function computeDropMinutes(e: React.DragEvent<HTMLDivElement>): number {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = dragging?.offsetY ?? 0;
    const y = e.clientY - rect.top - offsetY;
    return snapMinutes(y);
  }

  async function rescheduleEvent(p: {
    eventId: string;
    refId: string;
    oldIso: string;
    kind: EventKind;
    newDate: Date;
    duration?: number;
    google?: { connectionId: string; calendarId: string; eventId: string };
  }) {
    if (p.kind === "google") {
      if (!p.google) return false;
      try {
        await patchRaw({
          data: {
            connectionId: p.google.connectionId,
            calendarId: p.google.calendarId,
            eventId: p.google.eventId,
            startISO: p.newDate.toISOString(),
            durationMinutes: p.duration ?? 30,
          },
        });
        toast.success("Evento movido no Google Agenda");
      } catch (e) {
        toast.error(gcalErrorMessage(e, "Não foi possível mover o evento no Google"));
        if (isGcalReconnectError(e)) qc.invalidateQueries({ queryKey: ["gcal-status"] });
        return false;
      }
      qc.invalidateQueries({ queryKey: ["google-events"] });
      return true;
    }
    const table = p.eventId.startsWith("bci-") ? "broker_candidate_interactions" : "lead_interactions";
    const rowId = p.eventId.replace(/^(bci|li)-/, "");
    const newIso = p.newDate.toISOString();

    const { data: updated, error } = await supabase
      .from(table)
      .update({ next_follow_up_date: newIso })
      .eq("id", rowId)
      .select("id");
    if (error) {
      toast.error(error.message);
      return false;
    }
    if (!updated || updated.length === 0) {
      toast.error("Sem permissão para alterar este compromisso.");
      return false;
    }
    if (p.kind === "entrevista" && calendarConnected) {
      try {
        const r = await patchEvent({
          data: {
            candidateId: p.refId,
            oldStartISO: p.oldIso,
            newStartISO: newIso,
            durationMinutes: p.duration ?? 30,
          },
        });
        toast.success(r.updated
          ? "Compromisso atualizado e movido no Google Calendar"
          : "Atualizado no sistema; evento não localizado no Google Calendar");
      } catch (e) {
        toast.error(gcalErrorMessage(e, "Atualizado no sistema, mas falhou no Google Calendar"));
        if (isGcalReconnectError(e)) qc.invalidateQueries({ queryKey: ["gcal-status"] });
      }
    } else {
      toast.success("Compromisso reagendado");
    }
    qc.invalidateQueries({ queryKey: ["agenda", weekStart.toISOString()] });
    return true;
  }

  function onColumnDragOver(e: React.DragEvent<HTMLDivElement>, dayIso: string) {
    if (!dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const mins = computeDropMinutes(e);
    setDropPreview({ dayIso, topPx: mins * PX_PER_MIN });
  }

  async function onColumnDrop(e: React.DragEvent<HTMLDivElement>, day: Date) {
    if (!dragging) return;
    e.preventDefault();
    const mins = computeDropMinutes(e);
    const newDate = new Date(day);
    newDate.setHours(0, 0, 0, 0);
    newDate.setMinutes(hourStart * 60 + mins);
    const payload = dragging;
    setDragging(null);
    setDropPreview(null);
    if (newDate.toISOString() === payload.oldIso) return;
    await rescheduleEvent({
      eventId: payload.eventId,
      refId: payload.refId,
      oldIso: payload.oldIso,
      kind: payload.kind,
      newDate,
      duration: payload.duration,
      google: payload.google,
    });

  }

  return (
    <div className="space-y-4">
      <GoogleCalendarBanner />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-sm text-muted-foreground">Compromissos da semana. Arraste um card para reagendar.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>Hoje</Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="size-4" /></Button>
          <div className="ml-2 text-sm font-medium">{fmtRange(weekStart, addDays(weekEnd, -1))}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="rounded-full bg-muted px-2 py-1 font-medium">
          {isLoading ? "Carregando…" : `${events.length} compromisso${events.length === 1 ? "" : "s"} nesta semana`}
        </span>
        <span className="flex items-center gap-1"><span className="inline-block size-3 rounded bg-primary" /> Entrevista</span>
        <span className="flex items-center gap-1"><span className="inline-block size-3 rounded bg-amber-500" /> Follow-up candidato</span>
        <span className="flex items-center gap-1"><span className="inline-block size-3 rounded bg-blue-500" /> Follow-up lead</span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant={view === "semana" ? "default" : "outline"} onClick={() => setView("semana")}>Semana</Button>
          <Button size="sm" variant={view === "lista" ? "default" : "outline"} onClick={() => setView("lista")}>Lista</Button>
        </div>
      </div>

      {view === "lista" ? (
        <Card className="divide-y">
          {[...events].sort((a, b) => a.date.getTime() - b.date.getTime()).map((ev) => (
            <div key={ev.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className={`rounded px-2 py-0.5 text-xs ${colorOf[ev.kind]}`}>{labelOf[ev.kind]}</span>
              <span className="font-medium">
                {ev.date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}{" "}
                {ev.date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="truncate">{ev.title}</span>
              {ev.google && (
                <span className="truncate text-xs text-muted-foreground">{ev.google.accountEmail}</span>
              )}
              {ev.phone && (
                <a href={whatsappUrl(ev.phone)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-emerald-600 hover:underline">
                  <MessageCircle className="size-3" /> {ev.phone}
                </a>
              )}
              {ev.link ? (
                <Button asChild size="sm" variant="outline" className="ml-auto">
                  <Link to={ev.link.to} params={ev.link.params}>Abrir</Link>
                </Button>
              ) : ev.google?.htmlLink ? (
                <Button asChild size="sm" variant="outline" className="ml-auto">
                  <a href={ev.google.htmlLink} target="_blank" rel="noreferrer">Abrir no Google</a>
                </Button>
              ) : null}
            </div>
          ))}
          {!isLoading && events.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">Nenhum compromisso nesta semana.</div>
          )}
        </Card>
      ) : (
      <Card className="overflow-hidden">
        <div ref={scrollRef} className="max-h-[calc(100vh-260px)] min-h-[420px] overflow-auto">
        <div className="min-w-[900px]">
          <div className="sticky top-0 z-40 grid grid-cols-[60px_repeat(7,1fr)] border-b bg-muted text-xs font-medium">
            <div />
            {days.map((d) => (
              <div key={d.toISOString()} className={`p-2 text-center ${sameDay(d, now) ? "text-primary" : ""}`}>
                {fmtDay(d)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[60px_repeat(7,1fr)]">
            {/* Coluna de horas */}
            <div className="relative" style={{ height: `${totalMinutes * PX_PER_MIN}px` }}>
              {slots.filter((m) => m % 60 === 0).map((m) => (
                <div key={m} className="absolute left-0 right-0 -translate-y-1/2 pr-2 text-right text-[10px] text-muted-foreground" style={{ top: `${m * PX_PER_MIN}px` }}>
                  {String(hourStart + m / 60).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {days.map((d) => {
              const dayEvents = events.filter((e) => sameDay(e.date, d));
              const dayIso = d.toISOString();
              const preview = dropPreview?.dayIso === dayIso ? dropPreview : null;
              return (
                <div
                  key={dayIso}
                  className="relative border-l"
                  style={{ height: `${totalMinutes * PX_PER_MIN}px` }}
                  onDragOver={(e) => onColumnDragOver(e, dayIso)}
                  onDragLeave={() => setDropPreview((p) => (p?.dayIso === dayIso ? null : p))}
                  onDrop={(e) => onColumnDrop(e, d)}
                >
                  {/* linhas da grade */}
                  {slots.map((m) => (
                    <div
                      key={m}
                      className={`absolute inset-x-0 ${m % 60 === 0 ? "border-t" : "border-t border-dashed border-muted"}`}
                      style={{ top: `${m * PX_PER_MIN}px` }}
                    />
                  ))}
                  {/* linha de agora */}
                  {sameDay(d, now) && nowInRange && nowTop >= 0 && nowTop <= totalMinutes * PX_PER_MIN && (
                    <div className="absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: `${nowTop}px` }}>
                      <span className="absolute -left-1 -top-1 size-2 rounded-full bg-red-500" />
                    </div>
                  )}
                  {/* preview de drop */}
                  {preview && (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-30 rounded border-2 border-dashed border-primary bg-primary/10"
                      style={{ top: `${preview.topPx}px`, height: `${30 * PX_PER_MIN - 2}px` }}
                    />
                  )}
                  {/* eventos */}
                  {dayEvents.map((ev) => (
                    <EventPopover
                      key={ev.id}
                      ev={ev}
                      colorOf={colorOf}
                      labelOf={labelOf}
                      style={eventStyle(ev)}
                      weekStartIso={weekStart.toISOString()}
                      calendarConnected={calendarConnected}
                      onDragStartCard={(payload) => setDragging(payload)}
                      onDragEndCard={() => { setDragging(null); setDropPreview(null); }}
                      isDragging={dragging?.eventId === ev.id}
                    />
                  ))}

                </div>
              );
            })}
          </div>
        </div>
        </div>
        {!isLoading && events.length === 0 && (
          <div className="border-t p-6 text-center text-sm text-muted-foreground">Nenhum compromisso nesta semana.</div>
        )}
      </Card>
      )}
    </div>
  );
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EventPopover({
  ev, colorOf, labelOf, style, weekStartIso, calendarConnected, onDragStartCard, onDragEndCard, isDragging,
}: {
  ev: AgendaEvent;
  colorOf: Record<EventKind, string>;
  labelOf: Record<EventKind, string>;
  style: React.CSSProperties;
  weekStartIso: string;
  calendarConnected: boolean;
  onDragStartCard: (p: DragPayload) => void;
  onDragEndCard: () => void;
  isDragging: boolean;
}) {
  const qc = useQueryClient();
  const [newDt, setNewDt] = useState(() => toLocalInput(ev.date));
  const [duration, setDuration] = useState(30);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isInterview = ev.kind === "entrevista";
  const patchEvent = useServerFn(updateGoogleCalendarEvent);
  const removeEvent = useServerFn(deleteGoogleCalendarEvent);

  async function save() {
    if (!newDt) return;
    setSaving(true);
    const newIso = new Date(newDt).toISOString();
    const table = ev.id.startsWith("bci-") ? "broker_candidate_interactions" : "lead_interactions";
    const rowId = ev.id.replace(/^(bci|li)-/, "");
    const { data: updated, error } = await supabase
      .from(table)
      .update({ next_follow_up_date: newIso })
      .eq("id", rowId)
      .select("id");
    if (error) {
      setSaving(false);
      toast.error(error.message);
      return;
    }
    if (!updated || updated.length === 0) {
      setSaving(false);
      toast.error("Sem permissão para alterar este compromisso.");
      return;
    }

    if (isInterview && calendarConnected) {
      try {
        const r = await patchEvent({
          data: {
            candidateId: ev.link!.params.id,
            oldStartISO: ev.date.toISOString(),
            newStartISO: newIso,
            durationMinutes: duration,
          },
        });
        toast.success(r.updated
          ? "Compromisso atualizado e movido no Google Calendar"
          : "Atualizado no sistema; evento não localizado no Google Calendar");
      } catch (e) {
        toast.error(gcalErrorMessage(e, "Atualizado no sistema, mas falhou no Google Calendar"));
        if (isGcalReconnectError(e)) qc.invalidateQueries({ queryKey: ["gcal-status"] });
      }
    } else {
      toast.success("Compromisso atualizado");
    }

    setSaving(false);
    qc.invalidateQueries({ queryKey: ["agenda", weekStartIso] });
  }

  async function remove() {
    setDeleting(true);
    const table = ev.id.startsWith("bci-") ? "broker_candidate_interactions" : "lead_interactions";
    const rowId = ev.id.replace(/^(bci|li)-/, "");
    const { error } = await supabase.from(table).delete().eq("id", rowId);
    if (error) {
      setDeleting(false);
      toast.error(error.message);
      return;
    }
    if (isInterview && calendarConnected) {
      try {
        const r = await removeEvent({
          data: { candidateId: ev.link!.params.id, startISO: ev.date.toISOString() },
        });
        toast.success(r.deleted
          ? "Compromisso excluído e removido do Google Calendar"
          : "Excluído no sistema; evento não localizado no Google Calendar");
      } catch (e) {
        toast.error(gcalErrorMessage(e, "Excluído no sistema, mas falhou no Google Calendar"));
        if (isGcalReconnectError(e)) qc.invalidateQueries({ queryKey: ["gcal-status"] });
      }
    } else {
      toast.success("Compromisso excluído");
    }
    setDeleting(false);
    qc.invalidateQueries({ queryKey: ["agenda", weekStartIso] });
  }


  if (ev.google) {
    const g = ev.google;
    const canEdit = !!g.connectionId && !!g.eventId && !g.allDay;
    const defaultDuration = g.endISO
      ? Math.max(5, Math.min(1440, Math.round((new Date(g.endISO).getTime() - ev.date.getTime()) / 60_000)))
      : 30;

    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={`absolute left-1 right-1 z-20 overflow-hidden rounded border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm hover:opacity-90 ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${colorOf[ev.kind]} ${isDragging ? "opacity-40" : ""}`}
            style={style}
            draggable={canEdit}
            onDragStart={(e) => {
              if (!canEdit) return;
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              e.dataTransfer.effectAllowed = "move";
              try { e.dataTransfer.setData("text/plain", ev.id); } catch { /* noop */ }
              onDragStartCard({
                eventId: ev.id,
                oldIso: ev.date.toISOString(),
                kind: ev.kind,
                refId: g.eventId,
                offsetY: e.clientY - rect.top,
                duration: defaultDuration,
                google: { connectionId: g.connectionId, calendarId: g.calendarId, eventId: g.eventId },
              });
            }}
            onDragEnd={onDragEndCard}
          >
            <div className="font-semibold">
              {g.allDay ? "Dia todo" : ev.date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="truncate">{ev.title}</div>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-2 text-sm">
          <div>
            <div className="text-xs font-medium text-muted-foreground">Google Agenda · {g.accountEmail}</div>
            <div className="font-semibold">{ev.title}</div>
          </div>
          <div className="text-xs text-muted-foreground">
            {ev.date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: g.allDay ? undefined : "short" })}
          </div>
          {ev.notes && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{ev.notes}</p>}
          {canEdit ? (
            <GoogleEventEditor
              google={{ connectionId: g.connectionId, calendarId: g.calendarId, eventId: g.eventId }}
              date={ev.date}
              defaultDuration={defaultDuration}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Evento de dia inteiro — edite direto no Google Calendar.
            </p>
          )}
          {g.htmlLink && (
            <Button asChild size="sm" variant="outline" className="w-full">
              <a href={g.htmlLink} target="_blank" rel="noreferrer">Abrir no Google</a>
            </Button>
          )}
        </PopoverContent>
      </Popover>
    );
  }


  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`absolute left-1 right-1 z-20 cursor-grab overflow-hidden rounded border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm hover:opacity-90 active:cursor-grabbing ${colorOf[ev.kind]} ${isDragging ? "opacity-40" : ""}`}
          style={style}
          draggable
          onDragStart={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const offsetY = e.clientY - rect.top;
            e.dataTransfer.effectAllowed = "move";
            try { e.dataTransfer.setData("text/plain", ev.id); } catch { /* noop */ }
            onDragStartCard({
              eventId: ev.id,
              oldIso: ev.date.toISOString(),
              kind: ev.kind,
              refId: ev.link!.params.id,
              offsetY,
            });
          }}
          onDragEnd={onDragEndCard}
        >
          <div className="font-semibold">{ev.date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
          <div className="truncate">{ev.title}</div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3 text-sm">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{labelOf[ev.kind]}</div>
          <div className="font-semibold">{ev.title}</div>
        </div>
        {ev.phone && (
          <a href={whatsappUrl(ev.phone)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-emerald-600 hover:underline">
            <MessageCircle className="size-3" /> {ev.phone}
          </a>
        )}
        {ev.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{ev.notes}</p>}
        <div className="space-y-1">
          <Label className="text-xs">Data e hora</Label>
          <Input type="datetime-local" value={newDt} onChange={(e) => setNewDt(e.target.value)} />
        </div>
        {isInterview && calendarConnected && (
          <div className="space-y-1">
            <Label className="text-xs">Duração (min) — Google Calendar</Label>
            <Input
              type="number"
              min={5}
              max={480}
              value={duration}
              onChange={(e) => setDuration(Math.max(5, Math.min(480, Number(e.target.value) || 30)))}
            />
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving} className="flex-1">
            {saving ? "Salvando…" : "Salvar"}
          </Button>
          {ev.link && (
            <Button asChild size="sm" variant="outline" className="flex-1">
              <Link to={ev.link.to} params={ev.link.params}>Abrir</Link>
            </Button>
          )}
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="destructive" className="w-full" disabled={deleting}>
              <Trash2 className="size-3" /> {deleting ? "Excluindo…" : "Excluir compromisso"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir compromisso?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação removerá o registro de interação{isInterview && calendarConnected ? " e tentará remover o evento do Google Calendar" : ""}. Não é possível desfazer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={remove}>Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PopoverContent>
    </Popover>
  );
}

function GoogleEventEditor({
  google, date, defaultDuration,
}: {
  google: { connectionId: string; calendarId: string; eventId: string };
  date: Date;
  defaultDuration: number;
}) {
  const qc = useQueryClient();
  const patchRaw = useServerFn(patchRawGoogleEvent);
  const deleteRaw = useServerFn(deleteRawGoogleEvent);
  const [newDt, setNewDt] = useState(() => toLocalInput(date));
  const [duration, setDuration] = useState(defaultDuration);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["google-events"] });
  }

  async function save() {
    if (!newDt) return;
    setSaving(true);
    try {
      await patchRaw({
        data: {
          connectionId: google.connectionId,
          calendarId: google.calendarId,
          eventId: google.eventId,
          startISO: new Date(newDt).toISOString(),
          durationMinutes: duration,
        },
      });
      toast.success("Evento atualizado no Google Agenda");
      refresh();
    } catch (e) {
      toast.error(gcalErrorMessage(e, "Não foi possível atualizar no Google"));
      if (isGcalReconnectError(e)) qc.invalidateQueries({ queryKey: ["gcal-status"] });
    }
    setSaving(false);
  }

  async function remove() {
    setDeleting(true);
    try {
      const r = await deleteRaw({
        data: {
          connectionId: google.connectionId,
          calendarId: google.calendarId,
          eventId: google.eventId,
        },
      });
      toast.success(r.alreadyGone ? "Evento já não existia no Google" : "Evento excluído do Google Agenda");
      refresh();
    } catch (e) {
      toast.error(gcalErrorMessage(e, "Não foi possível excluir no Google"));
      if (isGcalReconnectError(e)) qc.invalidateQueries({ queryKey: ["gcal-status"] });
    }
    setDeleting(false);
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">Data e hora</Label>
        <Input type="datetime-local" value={newDt} onChange={(e) => setNewDt(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Duração (min)</Label>
        <Input
          type="number"
          min={5}
          max={1440}
          value={duration}
          onChange={(e) => setDuration(Math.max(5, Math.min(1440, Number(e.target.value) || 30)))}
        />
      </div>
      <Button size="sm" className="w-full" onClick={save} disabled={saving}>
        {saving ? "Salvando…" : "Salvar no Google"}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="destructive" className="w-full" disabled={deleting}>
            <Trash2 className="size-3" /> {deleting ? "Excluindo…" : "Excluir do Google"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir evento do Google?</AlertDialogTitle>
            <AlertDialogDescription>
              O evento será removido da agenda do Google. Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

