import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export type RecruiterNotification = {
  id: string;
  user_id: string;
  candidate_id: string | null;
  lead_id: string | null;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
};

const SOUND_KEY = "notifications_sound_enabled";

function playBeep() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
    o.onended = () => ctx.close();
  } catch {
    /* noop */
  }
}

export function useRecruiterNotifications() {
  const { user, role } = useAuth();
  const [items, setItems] = useState<RecruiterNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(SOUND_KEY) !== "false";
  });
  const initialized = useRef(false);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const enabled = !!user && (role === "recrutador" || role === "admin" || role === "corretor");

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("recruiter_notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data as RecruiterNotification[]) ?? []);
    setLoading(false);
    initialized.current = true;
  }, [user]);

  useEffect(() => {
    if (!enabled) return;
    fetchAll();
  }, [enabled, fetchAll]);

  useEffect(() => {
    if (!enabled || !user) return;
    const channel = supabase
      .channel("recruiter-notifications-" + user.id + "-" + Math.random().toString(36).slice(2, 8))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "recruiter_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as RecruiterNotification;
          setItems((prev) => [n, ...prev].slice(0, 30));
          if (initialized.current) {
            toast.info(n.message, { duration: 6000 });
            if (soundEnabledRef.current) playBeep();
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, user]);

  const unreadCount = items.filter((i) => !i.read).length;

  const dismiss = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      await supabase.from("recruiter_notifications").delete().eq("id", id);
    },
    [],
  );

  const dismissAll = useCallback(async () => {
    if (!user) return;
    setItems([]);
    await supabase.from("recruiter_notifications").delete().eq("user_id", user.id);
  }, [user]);

  // Back-compat aliases
  const markAsRead = dismiss;
  const markAllAsRead = dismissAll;

  const toggleSound = useCallback(() => {
    setSoundEnabled((v) => {
      const next = !v;
      try {
        localStorage.setItem(SOUND_KEY, String(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  return { enabled, items, unreadCount, loading, markAsRead, markAllAsRead, soundEnabled, toggleSound };
}
