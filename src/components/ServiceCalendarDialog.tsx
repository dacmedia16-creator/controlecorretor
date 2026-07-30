import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  getServiceAccountInfo,
  connectServiceCalendar,
} from "@/lib/google-calendar.functions";

export function ServiceCalendarDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const info = useServerFn(getServiceAccountInfo);
  const connect = useServerFn(connectServiceCalendar);

  const [calendarId, setCalendarId] = useState("");
  const [displayName, setDisplayName] = useState("");

  const infoQuery = useQuery({
    queryKey: ["gcal-service-account"],
    queryFn: () => info(),
    enabled: open,
    retry: false,
  });

  const connectMut = useMutation({
    mutationFn: () =>
      connect({ data: { calendarId: calendarId.trim(), displayName: displayName.trim() || undefined } }),
    onSuccess: (res) => {
      toast.success(`Agenda "${res.calendarName}" conectada!`);
      qc.invalidateQueries({ queryKey: ["gcal-connections"] });
      qc.invalidateQueries({ queryKey: ["gcal-status"] });
      qc.invalidateQueries({ queryKey: ["google-events"] });
      setCalendarId("");
      setDisplayName("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saEmail = infoQuery.data?.email ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" /> Conectar agenda de serviço
          </DialogTitle>
          <DialogDescription>
            Use esta opção para agendas da empresa (ex.: RE/MAX), sem precisar fazer login na conta Google.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-2">
            <p className="font-medium">Passo 1 — compartilhe a agenda</p>
            <p className="text-muted-foreground text-xs">
              No Google Agenda: Configurações do calendário → “Compartilhar com pessoas específicas” → adicione
              o e-mail abaixo com a permissão <strong>Fazer alterações nos eventos</strong>.
            </p>
            {infoQuery.isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Carregando…
              </div>
            )}
            {saEmail && (
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">{saEmail}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(saEmail);
                    toast.success("E-mail copiado");
                  }}
                >
                  <Copy className="size-3" />
                </Button>
              </div>
            )}
            {infoQuery.data && !infoQuery.data.available && (
              <p className="text-xs text-destructive">{infoQuery.data.error}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="calendarId">Passo 2 — ID do calendário</Label>
            <Input
              id="calendarId"
              placeholder="agenda@empresa.com.br"
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Em Configurações do calendário → “Integrar agenda” → ID do calendário.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">Apelido (opcional)</Label>
            <Input
              id="displayName"
              placeholder="RE/MAX"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => connectMut.mutate()}
            disabled={connectMut.isPending || calendarId.trim().length < 3}
          >
            {connectMut.isPending && <Loader2 className="size-4 animate-spin" />}
            Testar e conectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
