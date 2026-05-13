import { supabase } from "@/integrations/supabase/client";

/** Atualiza o broker responsável (e opcionalmente o status) de N leads em lotes. */
export async function assignLeadsInChunks(
  ids: string[],
  userId: string,
  opts?: { chunkSize?: number; statusId?: string | null; onProgress?: (done: number, total: number) => void },
) {
  const chunkSize = opts?.chunkSize ?? 200;
  let done = 0;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const update = opts?.statusId
      ? { assigned_to_user_id: userId, status_id: opts.statusId }
      : { assigned_to_user_id: userId };
    const { error } = await supabase
      .from("leads")
      .update(update)
      .in("id", chunk);
    if (error) throw error;
    done += chunk.length;
    opts?.onProgress?.(done, ids.length);
    // Cede o thread para manter a UI responsiva
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** Busca o id do status "Distribuído para corretor" do Kanban Leads em Massa. */
export async function fetchBulkAssignedStatusId(): Promise<string | null> {
  const { data } = await supabase
    .from("kanban_statuses")
    .select("id,name")
    .eq("kanban_type", "bulk_leads")
    .eq("active", true);
  const list = data ?? [];
  const exact = list.find((s: any) => s.name === "Distribuído para corretor");
  return exact?.id ?? null;
}

/** Aplica várias atribuições agrupando por corretor. */
export async function applyAssignments(
  assignments: { id: string; userId: string }[],
  opts?: { onProgress?: (done: number, total: number) => void; statusId?: string | null },
) {
  if (assignments.length === 0) return;
  const byUser = new Map<string, string[]>();
  for (const a of assignments) {
    const arr = byUser.get(a.userId) ?? [];
    arr.push(a.id);
    byUser.set(a.userId, arr);
  }
  const total = assignments.length;
  let done = 0;
  for (const [userId, ids] of byUser) {
    await assignLeadsInChunks(ids, userId, {
      statusId: opts?.statusId ?? null,
      onProgress: (d) => opts?.onProgress?.(done + d, total),
    });
    done += ids.length;
  }
}

/** Conta leads por corretor via RPC seguro (admin-only no banco). */
export async function fetchBrokerLeadCounts(): Promise<Map<string, number>> {
  const { data, error } = await (supabase as any).rpc("get_broker_lead_counts");
  if (error) throw error;
  const map = new Map<string, number>();
  ((data ?? []) as Array<{ user_id: string; count: number }>).forEach((r) => {
    map.set(r.user_id, Number(r.count));
  });
  return map;
}

/** Conta leads sem responsável em um lote (admin-only). */
export async function fetchBatchUnassignedCount(batchId: string): Promise<number> {
  const { data, error } = await (supabase as any).rpc("get_batch_unassigned_count", {
    _batch_id: batchId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/** IDs de leads sem responsável em um lote, ordenados (admin-only). */
export async function fetchBatchUnassignedIds(batchId: string, limit: number): Promise<string[]> {
  const { data, error } = await (supabase as any).rpc("get_batch_unassigned_ids", {
    _batch_id: batchId,
    _limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}
