"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Users } from "lucide-react";

export default function OrgSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { locale } = useAppLocale();
  const isZh = locale === "zh";
  const orgSettingsNav = [
    {
      name: isZh ? "通用" : "General",
      href: "/org/settings",
      icon: Settings,
      exact: true,
    },
    {
      name: isZh ? "成员" : "Members",
      href: "/org/settings/members",
      icon: Users,
    },
  ];

  return (
    <div className="flex gap-8">
      <nav className="w-48 shrink-0 space-y-1">
        {orgSettingsNav.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.name}</span>
            </Link>
          );
        })}
      </nav>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
