"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Building2, Settings, Users } from "lucide-react";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { locale } = useAppLocale();
  const isZh = locale === "zh";
  const settingsNav: {
    name: string;
    href: string;
    icon: typeof Settings;
    exact?: boolean;
    external?: boolean;
  }[] = [
    {
      name: isZh ? "通用" : "General",
      href: "/settings",
      icon: Settings,
      exact: true,
    },
    {
      name: isZh ? "成员" : "Members",
      href: "/settings/members",
      icon: Users,
    },
    {
      name: isZh ? "组织" : "Organizations",
      href: "/organizations",
      icon: Building2,
      external: true,
    },
  ];

  return (
    <div className="flex gap-8">
      <nav className="w-48 shrink-0 space-y-1">
        {settingsNav.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                item.external
                  ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                  : isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.name}</span>
              {item.external && (
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
