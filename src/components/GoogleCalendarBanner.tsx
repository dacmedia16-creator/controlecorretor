import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  startGoogleCalendarConnect,
  getMyGoogleCalendarStatus,
  disconnectGoogleCalendar,
} from "@/lib/google-calendar.functions";

export function GoogleCalendarBanner() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;

  const getStatus = useServerFn(getMyGoogleCalendarStatus);
  const startConnect = useServerFn(startGoogleCalendarConnect);
  const disconnect = useServerFn(disconnectGoogleCalendar);

  const { data } = useQuery({
    queryKey: ["gcal-status"],
    queryFn: () => getStatus(),
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
      qc.invalidateQueries({ queryKey: ["gcal-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return null;

  if (data.connected) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/30">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="size-4 text-green-600" />
          <span>Google Calendar conectado como <strong>{data.google_email}</strong></span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}>
          Desconectar
        </Button>
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
