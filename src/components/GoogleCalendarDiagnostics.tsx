import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { gcalErrorMessage } from "@/lib/gcal-error";
import {
  testGoogleCalendarWrite,
  listGoogleSyncLog,
  listPendingInterviewSync,
  syncNextPendingInterviewFn,
} from "@/lib/google-calendar.functions";

const OP_LABEL: Record<string, string> = {
  create: "Criar",
  update: "Atualizar",
  delete: "Excluir",
  test: "Teste",
};

export function GoogleCalendarDiagnostics() {
  const qc = useQueryClient();
  const runTest = useServerFn(testGoogleCalendarWrite);
  const loadLog = useServerFn(listGoogleSyncLog);
  const loadPending = useServerFn(listPendingInterviewSync);
  const syncNext = useServerFn(syncNextPendingInterviewFn);

  const logQuery = useQuery({
    queryKey: ["gcal-sync-log"],
    queryFn: () => loadLog({ data: { limit: 15 } }),
  });

  const testMut = useMutation({
    mutationFn: () => runTest({ data: { keepEvent: false } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["gcal-sync-log"] });
      if (res.writableConnections === 0) {
        toast.warning("Nenhuma agenda com envio ligado", {
          description: "Ative \"Enviar compromissos\" em ao menos uma agenda com permissão de escrita.",
        });
        return;
      }
      const failed = res.results.filter((r) => !r.ok);
      if (failed.length === 0) {
        toast.success(`Envio funcionando em ${res.results.length} agenda(s)`);
      } else {
        toast.error("Falha ao criar evento de teste", {
          description: failed.map((f) => `${f.label}: ${f.status ?? ""} ${f.error ?? ""}`).join(" | ").slice(0, 400),
        });
      }
    },
    onError: (e: Error) => toast.error(gcalErrorMessage(e, "Não foi possível testar o envio")),
  });

  const entries = logQuery.data?.entries ?? [];
  const results = testMut.data?.results ?? [];

  const pendingQuery = useQuery({
    queryKey: ["gcal-pending-interviews"],
    queryFn: () => loadPending(),
  });
  const pendingCount = pendingQuery.data?.count ?? 0;
  const nextPending = pendingQuery.data?.pending?.[0];

  const syncMut = useMutation({
    mutationFn: () => syncNext(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["gcal-sync-log"] });
      qc.invalidateQueries({ queryKey: ["gcal-pending-interviews"] });
      qc.invalidateQueries({ queryKey: ["google-events"] });
      if (!res.interview) {
        toast.info("Nenhuma entrevista pendente de envio");
        return;
      }
      const quando = new Date(res.interview.startISO).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      });
      if (res.synced) {
        toast.success(`Entrevista de ${res.interview.candidateName} (${quando}) enviada`, {
          description: `Criada em: ${res.targets.join(", ")}${res.failures.length ? ` · Falhas: ${res.failures.join(" | ")}` : ""}`.slice(0, 400),
        });
      } else {
        toast.error(`Falha ao enviar entrevista de ${res.interview.candidateName}`, {
          description: res.failures.join(" | ").slice(0, 400),
        });
      }
    },
    onError: (e: Error) => toast.error(gcalErrorMessage(e, "Não foi possível sincronizar")),
  });

  return (
    <div className="rounded-md border bg-background p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Stethoscope className="size-4" /> Diagnóstico do envio
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending || pendingQuery.isLoading || pendingCount === 0}
          >
            {syncMut.isPending
              ? <><Loader2 className="size-4 animate-spin" /> Sincronizando…</>
              : <><RefreshCw className="size-4" /> Sincronizar agora{pendingCount > 0 ? ` (${pendingCount})` : ""}</>}
          </Button>
          <Button size="sm" variant="outline" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
            {testMut.isPending ? <><Loader2 className="size-4 animate-spin" /> Testando…</> : "Testar envio"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {pendingCount === 0
          ? "Nenhuma entrevista pendente de envio ao Google."
          : `${pendingCount} entrevista(s) futura(s) ainda não enviada(s). Próxima: ${nextPending?.candidateName} — ${new Date(nextPending!.startISO).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.`}
      </p>
      <p className="text-xs text-muted-foreground">
        Cria (e apaga em seguida) um evento de teste em cada agenda com envio ligado, mostrando o erro exato do Google.

      </p>

      {results.length > 0 && (
        <ul className="space-y-1 text-xs">
          {results.map((r) => (
            <li key={`${r.label}-${r.calendarId}`} className="flex items-start gap-2">
              {r.ok
                ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-600" />
                : <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />}
              <span className="min-w-0 break-words">
                <span className="font-medium">{r.label}</span> · {r.calendarId}
                {r.ok ? " — ok" : ` — ${r.status ?? ""} ${r.error ?? "falhou"}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">Últimas sincronizações</div>
        {logQuery.isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Carregando…
          </div>
        )}
        {!logQuery.isLoading && entries.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma tentativa registrada ainda.</p>
        )}
        <ul className="space-y-1">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-xs">
              {e.ok
                ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-600" />
                : <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />}
              <span className="min-w-0 break-words">
                <span className="text-muted-foreground">
                  {new Date(e.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>{" "}
                {OP_LABEL[e.operation] ?? e.operation} · {e.google_email ?? e.calendar_id}
                {!e.ok && <span className="text-destructive"> — {e.http_status ?? ""} {e.error ?? "falhou"}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
