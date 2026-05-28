import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

function callbackRedirectUri(): string {
  const req = getRequest();
  const url = new URL(req.url);
  return `${url.origin}/oauth/google-calendar/callback`;
}

function signingKey(): string {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY not configured");
  return k;
}

function signState(payload: { uid: string; nonce: string; exp: number; redirect: string }): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString("base64url");
  const sig = createHmac("sha256", signingKey()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verifyState(state: string): { uid: string; redirect: string } {
  const [b64, sig] = state.split(".");
  if (!b64 || !sig) throw new Error("Invalid state");
  const expected = createHmac("sha256", signingKey()).update(b64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid state signature");
  const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as {
    uid: string; nonce: string; exp: number; redirect: string;
  };
  if (Date.now() > payload.exp) throw new Error("State expired");
  return { uid: payload.uid, redirect: payload.redirect };
}

export const startGoogleCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID não configurado");
    const redirectUri = callbackRedirectUri();
    const state = signState({
      uid: userId,
      nonce: randomBytes(16).toString("hex"),
      exp: Date.now() + 10 * 60 * 1000,
      redirect: redirectUri,
    });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
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

// Exported for use by the OAuth callback server route.
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
  const existing = await supabaseAdmin
    .from("user_google_calendar_connections")
    .select("refresh_token")
    .eq("user_id", uid)
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
    }, { onConflict: "user_id" });
  if (error) throw new Error(`Save failed: ${error.message}`);
  return { uid };
}

async function getFreshAccessToken(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("user_google_calendar_connections")
    .select("access_token,refresh_token,expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Google Calendar não conectado");

  const expiresAt = new Date(data.expires_at).getTime();
  if (Date.now() < expiresAt - 60_000) return data.access_token;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`Refresh falhou: ${tokenRes.status} ${t}`);
  }
  const refreshed = await tokenRes.json() as { access_token: string; expires_in: number };
  const newExpiresAt = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString();
  await supabaseAdmin
    .from("user_google_calendar_connections")
    .update({ access_token: refreshed.access_token, expires_at: newExpiresAt })
    .eq("user_id", userId);
  return refreshed.access_token;
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
