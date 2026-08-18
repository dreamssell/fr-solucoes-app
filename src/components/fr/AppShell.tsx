"use client";

import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  HandCoins,
  Users,
  FileText,
  Wallet,
  Scale,
  UserCog,
  History,
  Menu,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Settings,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSignOut } from "@/hooks/use-sign-out";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const getNav = (role?: string | null) => {
  const items = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/cobrancas", label: "Cobranças", icon: HandCoins },
    { to: "/clientes", label: "Clientes", icon: Users },
    { to: "/emprestimos", label: "Empréstimos", icon: FileText },
    { to: "/recebimentos", label: "Recebimentos", icon: Wallet },
    { to: "/acertos", label: "Acertos", icon: Scale },
    { to: "/funcionarios", label: "Funcionários", icon: UserCog },
    { to: "/configuracoes", label: "Configurações", icon: Settings },
  ];
  if (role === "owner") {
    items.push({ to: "/auditoria", label: "Auditoria", icon: History });
  }
  return items;
};

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gold/10 font-display text-sm font-bold text-gold">
        FR
      </div>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="truncate font-display text-sm font-bold tracking-tight">FR Financeiro</p>
          <p className="truncate text-[11px] text-muted-foreground">Gestão de crédito</p>
        </div>
      )}
    </div>
  );
}

function NavList({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: userRole } = useQuery({
    queryKey: ["userRoleNav"],
    queryFn: async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        const { data, error } = await supabase.rpc("get_current_user_role");
        if (error) return null;
        return data as string;
      } catch {
        return null;
      }
    },
  });

  const navItems = getNav(userRole);

  return (
    <nav className="flex flex-col gap-1 px-3">
      {navItems.map((item) => {
        const active = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            title={compact ? item.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md transition-colors",
              compact ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
              active
                ? "bg-gold/10 font-semibold text-gold border-r-2 border-gold"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!compact && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/8 px-2.5 py-1 text-[11px] font-medium text-gold/90",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-gold" />
      Ambiente de demonstração
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl leading-tight font-bold sm:truncate sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const sair = useSignOut();

  const { data: userProfile } = useQuery({
    queryKey: ["userProfileHeader"],
    queryFn: async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        
        let avatarUrl: string | null = null;
        const pathOrUrl = user.user_metadata?.["avatar_url"];
        if (pathOrUrl) {
          if (pathOrUrl.startsWith("http")) {
            avatarUrl = pathOrUrl;
          } else {
            const { data, error } = await supabase.storage
              .from("documents")
              .createSignedUrl(pathOrUrl, 3600);
            if (!error && data) {
              avatarUrl = data.signedUrl;
            }
          }
        }

        return {
          id: user.id,
          email: user.email,
          nome: user.user_metadata?.["full_name"] || "",
          avatarUrl,
        };
      } catch {
        return null;
      }
    },
  });

  return (
    <div className="min-h-screen w-full bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 lg:flex",
          collapsed ? "w-20" : "w-64",
        )}
      >
        <div
          className={cn(
            "flex h-20 items-center overflow-hidden transition-all",
            collapsed ? "px-0 justify-center" : "px-6",
          )}
        >
          <Brand compact={collapsed} />
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <NavList compact={collapsed} />
        </div>
        <div className="border-t border-sidebar-border p-3 space-y-2">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md py-2.5 text-left text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent",
              collapsed ? "justify-center px-0" : "px-3",
            )}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" /> Recolher
              </>
            )}
          </button>
          <button
            type="button"
            onClick={sair}
            className={cn(
              "flex w-full items-center gap-3 rounded-md py-2.5 text-left text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent",
              collapsed ? "justify-center px-0" : "px-3",
            )}
            title={collapsed ? "Sair" : undefined}
          >
            <LogOut className="h-4 w-4" /> {!collapsed && "Sair"}
          </button>
        </div>
      </aside>

      <div className={cn("transition-all duration-300", collapsed ? "lg:pl-20" : "lg:pl-64")}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
              <SheetTitle className="sr-only">Menu principal</SheetTitle>
              <div className="flex h-16 items-center border-b border-sidebar-border px-5">
                <Brand />
              </div>
              <div className="py-4">
                <NavList onNavigate={() => setOpen(false)} />
              </div>
              <div className="border-t border-sidebar-border p-3">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void sair();
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent"
                >
                  <LogOut className="h-4 w-4" /> Sair
                </button>
              </div>
            </SheetContent>
          </Sheet>

          <div className="lg:hidden">
            <Brand compact />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <DemoBadge className="hidden sm:inline-flex" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="outline-none">
                  <Avatar className="h-9 w-9 border border-border bg-surface cursor-pointer select-none">
                    {userProfile?.avatarUrl ? (
                      <AvatarImage src={userProfile.avatarUrl} alt={userProfile.nome} className="object-cover" />
                    ) : null}
                    <AvatarFallback className="text-xs font-semibold text-gold bg-surface">
                      {userProfile?.nome
                        ? userProfile.nome.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase()
                        : userProfile?.email
                        ? userProfile.email.slice(0, 2).toUpperCase()
                        : "FR"}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-card border-border">
                {userProfile ? (
                  <>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-semibold leading-none truncate">{userProfile.nome || "Usuário"}</p>
                        <p className="text-xs leading-none text-muted-foreground truncate">{userProfile.email}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-border" />
                  </>
                ) : null}
                <DropdownMenuItem asChild className="hover:bg-muted/50 cursor-pointer">
                  <Link to="/configuracoes" className="flex w-full items-center gap-2 text-sm text-foreground">
                    <Settings className="h-4 w-4 text-gold" />
                    Configurações
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem
                  onClick={sair}
                  className="hover:bg-muted/50 cursor-pointer text-danger focus:text-danger flex items-center gap-2 text-sm"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] space-y-6 p-4 pb-16 sm:p-6">
          <DemoBadge className="sm:hidden" />
          {children}
        </main>
      </div>
    </div>
  );
}
