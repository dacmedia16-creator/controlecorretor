import { getRequest } from "@tanstack/react-start/server";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
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

export function signState(payload: { uid: string; nonce: string; exp: number; redirect: string }): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString("base64url");
  const sig = createHmac("sha256", signingKey()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function newNonce(): string {
  return randomBytes(16).toString("hex");
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

export async function getFreshAccessToken(userId: string): Promise<string> {
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
