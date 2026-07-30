import { createFileRoute } from "@tanstack/react-router";
import { exchangeCodeAndStore, stateReturnPath } from "@/lib/google-calendar.server";

const FALLBACK_PATH = "/recrutamento/kanban";

function withParams(origin: string, path: string, params: Record<string, string>) {
  const url = new URL(path, origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

export const Route = createFileRoute("/oauth/google-calendar/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const origin = url.origin;
        const back = (state && stateReturnPath(state)) || FALLBACK_PATH;

        if (error) {
          return Response.redirect(withParams(origin, back, { gcal: "error", reason: error }), 302);
        }
        if (!code || !state) {
          return Response.redirect(withParams(origin, back, { gcal: "error", reason: "missing_params" }), 302);
        }
        try {
          await exchangeCodeAndStore(code, state);
          return Response.redirect(withParams(origin, back, { gcal: "connected" }), 302);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          return Response.redirect(withParams(origin, back, { gcal: "error", reason: msg }), 302);
        }
      },
    },
  },
  component: () => <p className="p-8 text-sm text-muted-foreground">Conectando ao Google Calendar…</p>,
});
