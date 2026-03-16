"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useAuth } from "@/components/auth-provider";
import { TourCelebration } from "@/components/tour/tour-celebration";
import { TourOverlay } from "@/components/tour/tour-overlay";
import { TourProvider } from "@/components/tour/tour-provider";
import { TourWelcome } from "@/components/tour/tour-welcome";
import { AuralLogo } from "@/components/ui/aural-logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
    ArrowUpRight,
    ChevronUp,
    FolderKanban,
    Gauge,
    HelpCircle,
    LayoutDashboard,
    LifeBuoy,
    Loader2,
    LogOut,
    MessageSquare,
    Monitor,
    Moon,
    Palette,
    PanelLeftClose,
    PanelLeftOpen,
    PlayCircle,
    Plus,
    Settings,
    Sun
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Header } from "./header";
import { SupportDrawer } from "./support-drawer";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useAppLocale();

  const options = [
    { value: "light", icon: Sun, label: t("common.light") },
    { value: "dark", icon: Moon, label: t("common.dark") },
    { value: "system", icon: Monitor, label: t("common.system") },
  ] as const;

  return (
    <div className="flex items-center justify-between px-2 py-1.5 text-sm">
      <span className="flex items-center gap-2">
        <Palette className="h-4 w-4" />
        {t("sidebar.theme")}
      </span>
      <div className="flex items-center gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTheme(opt.value);
            }}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              theme === opt.value
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <opt.icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
  suffix,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  collapsed: boolean;
  suffix?: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigating = isPending && !active;

  return (
    <Link
      href={href}
      onClick={(e) => {
        if (active) return;
        e.preventDefault();
        startTransition(() => {
          router.push(href);
        });
      }}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {navigating ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        <Icon className="h-4 w-4 shrink-0" />
      )}
      {!collapsed &&
        (suffix ? (
          <>
            <span className="flex-1">{label}</span>
            {suffix}
          </>
        ) : (
          label
        ))}
    </Link>
  );
}

export function Sidebar({
  collapsed,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [creatingInterview, setCreatingInterview] = useState(false);
  const { t } = useAppLocale();

  const projectNavigation = [
    { name: t("sidebar.dashboard"), href: "/dashboard", icon: LayoutDashboard },
    { name: t("sidebar.interviews"), href: "/interviews", icon: MessageSquare },
    { name: t("sidebar.sessions"), href: "/candidates", icon: PlayCircle },
    { name: t("sidebar.questions"), href: "/questions", icon: HelpCircle },
  ];

  useEffect(() => {
    setCreatingInterview(false);
  }, [pathname]);

  const displayName = profile?.name || user?.email?.split("@")[0] || "User";
  const initials =
    displayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "U";

  const isOrgLevelPage =
    pathname.startsWith("/organizations") ||
    pathname.startsWith("/org/") ||
    pathname.startsWith("/usage");

  const isSettingsActive = pathname.startsWith("/settings");

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-background transition-all duration-200",
        collapsed ? "w-16" : "w-52",
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/organizations" className="flex items-center gap-1">
          <AuralLogo size={28} className="shrink-0" />
          {!collapsed && (
            <span className="font-heading text-base font-bold tracking-[2px]">
              AURAL
            </span>
          )}
        </Link>
      </div>

      {isOrgLevelPage ? (
        <>
          {/* Org-level nav */}
          <nav className="flex-1 space-y-1 px-3 pt-3">
            <SidebarLink
              href="/organizations"
              icon={FolderKanban}
              label={t("sidebar.organizations")}
              active={pathname.startsWith("/organizations")}
              collapsed={collapsed}
            />
          </nav>

          {/* Bottom section: Support */}
          <div className="space-y-1 px-3 pb-2">
            <button
              onClick={() => setSupportOpen(true)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <LifeBuoy className="h-4 w-4 shrink-0" />
              {!collapsed && t("sidebar.support")}
            </button>
            <SidebarLink
              href="/usage"
              icon={Gauge}
              label={t("sidebar.usage")}
              active={pathname.startsWith("/usage")}
              collapsed={collapsed}
            />
          </div>
        </>
      ) : (
        <>
          {/* New Interview */}
          <div className="p-3">
            <Button
              className={cn(
                "w-full gap-2",
                collapsed ? "justify-center" : "justify-start",
              )}
              size={collapsed ? "icon" : "default"}
              disabled={creatingInterview}
              onClick={() => {
                if (pathname === "/interviews/new") return;
                setCreatingInterview(true);
                router.push("/interviews/new");
              }}
            >
              {creatingInterview ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {!collapsed && t("sidebar.newInterview")}
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3">
            {projectNavigation.map((item) => (
              <SidebarLink
                key={item.name}
                href={item.href}
                icon={item.icon}
                label={item.name}
                active={pathname.startsWith(item.href)}
                collapsed={collapsed}
              />
            ))}
          </nav>

          {/* Bottom section: Settings + Support */}
          <div className="space-y-1 px-3 pb-2">
            <SidebarLink
              href="/settings"
              icon={Settings}
              label={t("sidebar.projectSettings")}
              active={isSettingsActive}
              collapsed={collapsed}
            />
            <button
              onClick={() => setSupportOpen(true)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <LifeBuoy className="h-4 w-4 shrink-0" />
              {!collapsed && t("sidebar.support")}
            </button>
            <SidebarLink
              href="/usage"
              icon={Gauge}
              label={t("sidebar.usage")}
              active={pathname.startsWith("/usage")}
              collapsed={collapsed}
              suffix={
                <ArrowUpRight
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    pathname.startsWith("/usage")
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                />
              }
            />
          </div>
        </>
      )}

      <SupportDrawer open={supportOpen} onOpenChange={setSupportOpen} />

      {/* User profile */}
      <div className="border-t">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted outline-none",
                collapsed && "justify-center px-0",
              )}
            >
              <Avatar className="h-8 w-8 shrink-0 rounded-md">
                <AvatarImage src={profile?.avatar ?? undefined} />
                <AvatarFallback className="text-xs rounded-md">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="flex flex-col items-start overflow-hidden text-left">
                    <span className="truncate w-full font-medium text-foreground">
                      {displayName}
                    </span>
                    <span className="truncate w-full text-xs text-muted-foreground">
                      {user?.email ?? ""}
                    </span>
                  </div>
                  <ChevronUp className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <Avatar className="h-7 w-7 shrink-0 rounded-md">
                <AvatarImage src={profile?.avatar ?? undefined} />
                <AvatarFallback className="text-[10px] rounded-md">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col overflow-hidden">
                <span className="truncate text-sm font-medium text-foreground">
                  {displayName}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {user?.email ?? ""}
                </span>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/account" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                {t("sidebar.accountSettings")}
              </Link>
            </DropdownMenuItem>
            <ThemeToggle />
            <DropdownMenuItem
              className="flex items-center gap-2 text-destructive"
              disabled={signingOut}
              onSelect={async (e) => {
                e.preventDefault();
                setSigningOut(true);
                const supabase = createClient();
                try {
                  await supabase.auth.signOut();
                } catch {
                  // Session may have expired; clear local state instead
                  await supabase.auth
                    .signOut({ scope: "local" })
                    .catch(() => {});
                }
                window.location.href = "/login";
              }}
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              {signingOut ? t("sidebar.signingOut") : t("sidebar.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

export function SidebarToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useAppLocale();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-transparent"
      aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
    >
      {collapsed ? (
        <PanelLeftOpen className="h-4 w-4" />
      ) : (
        <PanelLeftClose className="h-4 w-4" />
      )}
    </Button>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <TourProvider>
      <div className="dashboard-shell flex h-screen overflow-hidden">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header
              sidebarToggle={
                <SidebarToggle
                  collapsed={collapsed}
                  onToggle={() => setCollapsed(!collapsed)}
                />
              }
            />
            <main className="flex-1 overflow-y-auto p-6 code-scrollbar">
              {children}
            </main>
          </div>
        </div>
      <TourOverlay />
      <TourWelcome />
      <TourCelebration />
    </TourProvider>
  );
}
