import { createFileRoute } from "@tanstack/react-router";
import { exchangeCodeAndStore } from "@/lib/google-calendar.functions";

export const Route = createFileRoute("/oauth/google-calendar/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const origin = url.origin;

        if (error) {
          return Response.redirect(`${origin}/recrutamento/kanban?gcal=error&reason=${encodeURIComponent(error)}`, 302);
        }
        if (!code || !state) {
          return Response.redirect(`${origin}/recrutamento/kanban?gcal=error&reason=missing_params`, 302);
        }
        try {
          await exchangeCodeAndStore(code, state);
          return Response.redirect(`${origin}/recrutamento/kanban?gcal=connected`, 302);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          return Response.redirect(`${origin}/recrutamento/kanban?gcal=error&reason=${encodeURIComponent(msg)}`, 302);
        }
      },
    },
  },
  component: () => <p className="p-8 text-sm text-muted-foreground">Conectando ao Google Calendar…</p>,
});
