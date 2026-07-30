import { getRequest } from "@tanstack/react-start/server";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

export function callbackRedirectUri(): string {
  const req = getRequest();
  const url = new URL(req.url);
  return `${url.origin}/oauth/google-calendar/callback`;
}

function signingKey(): string {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY not configured");
  return k;
}

export function signState(payload: { uid: string; nonce: string; exp: number; redirect: string; returnPath?: string }): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString("base64url");
  const sig = createHmac("sha256", signingKey()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}

function verifyState(state: string): { uid: string; redirect: string; returnPath: string | null } {
  const [b64, sig] = state.split(".");
  if (!b64 || !sig) throw new Error("Invalid state");
  const expected = createHmac("sha256", signingKey()).update(b64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid state signature");
  const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as {
    uid: string; nonce: string; exp: number; redirect: string; returnPath?: string;
  };
  if (Date.now() > payload.exp) throw new Error("State expired");
  return { uid: payload.uid, redirect: payload.redirect, returnPath: payload.returnPath ?? null };
}

/** Caminho interno (same-origin) para onde voltar depois do consentimento. */
export function stateReturnPath(state: string): string | null {
  try {
    const { returnPath } = verifyState(state);
    if (!returnPath || !returnPath.startsWith("/") || returnPath.startsWith("//")) return null;
    return returnPath;
  } catch {
    return null;
  }
}

export async function exchangeCodeAndStore(code: string, state: string): Promise<{ uid: string }> {
  const { uid, redirect } = verifyState(state);
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`Token exchange failed: ${tokenRes.status} ${t}`);
  }
  const tokens = await tokenRes.json() as {
    access_token: string; refresh_token?: string; expires_in: number;
  };
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userInfoRes.ok) throw new Error("userinfo failed");
  const userInfo = await userInfoRes.json() as { email: string };

  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
  // Conexão por (usuário do app + conta Google) — permite várias contas Google.
  const existing = await supabaseAdmin
    .from("user_google_calendar_connections")
    .select("refresh_token")
    .eq("user_id", uid)
    .eq("google_email", userInfo.email)
    .maybeSingle();
  const refreshToken = tokens.refresh_token ?? existing.data?.refresh_token;
  if (!refreshToken) {
    throw new Error("Google não retornou refresh_token. Revogue o acesso e tente novamente.");
  }

  const { error } = await supabaseAdmin
    .from("user_google_calendar_connections")
    .upsert({
      user_id: uid,
      google_email: userInfo.email,
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      expires_at: expiresAt,
    }, { onConflict: "user_id,google_email" });
  if (error) throw new Error(`Save failed: ${error.message}`);
  return { uid };
}

export const GCAL_RECONNECT_ERROR =
  "GCAL_RECONNECT: Sua conexão com o Google Calendar expirou. Reconecte na página de Recrutamento.";

export type GcalConnection = {
  id: string;
  user_id: string;
  google_email: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  calendar_ids: string[] | null;
  sync_out: boolean;
  sync_in: boolean;
  auth_type: "oauth" | "service_account";
  service_account_email: string | null;
  display_name: string | null;
};

const CONNECTION_COLUMNS =
  "id,user_id,google_email,access_token,refresh_token,expires_at,calendar_ids,sync_out,sync_in,auth_type,service_account_email,display_name";

// ---------- Conta de serviço (Service Account) ----------

type ServiceAccountKey = { client_email: string; private_key: string };

export function serviceAccountKey(): ServiceAccountKey {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw || !raw.trim()) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não configurado no backend.");
  }
  let parsed: Partial<ServiceAccountKey> & { type?: string };
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON inválido: cole o conteúdo completo do arquivo JSON da chave da conta de serviço.",
    );
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON incompleto: faltam os campos client_email e/ou private_key.",
    );
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

function b64url(input: string | Uint8Array): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buf.toString("base64url");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bytes = Buffer.from(body, "base64");
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

let saTokenCache: { token: string; exp: number } | null = null;

/** Access token da conta de serviço (JWT assinado com WebCrypto RS256). */
export async function serviceAccountToken(): Promise<string> {
  if (saTokenCache && Date.now() < saTokenCache.exp) return saTokenCache.token;

  const { client_email, private_key } = serviceAccountKey();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${b64url(new Uint8Array(signature))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Falha ao autenticar a conta de serviço do Google: ${res.status} ${t}`);
  }
  const json = await res.json() as { access_token: string; expires_in: number };
  saTokenCache = { token: json.access_token, exp: Date.now() + (json.expires_in - 300) * 1000 };
  return json.access_token;
}


export async function listConnections(
  userId: string,
  filter?: { syncOut?: boolean; syncIn?: boolean },
): Promise<GcalConnection[]> {
  let q = supabaseAdmin
    .from("user_google_calendar_connections")
    .select(CONNECTION_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (filter?.syncOut) q = q.eq("sync_out", true);
  if (filter?.syncIn) q = q.eq("sync_in", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as GcalConnection[];
}

const RECRUITMENT_CALENDAR_ROLES = new Set(["admin", "gerente_recrutamento", "recrutador"]);

async function recruitmentCalendarRole(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.role as string);
}

/**
 * Agendas disponíveis para o recrutamento: conexões pessoais do usuário e
 * agendas de serviço compartilhadas configuradas por um administrador.
 */
export async function listRecruitmentConnections(
  userId: string,
  filter?: { syncOut?: boolean; syncIn?: boolean },
): Promise<GcalConnection[]> {
  const roles = await recruitmentCalendarRole(userId);
  if (!roles.some((role) => RECRUITMENT_CALENDAR_ROLES.has(role))) return [];

  const own = await listConnections(userId, filter);
  let sharedQuery = supabaseAdmin
    .from("user_google_calendar_connections")
    .select(CONNECTION_COLUMNS)
    .eq("auth_type", "service_account")
    .order("created_at", { ascending: true });
  if (filter?.syncOut) sharedQuery = sharedQuery.eq("sync_out", true);
  if (filter?.syncIn) sharedQuery = sharedQuery.eq("sync_in", true);
  const { data, error } = await sharedQuery;
  if (error) throw new Error(error.message);

  const byId = new Map<string, GcalConnection>();
  for (const connection of [...own, ...((data ?? []) as GcalConnection[])]) {
    byId.set(connection.id, connection);
  }
  return [...byId.values()];
}

async function canViewAllRecruitmentInterviews(userId: string): Promise<boolean> {
  const roles = await recruitmentCalendarRole(userId);
  return roles.includes("admin") || roles.includes("gerente_recrutamento");
}

export async function getConnection(userId: string, connectionId: string): Promise<GcalConnection> {
  const { data, error } = await supabaseAdmin
    .from("user_google_calendar_connections")
    .select(CONNECTION_COLUMNS)
    .eq("user_id", userId)
    .eq("id", connectionId)
    .maybeSingle();
  if (error || !data) throw new Error("Conexão do Google Calendar não encontrada");
  return data as GcalConnection;
}

export function connectionCalendarIds(conn: GcalConnection): string[] {
  const ids = (conn.calendar_ids ?? []).filter(Boolean);
  return ids.length > 0 ? ids : ["primary"];
}

/** Token válido para uma conexão específica (renova e persiste quando necessário). */
export async function freshTokenFor(conn: GcalConnection): Promise<string> {
  if (conn.auth_type === "service_account") return serviceAccountToken();

  const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
  if (conn.access_token && Date.now() < expiresAt - 60_000) return conn.access_token;
  if (!conn.refresh_token) throw new Error(GCAL_RECONNECT_ERROR);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    if (t.includes("invalid_grant")) {
      await supabaseAdmin
        .from("user_google_calendar_connections")
        .delete()
        .eq("id", conn.id);
      throw new Error(GCAL_RECONNECT_ERROR);
    }
    throw new Error(`Refresh falhou: ${tokenRes.status} ${t}`);
  }
  const refreshed = await tokenRes.json() as { access_token: string; expires_in: number };
  const newExpiresAt = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString();
  await supabaseAdmin
    .from("user_google_calendar_connections")
    .update({ access_token: refreshed.access_token, expires_at: newExpiresAt })
    .eq("id", conn.id);
  return refreshed.access_token;
}

/** Compat: token da primeira conexão do usuário. */
export async function getFreshAccessToken(userId: string): Promise<string> {
  const conns = await listConnections(userId);
  if (conns.length === 0) throw new Error("Google Calendar não conectado");
  return freshTokenFor(conns[0]);
}

export async function getTargetCalendarIds(userId: string): Promise<string[]> {
  const conns = await listConnections(userId);
  if (conns.length === 0) return ["primary"];
  return connectionCalendarIds(conns[0]);
}

// ===== Registro de sincronização =====

export type SyncLogEntry = {
  user_id: string;
  connection_id?: string | null;
  calendar_id?: string | null;
  google_email?: string | null;
  operation: "create" | "update" | "delete" | "test";
  ok: boolean;
  http_status?: number | null;
  error?: string | null;
  interaction_id?: string | null;
};

/** Grava tentativas de sincronização (nunca lança: log não pode quebrar o fluxo). */
export async function logSync(entries: SyncLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    await supabaseAdmin.from("google_calendar_sync_log").insert(entries);
  } catch {
    /* ignore */
  }
}

/** Cria (e opcionalmente apaga) um evento de teste em cada agenda com envio ligado. */
export async function runWriteTest(userId: string, keepEvent: boolean) {
  const conns = await listConnections(userId, { syncOut: true });
  const results: Array<{
    calendarId: string;
    label: string;
    ok: boolean;
    status: number | null;
    error: string | null;
    eventId: string | null;
    htmlLink: string | null;
  }> = [];

  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 15 * 60_000);

  for (const conn of conns) {
    let accessToken: string;
    try {
      accessToken = await freshTokenFor(conn);
    } catch (err) {
      for (const calendarId of connectionCalendarIds(conn)) {
        results.push({
          calendarId,
          label: conn.display_name ?? conn.google_email,
          ok: false,
          status: null,
          error: (err as Error).message,
          eventId: null,
          htmlLink: null,
        });
      }
      continue;
    }

    for (const calendarId of connectionCalendarIds(conn)) {
      const label = conn.display_name ?? conn.google_email;
      try {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              summary: "Teste de integração — Controle Corretor",
              description: "Evento de teste criado pelo sistema para validar o envio ao Google Agenda.",
              start: { dateTime: start.toISOString(), timeZone: "America/Sao_Paulo" },
              end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" },
              reminders: { useDefault: false },
            }),
          },
        );
        if (!res.ok) {
          const errText = await res.text();
          results.push({ calendarId, label, ok: false, status: res.status, error: errText, eventId: null, htmlLink: null });
          await logSync([{
            user_id: userId, connection_id: conn.id, calendar_id: calendarId,
            google_email: conn.google_email, operation: "test", ok: false,
            http_status: res.status, error: errText,
          }]);
          continue;
        }
        const created = await res.json() as { id: string; htmlLink: string };
        if (!keepEvent) {
          await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${created.id}?sendUpdates=none`,
            { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
          );
        }
        results.push({
          calendarId, label, ok: true, status: res.status, error: null,
          eventId: created.id, htmlLink: keepEvent ? created.htmlLink : null,
        });
        await logSync([{
          user_id: userId, connection_id: conn.id, calendar_id: calendarId,
          google_email: conn.google_email, operation: "test", ok: true, http_status: res.status,
        }]);
      } catch (err) {
        const msg = (err as Error).message;
        results.push({ calendarId, label, ok: false, status: null, error: msg, eventId: null, htmlLink: null });
        await logSync([{
          user_id: userId, connection_id: conn.id, calendar_id: calendarId,
          google_email: conn.google_email, operation: "test", ok: false, error: msg,
        }]);
      }
    }
  }

  return { writableConnections: conns.length, results, keptEvent: keepEvent };
}

/** Últimas tentativas de sincronização do usuário. */
export async function recentSyncLog(userId: string, limit: number) {
  const { data, error } = await supabaseAdmin
    .from("google_calendar_sync_log")
    .select("id,calendar_id,google_email,operation,ok,http_status,error,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ===== Entrevistas pendentes de envio ao Google =====

export type PendingInterview = {
  interactionId: string;
  candidateId: string;
  candidateName: string;
  startISO: string;
  notes: string | null;
};

/** Entrevistas futuras do usuário que ainda não têm evento criado no Google. */
export async function listPendingInterviews(userId: string, limit = 20): Promise<PendingInterview[]> {
  let query = supabaseAdmin
    .from("broker_candidate_interactions")
    .select("id,candidate_id,notes,next_follow_up_date")
    .eq("interaction_type", "entrevista")
    .gte("next_follow_up_date", new Date().toISOString())
    .order("next_follow_up_date", { ascending: true })
    .limit(limit);
  if (!(await canViewAllRecruitmentInterviews(userId))) query = query.eq("user_id", userId);
  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  const list = (rows ?? []).filter((r) => !!r.next_follow_up_date);
  if (list.length === 0) return [];

  const { data: synced } = await supabaseAdmin
    .from("google_calendar_events")
    .select("interaction_id")
    .in("interaction_id", list.map((r) => r.id));
  const done = new Set((synced ?? []).map((s) => s.interaction_id));
  const pending = list.filter((r) => !done.has(r.id));
  if (pending.length === 0) return [];

  const { data: cands } = await supabaseAdmin
    .from("broker_candidates")
    .select("id,name")
    .in("id", pending.map((p) => p.candidate_id));
  const nameById = new Map((cands ?? []).map((c) => [c.id, c.name as string]));

  return pending.map((p) => ({
    interactionId: p.id,
    candidateId: p.candidate_id,
    candidateName: nameById.get(p.candidate_id) ?? "Candidato",
    startISO: p.next_follow_up_date as string,
    notes: p.notes ?? null,
  }));
}

/** Reenvia a próxima entrevista pendente para todas as agendas com envio ligado. */
export async function syncNextPendingInterview(userId: string) {
  const pending = await listPendingInterviews(userId, 20);
  if (pending.length === 0) {
    return { synced: false as const, remaining: 0, interview: null, targets: [] as string[], failures: [] as string[] };
  }
  const next = pending[0];

  const conns = await listRecruitmentConnections(userId, { syncOut: true });
  if (conns.length === 0) throw new Error("Nenhuma agenda com envio ligado — ative \"Enviar compromissos\" em uma agenda com permissão de escrita.");

  const { data: cand } = await supabaseAdmin
    .from("broker_candidates")
    .select("name,email,phone")
    .eq("id", next.candidateId)
    .maybeSingle();

  const start = new Date(next.startISO);
  const end = new Date(start.getTime() + 30 * 60_000);
  const body = {
    summary: `Entrevista — ${cand?.name ?? next.candidateName}`,
    description: [
      `Candidato: ${cand?.name ?? next.candidateName}`,
      cand?.phone ? `Telefone: ${cand.phone}` : null,
      cand?.email ? `Email: ${cand.email}` : null,
      next.notes ? `\n${next.notes}` : null,
    ].filter(Boolean).join("\n"),
    start: { dateTime: start.toISOString(), timeZone: "America/Sao_Paulo" },
    end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" },
    reminders: { useDefault: true },
  };

  const targets: string[] = [];
  const failures: string[] = [];
  const tracking: Array<{ interaction_id: string; connection_id: string; calendar_id: string; google_event_id: string }> = [];

  for (const conn of conns) {
    let accessToken: string;
    try {
      accessToken = await freshTokenFor(conn);
    } catch (err) {
      const msg = (err as Error).message;
      failures.push(`${conn.google_email}: ${msg}`);
      await logSync([{
        user_id: userId, connection_id: conn.id, google_email: conn.google_email,
        operation: "create", ok: false, error: msg, interaction_id: next.interactionId,
      }]);
      continue;
    }
    for (const calendarId of connectionCalendarIds(conn)) {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
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
          user_id: userId, connection_id: conn.id, calendar_id: calendarId,
          google_email: conn.google_email, operation: "create", ok: false,
          http_status: res.status, error: errText, interaction_id: next.interactionId,
        }]);
        continue;
      }
      const created = await res.json() as { id: string };
      targets.push(`${conn.display_name ?? conn.google_email} (${calendarId})`);
      tracking.push({
        interaction_id: next.interactionId,
        connection_id: conn.id,
        calendar_id: calendarId,
        google_event_id: created.id,
      });
      await logSync([{
        user_id: userId, connection_id: conn.id, calendar_id: calendarId,
        google_email: conn.google_email, operation: "create", ok: true,
        http_status: res.status, interaction_id: next.interactionId,
      }]);
    }
  }

  if (tracking.length > 0) {
    await supabaseAdmin
      .from("google_calendar_events")
      .upsert(tracking, { onConflict: "interaction_id,connection_id,calendar_id" });
  }

  return {
    synced: tracking.length > 0,
    remaining: Math.max(0, pending.length - (tracking.length > 0 ? 1 : 0)),
    interview: {
      candidateName: cand?.name ?? next.candidateName,
      startISO: next.startISO,
    },
    targets,
    failures,
  };
}
