import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Building2, LayoutDashboard, Users, Trello, Settings, ListChecks, LogOut, Briefcase, Upload, Shuffle, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; roles: ("admin" | "corretor")[] };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/leads", label: "Leads", icon: ListChecks, roles: ["admin"] },
  { to: "/leads-em-massa", label: "Leads em Massa", icon: Upload, roles: ["admin"] },
  { to: "/distribuicao", label: "Distribuição", icon: Shuffle, roles: ["admin"] },
  { to: "/meus-leads", label: "Meus Leads", icon: Briefcase, roles: ["corretor"] },
  { to: "/kanban", label: "Kanban", icon: Trello, roles: ["admin", "corretor"] },
  { to: "/kanban-massa", label: "Kanban Leads em Massa", icon: Layers, roles: ["admin", "corretor"] },
  { to: "/corretores", label: "Corretores", icon: Users, roles: ["admin"] },
  { to: "/configuracoes/kanban", label: "Configurações", icon: Settings, roles: ["admin"] },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const items = NAV.filter((i) => role && i.roles.includes(role));

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-4">
          <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Building2 className="size-5" />
          </div>
          <div>
            <div className="font-semibold">BrokerFlow</div>
            <div className="text-xs text-sidebar-foreground/60">CRM Imobiliário</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {items.map((it) => {
            const active = path === it.to || path.startsWith(it.to + "/");
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent"
                )}
              >
                <it.icon className="size-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 px-2">
            <div className="truncate text-sm font-medium">{profile?.name}</div>
            <div className="truncate text-xs text-sidebar-foreground/60 capitalize">{role}</div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={signOut}>
            <LogOut className="mr-2 size-4" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-foreground">
        <div className="flex items-center gap-2">
          <Building2 className="size-5" />
          <span className="font-semibold">BrokerFlow</span>
        </div>
        <Button variant="ghost" size="sm" className="text-sidebar-foreground" onClick={signOut}>
          <LogOut className="size-4" />
        </Button>
      </div>

      <main className="flex-1 pb-20 pt-14 md:pt-0 md:pb-0">
        <div className="mx-auto w-full max-w-7xl p-4 md:p-8">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-4 gap-1 border-t border-border bg-background px-2 py-2">
        {items.slice(0, 4).map((it) => {
          const active = path === it.to || path.startsWith(it.to + "/");
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md px-2 py-1 text-[11px]",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <it.icon className="size-5" />
              <span className="truncate">{it.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
