import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type FollowUpItem = {
  source: "lead" | "candidate";
  interaction_id: string;
  contact_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  scheduled_at: string;
};

export function useFollowUpToday() {
  const { user, role } = useAuth();
  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(false);
  const enabled = !!user;
  const isAdmin = role === "admin";

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const iso = todayEnd.toISOString();

    // Lead interactions
    const { data: leadInter } = await supabase
      .from("lead_interactions")
      .select("id, lead_id, notes, next_follow_up_date, leads:leads!inner(id, name, phone, assigned_to_user_id, created_by_user_id)")
      .not("next_follow_up_date", "is", null)
      .lte("next_follow_up_date", iso)
      .order("next_follow_up_date", { ascending: true });

    // Candidate interactions
    const { data: candInter } = await supabase
      .from("broker_candidate_interactions")
      .select("id, candidate_id, notes, next_follow_up_date, broker_candidates!inner(id, name, phone, assigned_to_user_id, created_by_user_id)")
      .not("next_follow_up_date", "is", null)
      .lte("next_follow_up_date", iso)
      .order("next_follow_up_date", { ascending: true });

    const result: FollowUpItem[] = [];
    // De-duplicate per contact: only the most recent (latest) follow-up shown
    const seenLead = new Set<string>();
    for (const row of (leadInter as any[]) ?? []) {
      const lead = row.leads;
      if (!lead) continue;
      if (!isAdmin && lead.assigned_to_user_id !== user.id && lead.created_by_user_id !== user.id) continue;
      if (seenLead.has(lead.id)) continue;
      seenLead.add(lead.id);
      result.push({
        source: "lead",
        interaction_id: row.id,
        contact_id: lead.id,
        name: lead.name,
        phone: lead.phone,
        notes: row.notes,
        scheduled_at: row.next_follow_up_date,
      });
    }
    const seenCand = new Set<string>();
    for (const row of (candInter as any[]) ?? []) {
      const c = row.broker_candidates;
      if (!c) continue;
      if (!isAdmin && c.assigned_to_user_id !== user.id && c.created_by_user_id !== user.id) continue;
      if (seenCand.has(c.id)) continue;
      seenCand.add(c.id);
      result.push({
        source: "candidate",
        interaction_id: row.id,
        contact_id: c.id,
        name: c.name,
        phone: c.phone,
        notes: row.notes,
        scheduled_at: row.next_follow_up_date,
      });
    }
    result.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    setItems(result);
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => {
    if (!enabled) return;
    load();
  }, [enabled, load]);

  return { enabled, items, count: items.length, loading, reload: load };
}
