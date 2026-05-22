import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, MessageCircle, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useFollowUpToday, type FollowUpItem } from "@/hooks/useFollowUpToday";

const SESSION_KEY = "follow_up_auto_opened";

function whatsappUrl(phone: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const intl = digits.length <= 11 ? "55" + digits : digits;
  return `https://wa.me/${intl}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function FollowUpSidebar({ className }: { className?: string }) {
  const { enabled, items, count, loading, reload, dismiss } = useFollowUpToday();
  const [open, setOpen] = useState(false);

  // Auto-open once per session if there are items
  useEffect(() => {
    if (!enabled || count === 0) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") return;
      sessionStorage.setItem(SESSION_KEY, "1");
      setOpen(true);
    } catch {
      /* noop */
    }
  }, [enabled, count]);

  if (!enabled) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", className)}
          aria-label="Follow-ups do dia"
          title="Follow-ups do dia"
        >
          <CalendarClock className="size-5" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-left">Follow-ups do dia</SheetTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{count}</Badge>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void reload()} aria-label="Atualizar">
                <RefreshCw className={cn("size-4", loading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </SheetHeader>
        <ScrollArea className="flex-1">
          {count === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhum follow-up pendente para hoje.
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((it) => (
                <Row key={`${it.source}-${it.interaction_id}`} item={it} onAction={() => setOpen(false)} />
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function Row({ item, onAction }: { item: FollowUpItem; onAction: () => void }) {
  const wa = whatsappUrl(item.phone);
  const detailHref =
    item.source === "lead"
      ? { to: "/leads/$id" as const, params: { id: item.contact_id } }
      : { to: "/recrutamento/$id" as const, params: { id: item.contact_id } };
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{item.name || "(sem nome)"}</div>
          <div className="text-xs text-muted-foreground">{item.phone || "sem telefone"}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {item.source === "lead" ? "Lead" : "Candidato"} · {formatTime(item.scheduled_at)}
          </div>
          {item.notes && (
            <div className="text-xs mt-1.5 text-foreground/80 line-clamp-3">{item.notes}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Button size="sm" variant="outline" asChild onClick={onAction}>
          <Link {...detailHref}>
            <ExternalLink className="size-3.5 mr-1" /> Abrir
          </Link>
        </Button>
        {wa && (
          <Button size="sm" variant="outline" asChild>
            <a href={wa} target="_blank" rel="noreferrer">
              <MessageCircle className="size-3.5 mr-1" /> WhatsApp
            </a>
          </Button>
        )}
      </div>
    </li>
  );
}
