import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { gcalErrorMessage, isGcalReconnectError } from "@/lib/gcal-error";
import {
  getMyGoogleCalendarStatus,
  createGoogleCalendarEvent,
} from "@/lib/google-calendar.functions";

const TYPES = [
  { value: "ligacao", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "entrevista", label: "Entrevista" },
  { value: "observacao", label: "Observação" },
];

export function BrokerCandidateInteractionDialog({
  open, onOpenChange, candidateId, defaultType = "ligacao",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidateId: string;
  defaultType?: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [type, setType] = useState(defaultType);
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [addToCalendar, setAddToCalendar] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const getStatus = useServerFn(getMyGoogleCalendarStatus);
  const createEvent = useServerFn(createGoogleCalendarEvent);

  const { data: gcalStatus } = useQuery({
    queryKey: ["gcal-status"],
    queryFn: () => getStatus(),
  });

  useEffect(() => {
    if (open) setType(defaultType);
  }, [open, defaultType]);

  const isInterview = type === "entrevista";
  const calendarConnected = !!gcalStatus?.connected;
  const writeTargets = gcalStatus?.writeTargets ?? [];
  const readOnlyTargets = gcalStatus?.readOnlyTargets ?? [];

  async function save() {
    if (!user) return;
    if (isInterview && !followUp) {
      toast.error("Informe a data e hora da entrevista");
      return;
    }
    setSaving(true);
    let finalNotes = notes.trim();
    if (isInterview && followUp) {
      const formatted = new Date(followUp).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
      const prefix = `Entrevista agendada para ${formatted}`;
      finalNotes = finalNotes ? `${prefix}\n${finalNotes}` : prefix;
    }
    const { data: inserted, error } = await supabase.from("broker_candidate_interactions").insert({
      candidate_id: candidateId,
      user_id: user.id,
      interaction_type: type,
      notes: finalNotes || null,
      next_follow_up_date: followUp ? new Date(followUp).toISOString() : null,
    }).select("id").maybeSingle();
    if (error) {
      setSaving(false);
      toast.error(error.message);
      return;
    }

    if (isInterview && followUp && calendarConnected && addToCalendar) {
      try {
        const result = await createEvent({
          data: {
            candidateId,
            interactionId: inserted?.id ?? undefined,
            startISO: new Date(followUp).toISOString(),
            durationMinutes: durationMin,
            inviteCandidate: true,
            extraNotes: notes.trim() || undefined,
          },
        });
        const base = result.invited
          ? "Entrevista registrada e candidato convidado no Google Calendar"
          : `Entrevista criada em ${result.calendarsCreated} agenda(s) do Google`;
        if (result.failures.length > 0) {
          toast.warning(base, { description: `Falhou em: ${result.failures.join(" | ")}` });
        } else {
          toast.success(base);
        }
      } catch (e) {
        toast.error(gcalErrorMessage(e, "Interação salva, mas falhou no Google Calendar"));
        if (isGcalReconnectError(e)) qc.invalidateQueries({ queryKey: ["gcal-status"] });
      }
    } else {
      toast.success("Interação registrada");
    }

    setSaving(false);
    qc.invalidateQueries({ queryKey: ["broker-candidate", candidateId] });
    setNotes(""); setFollowUp("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar interação</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <Label>{isInterview ? "Data e hora da entrevista *" : "Próximo follow-up"}</Label>
            <Input type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </div>
          {isInterview && (
            <>
              <div>
                <Label>Duração (minutos)</Label>
                <Input
                  type="number"
                  min={5}
                  max={480}
                  value={durationMin}
                  onChange={(e) => setDurationMin(Math.max(5, Math.min(480, Number(e.target.value) || 30)))}
                />
              </div>
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <div className="font-medium">Adicionar ao Google Calendar</div>
                    <div className="text-xs text-muted-foreground">
                      {calendarConnected
                        ? "Cria o evento nas agendas com envio ligado."
                        : gcalStatus?.accountsCount
                          ? "Nenhuma agenda com permissão de escrita — o evento não será criado no Google."
                          : "Conecte seu Google Calendar na página Agenda."}
                    </div>
                  </div>
                  <Switch
                    checked={calendarConnected && addToCalendar}
                    onCheckedChange={setAddToCalendar}
                    disabled={!calendarConnected}
                  />
                </div>
                {writeTargets.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Será criado em: <span className="font-medium text-foreground">{writeTargets.join(", ")}</span>
                  </div>
                )}
                {readOnlyTargets.length > 0 && (
                  <div className="text-xs text-amber-600 dark:text-amber-500">
                    Somente leitura (não recebe o evento): {readOnlyTargets.join(", ")}
                  </div>
                )}
              </div>
              {lastError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  <div className="font-medium">Falha no Google Agenda</div>
                  <div className="break-words">{lastError}</div>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
