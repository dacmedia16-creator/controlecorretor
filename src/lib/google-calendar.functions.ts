import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  GOOGLE_CALENDAR_SCOPES,
  callbackRedirectUri,
  signState,
  newNonce,
  getFreshAccessToken,
} from "./google-calendar.server";

export const startGoogleCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID não configurado");
    const redirectUri = callbackRedirectUri();
    const state = signState({
      uid: userId,
      nonce: newNonce(),
      exp: Date.now() + 10 * 60 * 1000,
      redirect: redirectUri,
    });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_CALENDAR_SCOPES,
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state,
    });
    return { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  });

export const getMyGoogleCalendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_google_calendar_connections")
      .select("google_email")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { connected: !!data, google_email: data?.google_email ?? null };
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await supabaseAdmin
      .from("user_google_calendar_connections")
      .delete()
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const createGoogleCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    candidateId: z.string().uuid(),
    startISO: z.string().min(1),
    durationMinutes: z.number().int().min(5).max(480),
    inviteCandidate: z.boolean().default(true),
    extraNotes: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const accessToken = await getFreshAccessToken(context.userId);

    const { data: cand, error: candErr } = await supabaseAdmin
      .from("broker_candidates")
      .select("name,email,phone")
      .eq("id", data.candidateId)
      .maybeSingle();
    if (candErr || !cand) throw new Error("Candidato não encontrado");

    const start = new Date(data.startISO);
    const end = new Date(start.getTime() + data.durationMinutes * 60_000);

    const attendees: Array<{ email: string }> = [];
    if (data.inviteCandidate && cand.email) attendees.push({ email: cand.email });

    const body = {
      summary: `Entrevista — ${cand.name}`,
      description: [
        `Candidato: ${cand.name}`,
        cand.phone ? `Telefone: ${cand.phone}` : null,
        cand.email ? `Email: ${cand.email}` : null,
        data.extraNotes ? `\n${data.extraNotes}` : null,
      ].filter(Boolean).join("\n"),
      start: { dateTime: start.toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" },
      attendees,
      reminders: { useDefault: true },
    };

    const sendUpdates = attendees.length > 0 ? "all" : "none";
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=${sendUpdates}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Google Calendar API ${res.status}: ${t}`);
    }
    const created = await res.json() as { id: string; htmlLink: string };
    return { eventId: created.id, htmlLink: created.htmlLink, invited: attendees.length > 0 };
  });

  });

export const updateGoogleCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    candidateId: z.string().uuid(),
    oldStartISO: z.string().min(1),
    newStartISO: z.string().min(1),
    durationMinutes: z.number().int().min(5).max(480).default(30),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const accessToken = await getFreshAccessToken(context.userId);

    const { data: cand } = await supabaseAdmin
      .from("broker_candidates")
      .select("name")
      .eq("id", data.candidateId)
      .maybeSingle();
    if (!cand) throw new Error("Candidato não encontrado");

    const oldStart = new Date(data.oldStartISO);
    const timeMin = new Date(oldStart.getTime() - 5 * 60_000).toISOString();
    const timeMax = new Date(oldStart.getTime() + 5 * 60_000).toISOString();

    const listUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      new URLSearchParams({
        q: cand.name,
        timeMin,
        timeMax,
        singleEvents: "true",
        maxResults: "10",
      }).toString();

    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!listRes.ok) {
      const t = await listRes.text();
      throw new Error(`Google Calendar API ${listRes.status}: ${t}`);
    }
    const listed = await listRes.json() as { items?: Array<{ id: string; summary?: string }> };
    const match = (listed.items ?? []).find((e) => (e.summary ?? "").includes(cand.name));
    if (!match) return { updated: false };

    const newStart = new Date(data.newStartISO);
    const newEnd = new Date(newStart.getTime() + data.durationMinutes * 60_000);
    const patchRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${match.id}?sendUpdates=all`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start: { dateTime: newStart.toISOString(), timeZone: "America/Sao_Paulo" },
          end: { dateTime: newEnd.toISOString(), timeZone: "America/Sao_Paulo" },
        }),
      },
    );
    if (!patchRes.ok) {
      const t = await patchRes.text();
      throw new Error(`Google Calendar API ${patchRes.status}: ${t}`);
    }
    return { updated: true };
  });

