import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  GOOGLE_CALENDAR_SCOPES,
  callbackRedirectUri,
  signState,
  newNonce,
  listConnections,
  getConnection,
  connectionCalendarIds,
  freshTokenFor,
  type GcalConnection,
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
      // select_account permite conectar uma segunda conta (ex.: RE/MAX).
      prompt: "consent select_account",
      state,
    });
    return { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  });

export const getMyGoogleCalendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const conns = await listConnections(context.userId);
    const writable = conns.filter((c) => c.sync_out);
    const first = writable[0] ?? conns[0] ?? null;
    return {
      connected: writable.length > 0,
      accountsCount: conns.length,
      google_email: first?.google_email ?? null,
      calendar_ids: first ? connectionCalendarIds(first) : ["primary"],
    };
  });

export const listMyGoogleConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const conns = await listConnections(context.userId);
    return {
      connections: conns.map((c) => ({
        id: c.id,
        google_email: c.google_email,
        calendar_ids: connectionCalendarIds(c),
        sync_out: c.sync_out,
        sync_in: c.sync_in,
      })),
    };
  });

export const listMyGoogleCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ connectionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await getConnection(context.userId, data.connectionId);
    const accessToken = await freshTokenFor(conn);
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=100",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Google Calendar API ${res.status}: ${t}`);
    }
    const json = await res.json() as {
      items?: Array<{ id: string; summary?: string; primary?: boolean }>;
    };
    const calendars = (json.items ?? []).map((c) => ({
      id: c.primary ? "primary" : c.id,
      name: c.summary ?? c.id,
      primary: !!c.primary,
    }));
    calendars.sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
    return { calendars };
  });

export const setConnectionPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    connectionId: z.string().uuid(),
    calendarIds: z.array(z.string().min(1)).max(20).optional(),
    syncOut: z.boolean().optional(),
    syncIn: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.calendarIds) patch.calendar_ids = data.calendarIds.length > 0 ? data.calendarIds : ["primary"];
    if (data.syncOut !== undefined) patch.sync_out = data.syncOut;
    if (data.syncIn !== undefined) patch.sync_in = data.syncIn;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabaseAdmin
      .from("user_google_calendar_connections")
      .update(patch)
      .eq("id", data.connectionId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disconnectGoogleConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ connectionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("user_google_calendar_connections")
      .delete()
      .eq("id", data.connectionId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
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

/** Busca eventos da semana em todas as contas marcadas para leitura. */
export const listGoogleEventsRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    startISO: z.string().min(1),
    endISO: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const conns = await listConnections(context.userId, { syncIn: true });
    const events: Array<{
      id: string;
      accountEmail: string;
      calendarId: string;
      title: string;
      startISO: string;
      endISO: string | null;
      allDay: boolean;
      htmlLink: string | null;
      location: string | null;
      description: string | null;
    }> = [];
    const failures: string[] = [];

    for (const conn of conns) {
      let accessToken: string;
      try {
        accessToken = await freshTokenFor(conn);
      } catch (err) {
        failures.push(`${conn.google_email}: ${(err as Error).message}`);
        continue;
      }
      for (const calendarId of connectionCalendarIds(conn)) {
        try {
          const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
            new URLSearchParams({
              timeMin: data.startISO,
              timeMax: data.endISO,
              singleEvents: "true",
              orderBy: "startTime",
              maxResults: "250",
            }).toString();
          const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!res.ok) {
            failures.push(`${conn.google_email}/${calendarId}: ${res.status} ${await res.text()}`);
            continue;
          }
          const json = await res.json() as {
            items?: Array<{
              id: string;
              summary?: string;
              status?: string;
              htmlLink?: string;
              location?: string;
              description?: string;
              start?: { dateTime?: string; date?: string };
              end?: { dateTime?: string; date?: string };
            }>;
          };
          for (const it of json.items ?? []) {
            if (it.status === "cancelled") continue;
            const startISO = it.start?.dateTime ?? (it.start?.date ? `${it.start.date}T00:00:00` : null);
            if (!startISO) continue;
            events.push({
              id: `${conn.id}:${calendarId}:${it.id}`,
              accountEmail: conn.google_email,
              calendarId,
              title: it.summary ?? "(sem título)",
              startISO,
              endISO: it.end?.dateTime ?? null,
              allDay: !it.start?.dateTime,
              htmlLink: it.htmlLink ?? null,
              location: it.location ?? null,
              description: it.description ?? null,
            });
          }
        } catch (err) {
          failures.push(`${conn.google_email}/${calendarId}: ${(err as Error).message}`);
        }
      }
    }

    return { events, failures, accounts: conns.length };
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

/** Eventos rastreados de uma interação: [connectionId+calendarId] -> googleEventId */
async function trackedEvents(interactionId: string) {
  const { data } = await supabaseAdmin
    .from("google_calendar_events")
    .select("connection_id,calendar_id,google_event_id")
    .eq("interaction_id", interactionId);
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(`${row.connection_id}|${row.calendar_id}`, row.google_event_id);
  return map;
}

async function resolveEventId(
  conn: GcalConnection,
  calendarId: string,
  accessToken: string,
  tracked: Map<string, string>,
  candidateName: string,
  startISO: string,
): Promise<string | null> {
  const known = tracked.get(`${conn.id}|${calendarId}`);
  if (known) return known;
  return findEventId(accessToken, calendarId, candidateName, startISO);
}

export const createGoogleCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    candidateId: z.string().uuid(),
    interactionId: z.string().uuid().optional(),
    startISO: z.string().min(1),
    durationMinutes: z.number().int().min(5).max(480),
    inviteCandidate: z.boolean().default(true),
    extraNotes: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const conns = await listConnections(context.userId, { syncOut: true });
    if (conns.length === 0) throw new Error("Google Calendar não conectado");

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
    let createdCount = 0;
    const failures: string[] = [];
    const tracking: Array<{
      interaction_id: string; connection_id: string; calendar_id: string; google_event_id: string;
    }> = [];
    let isFirstTarget = true;

    for (const conn of conns) {
      let accessToken: string;
      try {
        accessToken = await freshTokenFor(conn);
      } catch (err) {
        failures.push(`${conn.google_email}: ${(err as Error).message}`);
        continue;
      }
      for (const calendarId of connectionCalendarIds(conn)) {
        // Convite ao candidato apenas no primeiro destino, para não duplicar e-mails.
        const sendUpdates = attendees.length > 0 && isFirstTarget ? "all" : "none";
        isFirstTarget = false;
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${sendUpdates}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          failures.push(`${conn.google_email}/${calendarId}: ${res.status} ${await res.text()}`);
          continue;
        }
        const created = await res.json() as { id: string; htmlLink: string };
        createdCount++;
        if (!first) first = created;
        if (data.interactionId) {
          tracking.push({
            interaction_id: data.interactionId,
            connection_id: conn.id,
            calendar_id: calendarId,
            google_event_id: created.id,
          });
        }
      }
    }

    if (!first) throw new Error(`Google Calendar falhou — ${failures.join(" | ")}`);

    if (tracking.length > 0) {
      await supabaseAdmin
        .from("google_calendar_events")
        .upsert(tracking, { onConflict: "interaction_id,connection_id,calendar_id" });
    }

    return {
      eventId: first.id,
      htmlLink: first.htmlLink,
      invited: attendees.length > 0,
      calendarsCreated: createdCount,
      failures,
    };
  });

export const updateGoogleCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    candidateId: z.string().uuid(),
    interactionId: z.string().uuid().optional(),
    oldStartISO: z.string().min(1),
    newStartISO: z.string().min(1),
    durationMinutes: z.number().int().min(5).max(480).default(30),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const conns = await listConnections(context.userId, { syncOut: true });
    if (conns.length === 0) throw new Error("Google Calendar não conectado");

    const { data: cand } = await supabaseAdmin
      .from("broker_candidates")
      .select("name")
      .eq("id", data.candidateId)
      .maybeSingle();
    if (!cand) throw new Error("Candidato não encontrado");

    const tracked = data.interactionId ? await trackedEvents(data.interactionId) : new Map<string, string>();
    const newStart = new Date(data.newStartISO);
    const newEnd = new Date(newStart.getTime() + data.durationMinutes * 60_000);

    let updatedCount = 0;
    const failures: string[] = [];
    let isFirstTarget = true;

    for (const conn of conns) {
      let accessToken: string;
      try {
        accessToken = await freshTokenFor(conn);
      } catch (err) {
        failures.push(`${conn.google_email}: ${(err as Error).message}`);
        continue;
      }
      for (const calendarId of connectionCalendarIds(conn)) {
        const sendUpdates = isFirstTarget ? "all" : "none";
        isFirstTarget = false;
        try {
          const eventId = await resolveEventId(conn, calendarId, accessToken, tracked, cand.name, data.oldStartISO);
          if (!eventId) continue;
          const patchRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=${sendUpdates}`,
            {
              method: "PATCH",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                start: { dateTime: newStart.toISOString(), timeZone: "America/Sao_Paulo" },
                end: { dateTime: newEnd.toISOString(), timeZone: "America/Sao_Paulo" },
              }),
            },
          );
          if (!patchRes.ok) {
            failures.push(`${conn.google_email}/${calendarId}: ${patchRes.status} ${await patchRes.text()}`);
            continue;
          }
          updatedCount++;
        } catch (err) {
          failures.push(`${conn.google_email}/${calendarId}: ${(err as Error).message}`);
        }
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
    interactionId: z.string().uuid().optional(),
    startISO: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const conns = await listConnections(context.userId, { syncOut: true });
    if (conns.length === 0) throw new Error("Google Calendar não conectado");

    const { data: cand } = await supabaseAdmin
      .from("broker_candidates")
      .select("name")
      .eq("id", data.candidateId)
      .maybeSingle();
    if (!cand) throw new Error("Candidato não encontrado");

    const tracked = data.interactionId ? await trackedEvents(data.interactionId) : new Map<string, string>();
    let deletedCount = 0;
    const failures: string[] = [];
    let isFirstTarget = true;

    for (const conn of conns) {
      let accessToken: string;
      try {
        accessToken = await freshTokenFor(conn);
      } catch (err) {
        failures.push(`${conn.google_email}: ${(err as Error).message}`);
        continue;
      }
      for (const calendarId of connectionCalendarIds(conn)) {
        const sendUpdates = isFirstTarget ? "all" : "none";
        isFirstTarget = false;
        try {
          const eventId = await resolveEventId(conn, calendarId, accessToken, tracked, cand.name, data.startISO);
          if (!eventId) continue;
          const delRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=${sendUpdates}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (!delRes.ok && delRes.status !== 410) {
            failures.push(`${conn.google_email}/${calendarId}: ${delRes.status} ${await delRes.text()}`);
            continue;
          }
          deletedCount++;
        } catch (err) {
          failures.push(`${conn.google_email}/${calendarId}: ${(err as Error).message}`);
        }
      }
    }

    if (data.interactionId && deletedCount > 0) {
      await supabaseAdmin.from("google_calendar_events").delete().eq("interaction_id", data.interactionId);
    }

    if (deletedCount === 0 && failures.length > 0) {
      throw new Error(`Google Calendar falhou — ${failures.join(" | ")}`);
    }
    return { deleted: deletedCount > 0, deletedCount, failures };
  });
