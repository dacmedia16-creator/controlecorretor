export const GCAL_RECONNECT_MESSAGE =
  "Sua conexão com o Google Calendar expirou. Reconecte na página de Recrutamento.";

export function isGcalReconnectError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return msg.includes("GCAL_RECONNECT") || msg.includes("invalid_grant");
}

export function gcalErrorMessage(e: unknown, prefix: string): string {
  if (isGcalReconnectError(e)) {
    return `${prefix}: ${GCAL_RECONNECT_MESSAGE}`;
  }
  const msg = e instanceof Error ? e.message : "erro";
  return `${prefix}: ${msg}`;
}
