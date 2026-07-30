import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { gcalErrorMessage } from "@/lib/gcal-error";
import {
  startGoogleCalendarConnect,
  getMyGoogleCalendarStatus,
  disconnectGoogleCalendar,
  listMyGoogleCalendars,
  setMyGoogleCalendars,
} from "@/lib/google-calendar.functions";


export function GoogleCalendarBanner() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;

  const getStatus = useServerFn(getMyGoogleCalendarStatus);
  const startConnect = useServerFn(startGoogleCalendarConnect);
  const disconnect = useServerFn(disconnectGoogleCalendar);
  const listCalendars = useServerFn(listMyGoogleCalendars);
  const setCalendars = useServerFn(setMyGoogleCalendars);
  const [showPicker, setShowPicker] = useState(false);

  const { data } = useQuery({
    queryKey: ["gcal-status"],
    queryFn: () => getStatus(),
  });

  const calendarsQuery = useQuery({
    queryKey: ["gcal-calendars"],
    queryFn: () => listCalendars(),
    enabled: showPicker && !!data?.connected,
    retry: false,
  });

  useEffect(() => {
    if (search.gcal === "connected") {
      toast.success("Google Calendar conectado!");
      qc.invalidateQueries({ queryKey: ["gcal-status"] });
      navigate({ to: ".", search: {}, replace: true });
    } else if (search.gcal === "error") {
      toast.error(`Falha ao conectar: ${search.reason ?? "erro desconhecido"}`);
      navigate({ to: ".", search: {}, replace: true });
    }
  }, [search.gcal, search.reason, qc, navigate]);

  const connectMut = useMutation({
    mutationFn: async () => {
      const { authorizationUrl } = await startConnect();
      window.location.href = authorizationUrl;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnect(),
    onSuccess: () => {
      toast.success("Desconectado");
      setShowPicker(false);
      qc.invalidateQueries({ queryKey: ["gcal-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCalendarsMut = useMutation({
    mutationFn: (calendarIds: string[]) => setCalendars({ data: { calendarIds } }),
    onSuccess: () => {
      toast.success("Calendários atualizados");
      qc.invalidateQueries({ queryKey: ["gcal-status"] });
    },
    onError: (e: Error) => toast.error(gcalErrorMessage(e, "Não foi possível salvar os calendários")),
  });

  if (!data) return null;

  if (data.connected) {
    const selected = data.calendar_ids ?? ["primary"];
    const toggle = (id: string, checked: boolean) => {
      const next = checked ? [...selected, id] : selected.filter((c) => c !== id);
      saveCalendarsMut.mutate(next.length > 0 ? next : ["primary"]);
    };

    return (
      <Card className="space-y-3 p-3 bg-muted/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-green-600" />
            <span>Google Calendar conectado como <strong>{data.google_email}</strong></span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowPicker((v) => !v)}>
              {showPicker ? "Ocultar calendários" : `Calendários (${selected.length})`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}>
              Desconectar
            </Button>
          </div>
        </div>

        {showPicker && (
          <div className="rounded-md border bg-background p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Escolha em quais calendários as entrevistas serão criadas. O convite ao candidato é enviado apenas uma vez.
            </p>
            {calendarsQuery.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Carregando calendários…
              </div>
            )}
            {calendarsQuery.isError && (
              <p className="text-sm text-destructive">
                {gcalErrorMessage(calendarsQuery.error, "Não foi possível listar seus calendários")}
              </p>
            )}
            <div className="space-y-2">
              {(calendarsQuery.data?.calendars ?? []).map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.includes(c.id)}
                    disabled={saveCalendarsMut.isPending}
                    onCheckedChange={(v) => toggle(c.id, v === true)}
                  />
                  <span>{c.name}{c.primary ? " (principal)" : ""}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </Card>
    );
  }


  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-3 border-primary/30 bg-primary/5">
      <div className="flex items-center gap-2 text-sm">
        <Calendar className="size-4 text-primary" />
        <span>Conecte seu Google Calendar para que as entrevistas agendadas virem eventos automaticamente.</span>
      </div>
      <Button size="sm" onClick={() => connectMut.mutate()} disabled={connectMut.isPending}>
        {connectMut.isPending ? "Redirecionando…" : "Conectar Google Calendar"}
      </Button>
    </Card>
  );
}
