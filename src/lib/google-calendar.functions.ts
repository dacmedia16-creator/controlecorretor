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
  listRecruitmentConnections,
  getConnection,
  connectionCalendarIds,
  freshTokenFor,
  serviceAccountKey,
  serviceAccountToken,
  logSync,
  runWriteTest,
  recentSyncLog,
  listPendingInterviews,
  syncNextPendingInterview,

  type GcalConnection,
} from "./google-calendar.server";

export const startGoogleCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    returnPath: z.string().optional(),
  }).optional().parse(d ?? undefined))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID não configurado");
    const redirectUri = callbackRedirectUri();
    const rawReturn = data?.returnPath;
    const returnPath = rawReturn && rawReturn.startsWith("/") && !rawReturn.startsWith("//")
      ? rawReturn
      : undefined;
    const state = signState({
      uid: userId,
      nonce: newNonce(),
      exp: Date.now() + 10 * 60 * 1000,
      redirect: redirectUri,
      returnPath,
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
    const conns = await listRecruitmentConnections(context.userId);
    const writable = conns.filter((c) => c.sync_out);
    const first = writable[0] ?? conns[0] ?? null;
    return {
      connected: writable.length > 0,
      accountsCount: conns.length,
      google_email: first?.google_email ?? null,
      calendar_ids: first ? connectionCalendarIds(first) : ["primary"],
      writeTargets: writable.map((c) => c.display_name ?? c.google_email),
      readOnlyTargets: conns.filter((c) => !c.sync_out).map((c) => c.display_name ?? c.google_email),
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
        auth_type: c.auth_type ?? "oauth",
        display_name: c.display_name,
        service_account_email: c.service_account_email,
      })),
    };
  });

/** E-mail da conta de serviço, para o admin compartilhar a agenda com ele. */
export const getServiceAccountInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    try {
      const { client_email } = serviceAccountKey();
      return { available: true as const, email: client_email, error: null as string | null };
    } catch (err) {
      return { available: false as const, email: null, error: (err as Error).message };
    }
  });

async function assertCanManageServiceCalendar(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r) => r.role as string);
  if (!roles.includes("admin") && !roles.includes("gerente_recrutamento")) {
    throw new Error("Apenas administradores podem conectar uma agenda de serviço.");
  }
}

/** Conecta um calendário compartilhado com a conta de serviço (sem OAuth do usuário). */
export const connectServiceCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    calendarId: z.string().trim().min(3).max(200),
    displayName: z.string().trim().max(100).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCanManageServiceCalendar(context.userId);
    const { client_email } = serviceAccountKey();
    const accessToken = await serviceAccountToken();

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(data.calendarId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.status === 404 || res.status === 403) {
      throw new Error(
        `A conta de serviço não tem acesso a "${data.calendarId}". No Google Agenda, abra as configurações desse calendário, ` +
        `em "Compartilhado com" adicione ${client_email} e salve. Depois tente novamente.`,
      );
    }
    if (!res.ok) {
      throw new Error(`Google Calendar API ${res.status}: ${await res.text()}`);
    }
    const cal = await res.json() as { id: string; summary?: string };

    // Descobre o nível de acesso: "writer"/"owner" permitem criar eventos;
    // "reader"/"freeBusyReader" só permitem leitura (comum em organizações
    // que restringem o compartilhamento externo de agendas).
    // A listagem de eventos retorna accessRole mesmo para contas de serviço
    // (o endpoint calendarList responde 404 porque a agenda não é "assinada").
    let writable = false;
    try {
      const roleRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?maxResults=1`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (roleRes.ok) {
        const body = await roleRes.json() as { accessRole?: string };
        writable = body.accessRole === "writer" || body.accessRole === "owner";
      }
    } catch {
      writable = false;
    }


    const { error } = await supabaseAdmin
      .from("user_google_calendar_connections")
      .upsert({
        user_id: context.userId,
        google_email: cal.id,
        auth_type: "service_account",
        service_account_email: client_email,
        display_name: data.displayName?.trim() || cal.summary || cal.id,
        calendar_ids: [cal.id],
        sync_in: true,
        sync_out: writable,
        access_token: null,
        refresh_token: null,
        expires_at: null,
      }, { onConflict: "user_id,google_email" });
    if (error) throw new Error(error.message);
    return { ok: true, calendarName: cal.summary ?? cal.id, writable };
  });


export const listMyGoogleCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ connectionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await getConnection(context.userId, data.connectionId);
    const accessToken = await freshTokenFor(conn);
    // Conta de serviço não tem "calendarList": mostramos o(s) calendário(s) compartilhado(s).
    if (conn.auth_type === "service_account") {
      return {
        calendars: connectionCalendarIds(conn).map((id) => ({
          id,
          name: conn.display_name ?? id,
          primary: false,
        })),
      };
    }

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
    const patch: { calendar_ids?: string[]; sync_out?: boolean; sync_in?: boolean } = {};
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
    const conns = await listRecruitmentConnections(context.userId, { syncIn: true });
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
    const conns = await listRecruitmentConnections(context.userId, { syncOut: true });
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

    const baseBody = {
      summary: `Entrevista — ${cand.name}`,
      description: [
        `Candidato: ${cand.name}`,
        cand.phone ? `Telefone: ${cand.phone}` : null,
        cand.email ? `Email: ${cand.email}` : null,
        data.extraNotes ? `\n${data.extraNotes}` : null,
      ].filter(Boolean).join("\n"),
      start: { dateTime: start.toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" },
      reminders: { useDefault: true },
    };

    let first: { id: string; htmlLink: string } | null = null;
    let createdCount = 0;
    const failures: string[] = [];
    const targets: string[] = [];
    const tracking: Array<{
      interaction_id: string; connection_id: string; calendar_id: string; google_event_id: string;
    }> = [];
    let isFirstOauthTarget = true;
    let invited = false;

    for (const conn of conns) {
      let accessToken: string;
      try {
        accessToken = await freshTokenFor(conn);
      } catch (err) {
        const msg = (err as Error).message;
        failures.push(`${conn.google_email}: ${msg}`);
        await logSync([{
          user_id: context.userId, connection_id: conn.id, google_email: conn.google_email,
          operation: "create", ok: false, error: msg, interaction_id: data.interactionId ?? null,
        }]);
        continue;
      }
      // Contas de serviço não podem convidar participantes sem Domain-Wide
      // Delegation (403 forbiddenForServiceAccounts): enviamos sem attendees.
      const isServiceAccount = conn.auth_type === "service_account";
      for (const calendarId of connectionCalendarIds(conn)) {
        // Convite ao candidato apenas no primeiro destino OAuth, para não duplicar e-mails.
        const canInvite = !isServiceAccount && attendees.length > 0 && isFirstOauthTarget;
        if (!isServiceAccount) isFirstOauthTarget = false;
        const sendUpdates = canInvite ? "all" : "none";
        const body = canInvite ? { ...baseBody, attendees } : baseBody;
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${sendUpdates}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          const errText = await res.text();
          failures.push(`${conn.google_email}/${calendarId}: ${res.status} ${errText}`);
          await logSync([{
            user_id: context.userId, connection_id: conn.id, calendar_id: calendarId,
            google_email: conn.google_email, operation: "create", ok: false,
            http_status: res.status, error: errText, interaction_id: data.interactionId ?? null,
          }]);
          continue;
        }
        const created = await res.json() as { id: string; htmlLink: string };
        createdCount++;
        if (canInvite) invited = true;
        if (!first) first = created;
        targets.push(`${conn.display_name ?? conn.google_email} (${calendarId})`);
        await logSync([{
          user_id: context.userId, connection_id: conn.id, calendar_id: calendarId,
          google_email: conn.google_email, operation: "create", ok: true,
          http_status: res.status, interaction_id: data.interactionId ?? null,
        }]);
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
      invited,
      calendarsCreated: createdCount,
      targets,
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
    const conns = await listRecruitmentConnections(context.userId, { syncOut: true });
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
        const sendUpdates = isFirstTarget && conn.auth_type !== "service_account" ? "all" : "none";
        if (conn.auth_type !== "service_account") isFirstTarget = false;
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
    const conns = await listRecruitmentConnections(context.userId, { syncOut: true });
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
        const sendUpdates = isFirstTarget && conn.auth_type !== "service_account" ? "all" : "none";
        if (conn.auth_type !== "service_account") isFirstTarget = false;
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

/** Localiza a conexão (própria ou compartilhada) que o usuário pode operar. */
async function resolveRawConnection(userId: string, connectionId: string, calendarId: string) {
  const conns = await listRecruitmentConnections(userId);
  const conn = conns.find((c) => c.id === connectionId);
  if (!conn) throw new Error("Agenda do Google não disponível para este usuário");
  if (!connectionCalendarIds(conn).includes(calendarId)) {
    throw new Error("Agenda do Google não encontrada nesta conexão");
  }
  return conn;
}

/** Move/redimensiona um evento do Google diretamente (sem interação vinculada). */
export const patchRawGoogleEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    connectionId: z.string().uuid(),
    calendarId: z.string().min(1),
    eventId: z.string().min(1),
    startISO: z.string().min(1),
    durationMinutes: z.number().int().min(5).max(1440).default(30),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await resolveRawConnection(context.userId, data.connectionId, data.calendarId);
    const accessToken = await freshTokenFor(conn);
    const start = new Date(data.startISO);
    const end = new Date(start.getTime() + data.durationMinutes * 60_000);

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(data.calendarId)}/events/${encodeURIComponent(data.eventId)}?sendUpdates=none`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          start: { dateTime: start.toISOString(), timeZone: "America/Sao_Paulo" },
          end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" },
        }),
      },
    );
    const bodyText = res.ok ? null : (await res.text()).slice(0, 500);
    await logSync([{
      user_id: context.userId,
      connection_id: conn.id,
      calendar_id: data.calendarId,
      google_email: conn.google_email,
      operation: "update",
      ok: res.ok,
      http_status: res.status,
      error: bodyText,
    }]);
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error("Sem permissão de escrita nesta agenda do Google");
      }
      throw new Error(`Google Calendar ${res.status}: ${bodyText ?? "falhou"}`);
    }
    return { ok: true };
  });

/** Exclui um evento do Google diretamente (sem interação vinculada). */
export const deleteRawGoogleEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    connectionId: z.string().uuid(),
    calendarId: z.string().min(1),
    eventId: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await resolveRawConnection(context.userId, data.connectionId, data.calendarId);
    const accessToken = await freshTokenFor(conn);

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(data.calendarId)}/events/${encodeURIComponent(data.eventId)}?sendUpdates=none`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const gone = res.status === 404 || res.status === 410;
    const bodyText = res.ok || gone ? null : (await res.text()).slice(0, 500);
    await logSync([{
      user_id: context.userId,
      connection_id: conn.id,
      calendar_id: data.calendarId,
      google_email: conn.google_email,
      operation: "delete",
      ok: res.ok || gone,
      http_status: res.status,
      error: bodyText,
    }]);
    if (!res.ok && !gone) {
      if (res.status === 403) {
        throw new Error("Sem permissão de escrita nesta agenda do Google");
      }
      throw new Error(`Google Calendar ${res.status}: ${bodyText ?? "falhou"}`);
    }
    await supabaseAdmin
      .from("google_calendar_events")
      .delete()
      .eq("connection_id", conn.id)
      .eq("calendar_id", data.calendarId)
      .eq("google_event_id", data.eventId);
    return { ok: true, alreadyGone: gone };
  });

/** Cria um evento de teste em cada agenda com envio ligado e devolve o erro exato do Google. */

export const testGoogleCalendarWrite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ keepEvent: z.boolean().default(false) }).optional().parse(d ?? undefined))
  .handler(async ({ data, context }) => {
    await assertCanManageServiceCalendar(context.userId);
    return runWriteTest(context.userId, data?.keepEvent ?? false);
  });

/** Últimas tentativas de sincronização com o Google Agenda. */
export const listGoogleSyncLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(50).default(15) }).optional().parse(d ?? undefined))
  .handler(async ({ data, context }) => {
    const entries = await recentSyncLog(context.userId, data?.limit ?? 15);
    return { entries };
  });

/** Entrevistas futuras que ainda não foram criadas no Google Agenda. */
export const listPendingInterviewSync = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const pending = await listPendingInterviews(context.userId, 20);
    return { count: pending.length, pending };
  });

/** Reenvia a próxima entrevista pendente para as agendas com envio ligado. */
export const syncNextPendingInterviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => syncNextPendingInterview(context.userId));
