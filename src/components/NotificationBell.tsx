import { Link } from "@tanstack/react-router";
import { Bell, Volume2, VolumeX, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useRecruiterNotifications } from "@/hooks/useRecruiterNotifications";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function NotificationBell({ className }: { className?: string }) {
  const { enabled, items, unreadCount, markAsRead, markAllAsRead, soundEnabled, toggleSound } =
    useRecruiterNotifications();

  if (!enabled) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("relative", className)} aria-label="Notificações">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold">Notificações</div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={toggleSound}
              aria-label={soundEnabled ? "Desativar som" : "Ativar som"}
              title={soundEnabled ? "Som ativado" : "Som desativado"}
            >
              {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={markAllAsRead}
                title="Marcar todas como lidas"
              >
                <Check className="size-3 mr-1" /> Ler todas
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="max-h-80">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma notificação</div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    to="/recrutamento/$id"
                    params={{ id: n.candidate_id }}
                    onClick={() => {
                      if (!n.read) void markAsRead(n.id);
                    }}
                    className={cn(
                      "block px-3 py-2 text-sm hover:bg-muted",
                      !n.read && "bg-primary/5",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{n.message}</div>
                        <div className="text-[11px] text-muted-foreground">{formatTime(n.created_at)}</div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
