import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { whatsappUrl } from "@/lib/constants";
import { toast } from "sonner";
import { getMyGoogleCalendarStatus, updateGoogleCalendarEvent } from "@/lib/google-calendar.functions";

export const Route = createFileRoute("/_authenticated/agenda")({
  component: AgendaPage,
});


type EventKind = "entrevista" | "followup_candidato" | "followup_lead";
type AgendaEvent = {
  id: string;
  kind: EventKind;
  date: Date;
  title: string;
  phone: string | null;
  notes: string | null;
  link: { to: "/recrutamento/$id" | "/leads/$id"; params: { id: string } };
};

const HOUR_START = 7;
const HOUR_END = 21;
const SLOT_MIN = 30;
const PX_PER_MIN = 1; // 60 min = 60px row

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
function fmtTime(d: Date) { return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }

function AgendaPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  const { data: events = [], isLoading } = useQuery({
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

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const totalMinutes = (HOUR_END - HOUR_START) * 60;
  const slots = Array.from({ length: (HOUR_END - HOUR_START) * (60 / SLOT_MIN) + 1 }, (_, i) => i * SLOT_MIN);
  const now = new Date();
  const nowInRange = now >= weekStart && now < weekEnd;
  const nowTop = nowInRange ? (now.getHours() * 60 + now.getMinutes() - HOUR_START * 60) * PX_PER_MIN : 0;

  function eventStyle(ev: AgendaEvent) {
    const mins = ev.date.getHours() * 60 + ev.date.getMinutes() - HOUR_START * 60;
    return { top: `${Math.max(0, mins) * PX_PER_MIN}px`, height: `${30 * PX_PER_MIN - 2}px` };
  }

  const colorOf: Record<EventKind, string> = {
    entrevista: "bg-primary text-primary-foreground border-primary",
    followup_candidato: "bg-amber-500 text-white border-amber-600",
    followup_lead: "bg-blue-500 text-white border-blue-600",
  };
  const labelOf: Record<EventKind, string> = {
    entrevista: "Entrevista",
    followup_candidato: "Follow-up candidato",
    followup_lead: "Follow-up lead",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-sm text-muted-foreground">Compromissos da semana.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>Hoje</Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="size-4" /></Button>
          <div className="ml-2 text-sm font-medium">{fmtRange(weekStart, addDays(weekEnd, -1))}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="flex items-center gap-1"><span className="inline-block size-3 rounded bg-primary" /> Entrevista</span>
        <span className="flex items-center gap-1"><span className="inline-block size-3 rounded bg-amber-500" /> Follow-up candidato</span>
        <span className="flex items-center gap-1"><span className="inline-block size-3 rounded bg-blue-500" /> Follow-up lead</span>
      </div>

      <Card className="overflow-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-muted/40 text-xs font-medium">
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
                  {String(HOUR_START + m / 60).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {days.map((d) => {
              const dayEvents = events.filter((e) => sameDay(e.date, d));
              return (
                <div key={d.toISOString()} className="relative border-l" style={{ height: `${totalMinutes * PX_PER_MIN}px` }}>
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
                  {/* eventos */}
                  {dayEvents.map((ev) => (
                    <Popover key={ev.id}>
                      <PopoverTrigger asChild>
                        <button
                          className={`absolute left-1 right-1 z-20 overflow-hidden rounded border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm hover:opacity-90 ${colorOf[ev.kind]}`}
                          style={eventStyle(ev)}
                        >
                          <div className="font-semibold">{fmtTime(ev.date)}</div>
                          <div className="truncate">{ev.title}</div>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 space-y-2 text-sm">
                        <div className="text-xs font-medium text-muted-foreground">{labelOf[ev.kind]}</div>
                        <div className="font-semibold">{ev.title}</div>
                        <div className="text-xs">{ev.date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</div>
                        {ev.phone && (
                          <a href={whatsappUrl(ev.phone)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-emerald-600 hover:underline">
                            <MessageCircle className="size-3" /> {ev.phone}
                          </a>
                        )}
                        {ev.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{ev.notes}</p>}
                        <Button asChild size="sm" variant="outline" className="w-full">
                          <Link to={ev.link.to} params={ev.link.params}>Abrir</Link>
                        </Button>
                      </PopoverContent>
                    </Popover>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        {!isLoading && events.length === 0 && (
          <div className="border-t p-6 text-center text-sm text-muted-foreground">Nenhum compromisso nesta semana.</div>
        )}
      </Card>
    </div>
  );
}
