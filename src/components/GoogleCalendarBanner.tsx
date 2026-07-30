import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Calendar, CheckCircle2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { gcalErrorMessage } from "@/lib/gcal-error";
import {
  startGoogleCalendarConnect,
  listMyGoogleConnections,
  listMyGoogleCalendars,
  setConnectionPrefs,
  disconnectGoogleConnection,
} from "@/lib/google-calendar.functions";

type ConnectionRow = {
  id: string;
  google_email: string;
  calendar_ids: string[];
  sync_out: boolean;
  sync_in: boolean;
};

export function GoogleCalendarBanner() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;

  const listConnections = useServerFn(listMyGoogleConnections);
  const startConnect = useServerFn(startGoogleCalendarConnect);

  const { data } = useQuery({
    queryKey: ["gcal-connections"],
    queryFn: () => listConnections(),
  });

  useEffect(() => {
    if (search.gcal === "connected") {
      toast.success("Conta Google conectada!");
      qc.invalidateQueries({ queryKey: ["gcal-connections"] });
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

  if (!data) return null;
  const connections = data.connections as ConnectionRow[];

  if (connections.length === 0) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3 border-primary/30 bg-primary/5">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="size-4 text-primary" />
          <span>Conecte uma conta Google para sincronizar as entrevistas com o Google Agenda.</span>
        </div>
        <Button size="sm" onClick={() => connectMut.mutate()} disabled={connectMut.isPending}>
          {connectMut.isPending ? "Redirecionando…" : "Conectar Google Calendar"}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-3 bg-muted/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="size-4 text-green-600" />
          Contas Google conectadas ({connections.length})
        </div>
        <Button size="sm" variant="outline" onClick={() => connectMut.mutate()} disabled={connectMut.isPending}>
          <Plus className="size-4" /> Conectar outra conta
        </Button>
      </div>

      <div className="space-y-2">
        {connections.map((c) => <ConnectionCard key={c.id} conn={c} />)}
      </div>
    </Card>
  );
}

function ConnectionCard({ conn }: { conn: ConnectionRow }) {
  const qc = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);
  const listCalendars = useServerFn(listMyGoogleCalendars);
  const savePrefs = useServerFn(setConnectionPrefs);
  const disconnect = useServerFn(disconnectGoogleConnection);

  const calendarsQuery = useQuery({
    queryKey: ["gcal-calendars", conn.id],
    queryFn: () => listCalendars({ data: { connectionId: conn.id } }),
    enabled: showPicker,
    retry: false,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["gcal-connections"] });
    qc.invalidateQueries({ queryKey: ["gcal-status"] });
    qc.invalidateQueries({ queryKey: ["google-events"] });
  };

  const prefsMut = useMutation({
    mutationFn: (input: { calendarIds?: string[]; syncOut?: boolean; syncIn?: boolean }) =>
      savePrefs({ data: { connectionId: conn.id, ...input } }),
    onSuccess: () => { toast.success("Preferências salvas"); invalidate(); },
    onError: (e: Error) => toast.error(gcalErrorMessage(e, "Não foi possível salvar")),
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnect({ data: { connectionId: conn.id } }),
    onSuccess: () => { toast.success("Conta desconectada"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const selected = conn.calendar_ids ?? ["primary"];
  const toggleCalendar = (id: string, checked: boolean) => {
    const next = checked ? [...selected, id] : selected.filter((c) => c !== id);
    prefsMut.mutate({ calendarIds: next.length > 0 ? next : ["primary"] });
  };

  return (
    <div className="rounded-md border bg-background p-3 space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="min-w-0 truncate text-sm font-medium">{conn.google_email}</div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowPicker((v) => !v)}>
            {showPicker ? "Ocultar" : `Calendários (${selected.length})`}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}>
            Desconectar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-2">
          <Switch
            checked={conn.sync_out}
            disabled={prefsMut.isPending}
            onCheckedChange={(v) => prefsMut.mutate({ syncOut: v })}
          />
          Enviar compromissos para esta conta
        </label>
        <label className="flex items-center gap-2">
          <Switch
            checked={conn.sync_in}
            disabled={prefsMut.isPending}
            onCheckedChange={(v) => prefsMut.mutate({ syncIn: v })}
          />
          Mostrar eventos desta conta na Agenda
        </label>
      </div>

      {showPicker && (
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Calendários usados para enviar e ler eventos desta conta.
          </p>
          {calendarsQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando calendários…
            </div>
          )}
          {calendarsQuery.isError && (
            <p className="text-sm text-destructive">
              {gcalErrorMessage(calendarsQuery.error, "Não foi possível listar os calendários")}
            </p>
          )}
          <div className="space-y-2">
            {(calendarsQuery.data?.calendars ?? []).map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.includes(c.id)}
                  disabled={prefsMut.isPending}
                  onCheckedChange={(v) => toggleCalendar(c.id, v === true)}
                />
                <span>{c.name}{c.primary ? " (principal)" : ""}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
