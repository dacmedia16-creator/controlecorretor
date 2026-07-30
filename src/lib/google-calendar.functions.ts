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
  getTargetCalendarIds,
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
      .select("google_email,calendar_ids")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      connected: !!data,
      google_email: data?.google_email ?? null,
      calendar_ids: data?.calendar_ids?.length ? data.calendar_ids : ["primary"],
    };
  });

export const listMyGoogleCalendars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const accessToken = await getFreshAccessToken(context.userId);
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=100",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Google Calendar API ${res.status}: ${t}`);
    }
    const json = await res.json() as {
      items?: Array<{ id: string; summary?: string; primary?: boolean; accessRole?: string }>;
    };
    const calendars = (json.items ?? []).map((c) => ({
      id: c.primary ? "primary" : c.id,
      name: c.summary ?? c.id,
      primary: !!c.primary,
    }));
    calendars.sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
    return { calendars };
  });

export const setMyGoogleCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    calendarIds: z.array(z.string().min(1)).max(10),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const ids = data.calendarIds.length > 0 ? data.calendarIds : ["primary"];
    const { error } = await supabaseAdmin
      .from("user_google_calendar_connections")
      .update({ calendar_ids: ids })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { calendar_ids: ids };
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

async function findEventId(
  accessToken: string,
  calendarId: string,
  name: string,
  startISO: string,
): Promise<string | null> {
  const start = new Date(startISO);
  const listUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
    new URLSearchParams({
      q: name,
      timeMin: new Date(start.getTime() - 5 * 60_000).toISOString(),
      timeMax: new Date(start.getTime() + 5 * 60_000).toISOString(),
      singleEvents: "true",
      maxResults: "10",
    }).toString();

  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!listRes.ok) {
    const t = await listRes.text();
    throw new Error(`Google Calendar API ${listRes.status}: ${t}`);
  }
  const listed = await listRes.json() as { items?: Array<{ id: string; summary?: string }> };
  const match = (listed.items ?? []).find((e) => (e.summary ?? "").includes(name));
  return match?.id ?? null;
}

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
    const calendarIds = await getTargetCalendarIds(context.userId);

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

    let first: { id: string; htmlLink: string } | null = null;
    const failures: string[] = [];

    for (const [index, calendarId] of calendarIds.entries()) {
      // Convite ao candidato só no primeiro calendário, para não duplicar e-mails.
      const sendUpdates = attendees.length > 0 && index === 0 ? "all" : "none";
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${sendUpdates}`,
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
        failures.push(`${calendarId}: ${res.status} ${await res.text()}`);
        continue;
      }
      const created = await res.json() as { id: string; htmlLink: string };
      if (!first) first = created;
    }

    if (!first) throw new Error(`Google Calendar falhou — ${failures.join(" | ")}`);

    return {
      eventId: first.id,
      htmlLink: first.htmlLink,
      invited: attendees.length > 0,
      calendarsCreated: calendarIds.length - failures.length,
      failures,
    };
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
    const calendarIds = await getTargetCalendarIds(context.userId);

    const { data: cand } = await supabaseAdmin
      .from("broker_candidates")
      .select("name")
      .eq("id", data.candidateId)
      .maybeSingle();
    if (!cand) throw new Error("Candidato não encontrado");

    const newStart = new Date(data.newStartISO);
    const newEnd = new Date(newStart.getTime() + data.durationMinutes * 60_000);

    let updatedCount = 0;
    const failures: string[] = [];

    for (const [index, calendarId] of calendarIds.entries()) {
      try {
        const eventId = await findEventId(accessToken, calendarId, cand.name, data.oldStartISO);
        if (!eventId) continue;
        const sendUpdates = index === 0 ? "all" : "none";
        const patchRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=${sendUpdates}`,
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
          failures.push(`${calendarId}: ${patchRes.status} ${await patchRes.text()}`);
          continue;
        }
        updatedCount++;
      } catch (err) {
        failures.push(`${calendarId}: ${(err as Error).message}`);
      }
    }

    if (updatedCount === 0 && failures.length > 0) {
      throw new Error(`Google Calendar falhou — ${failures.join(" | ")}`);
    }
    return { updated: updatedCount > 0, updatedCount, failures };
  });

export const deleteGoogleCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    candidateId: z.string().uuid(),
    startISO: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const accessToken = await getFreshAccessToken(context.userId);
    const calendarIds = await getTargetCalendarIds(context.userId);

    const { data: cand } = await supabaseAdmin
      .from("broker_candidates")
      .select("name")
      .eq("id", data.candidateId)
      .maybeSingle();
    if (!cand) throw new Error("Candidato não encontrado");

    let deletedCount = 0;
    const failures: string[] = [];

    for (const [index, calendarId] of calendarIds.entries()) {
      try {
        const eventId = await findEventId(accessToken, calendarId, cand.name, data.startISO);
        if (!eventId) continue;
        const sendUpdates = index === 0 ? "all" : "none";
        const delRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=${sendUpdates}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!delRes.ok && delRes.status !== 410) {
          failures.push(`${calendarId}: ${delRes.status} ${await delRes.text()}`);
          continue;
        }
        deletedCount++;
      } catch (err) {
        failures.push(`${calendarId}: ${(err as Error).message}`);
      }
    }

    if (deletedCount === 0 && failures.length > 0) {
      throw new Error(`Google Calendar falhou — ${failures.join(" | ")}`);
    }
    return { deleted: deletedCount > 0, deletedCount, failures };
  });
