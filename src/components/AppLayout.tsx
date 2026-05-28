import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Building2, LayoutDashboard, Users, Trello, Settings, ListChecks, LogOut, Briefcase, Upload, Shuffle, Layers, Home, Key, UserPlus, Menu, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";
import type { AppRole } from "@/lib/auth";
import { NotificationBell } from "@/components/NotificationBell";
import { FollowUpSidebar } from "@/components/FollowUpSidebar";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; roles: AppRole[] };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/leads", label: "Leads", icon: ListChecks, roles: ["admin"] },
  { to: "/leads-em-massa", label: "Leads em Massa", icon: Upload, roles: ["admin"] },
  { to: "/distribuicao", label: "Distribuição", icon: Shuffle, roles: ["admin"] },
  { to: "/meus-leads", label: "Meus Leads", icon: Briefcase, roles: ["corretor"] },
  { to: "/kanban", label: "Kanban Compra", icon: Trello, roles: ["admin", "corretor"] },
  { to: "/kanban-massa", label: "Kanban Compra em Massa", icon: Layers, roles: ["admin", "corretor"] },
  { to: "/kanban-captacao", label: "Kanban Captação", icon: Home, roles: ["admin", "corretor"] },
  { to: "/kanban-captacao-massa", label: "Kanban Captação em Massa", icon: Key, roles: ["admin", "corretor"] },
  { to: "/recrutamento/dashboard", label: "Dashboard Recrutamento", icon: LayoutDashboard, roles: ["recrutador", "gerente_recrutamento"] },
  { to: "/recrutamento", label: "Recrutamento", icon: UserPlus, roles: ["admin", "recrutador", "gerente_recrutamento"] },
  { to: "/recrutamento/kanban", label: "Kanban Recrutamento", icon: Trello, roles: ["recrutador", "gerente_recrutamento"] },
  { to: "/corretores", label: "Usuários", icon: Users, roles: ["admin", "gerente_recrutamento"] },
  { to: "/configuracoes/kanban", label: "Configurações", icon: Settings, roles: ["admin", "recrutador", "gerente_recrutamento"] },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = NAV.filter((i) => role && i.roles.includes(role));

  const isActive = (to: string) => {
    const matches = path === to || path.startsWith(to + "/");
    const hasMoreSpecific = items.some(
      (other) =>
        other.to !== to &&
        other.to.length > to.length &&
        (path === other.to || path.startsWith(other.to + "/"))
    );
    return matches && !hasMoreSpecific;
  };

  const NavList = ({ onItemClick }: { onItemClick?: () => void }) => (
    <>
      {items.map((it) => {
        const active = isActive(it.to);
        return (
          <Link
            key={it.to}
            to={it.to}
            onClick={onItemClick}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-3 text-sm transition-colors min-h-[44px]",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent"
            )}
          >
            <it.icon className="size-4 shrink-0" />
            <span className="truncate">{it.label}</span>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-4">
          <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Building2 className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold">BrokerFlow</div>
            <div className="text-xs text-sidebar-foreground/60">CRM Imobiliário</div>
          </div>
          <FollowUpSidebar className="text-sidebar-foreground hover:bg-sidebar-accent" />
          <NotificationBell className="text-sidebar-foreground hover:bg-sidebar-accent" />
        </div>

        <nav className="flex-1 space-y-1 p-3">
          <NavList />
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
      <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between bg-sidebar px-3 py-2 text-sidebar-foreground">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent" aria-label="Abrir menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0 flex flex-col bg-sidebar text-sidebar-foreground border-sidebar-border">
            <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
            <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Building2 className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">BrokerFlow</div>
                <div className="text-xs text-sidebar-foreground/60">CRM Imobiliário</div>
              </div>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              <NavList onItemClick={() => setMobileOpen(false)} />
            </nav>
            <div className="border-t border-sidebar-border p-3">
              <div className="mb-2 px-2">
                <div className="truncate text-sm font-medium">{profile?.name}</div>
                <div className="truncate text-xs text-sidebar-foreground/60 capitalize">{role}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={() => { setMobileOpen(false); signOut(); }}
              >
                <LogOut className="mr-2 size-4" />
                Sair
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-2">
          <Building2 className="size-5" />
          <span className="font-semibold">BrokerFlow</span>
        </div>

        <div className="flex items-center gap-1">
          <FollowUpSidebar className="text-sidebar-foreground" />
          <NotificationBell className="text-sidebar-foreground" />
        </div>
      </div>

      <main className="flex-1 pt-14 md:pt-0">
        <div className="mx-auto w-full max-w-7xl p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
