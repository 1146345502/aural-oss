"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { trpc } from "@/lib/trpc/client";
import { ChevronDown, Compass, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { useOrg } from "@/components/org-provider";
import { useProject } from "@/components/project-provider";
import { useTourSafe } from "@/components/tour/tour-provider";
import { TourChecklist } from "@/components/tour/tour-checklist";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function isDynamicSegment(segment: string): boolean {
  return /^c[a-z0-9]{20,}$/i.test(segment) || /^[a-f0-9-]{20,}$/i.test(segment);
}

function InterviewBreadcrumbLabel({ id }: { id: string }) {
  const interview = trpc.interview.getById.useQuery({ id }, { retry: false });
  if (interview.data?.title) {
    return <>{interview.data.title}</>;
  }
  return <>{id.slice(0, 8)}...</>;
}

function OrgSwitcher() {
  const { orgs, currentOrg, setCurrentOrg } = useOrg();
  const router = useRouter();
  const { t } = useAppLocale();

  if (!currentOrg) return null;

  const handleSwitch = (orgId: string) => {
    if (orgId !== currentOrg.id) {
      setCurrentOrg(orgId);
      router.refresh();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted outline-none">
          <span className="truncate max-w-[160px]">{currentOrg.name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {t("header.orgList")}
        </div>
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleSwitch(org.id)}
            className="flex items-center justify-between"
          >
            <span className="truncate">{org.name}</span>
            <Link
              href="/org/settings"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentOrg(org.id);
              }}
              className="rounded-md p-1 -mr-1 text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <Settings className="h-4 w-4 shrink-0" />
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/org/new" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {t("header.newOrganization")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectSwitcher() {
  const { projects, currentProject, setCurrentProject } = useProject();
  const { currentOrg } = useOrg();
  const router = useRouter();
  const { t } = useAppLocale();

  if (!currentProject || !currentOrg) return null;

  const handleSwitch = (projectId: string) => {
    if (projectId !== currentProject.id) {
      setCurrentProject(projectId);
      router.refresh();
    }
  };

  return (
    <>
      <span className="mx-1 text-muted-foreground/50 text-sm">/</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted outline-none">
            <span className="truncate max-w-[160px]">
              {currentProject.name}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {t("header.projectList")}
          </div>
          {projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onClick={() => handleSwitch(project.id)}
              className="flex items-center justify-between"
            >
              <span className="truncate">{project.name}</span>
              <Link
                href="/settings"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentProject(project.id);
                }}
                className="rounded-md p-1 -mr-1 text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <Settings className="h-4 w-4 shrink-0" />
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/organizations" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {t("header.newProject")}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export function Header({ sidebarToggle }: { sidebarToggle?: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useAppLocale();
  const SEGMENT_LABELS: Record<string, string> = {
    dashboard: t("header.dashboard"),
    interviews: t("header.interviews"),
    new: t("header.newInterview"),
    edit: t("header.content"),
    results: t("header.results"),
    settings: t("header.settings"),
    sessions: t("header.sessions"),
    workspaces: t("header.workspaces"),
    projects: t("header.projects"),
    members: t("header.members"),
    org: t("header.organizations"),
    organization: t("header.organization"),
    organizations: t("header.organizations"),
    candidates: t("header.sessions"),
    questions: t("header.questions"),
    account: t("header.accountSettings"),
    usage: t("header.usage"),
  };
  const ORG_SEGMENT_LABELS: Record<string, string> = {
    settings: t("header.organizationSettings"),
    members: t("header.members"),
    new: t("header.newOrganization"),
  };

  const segments = pathname.split("/").filter(Boolean);

  // Org-level pages: /organizations, /org/settings, /org/members, /org/new, /usage
  const isOrgLevelPage =
    segments[0] === "organizations" ||
    segments[0] === "org" ||
    segments[0] === "usage";

  const breadcrumbs: { label: React.ReactNode; href: string }[] = [];

  if (isOrgLevelPage) {
    // For org-level pages, always start with "Organizations"
    if (segments[0] === "org") {
      breadcrumbs.push({
        label: t("header.organizations"),
        href: "/organizations",
      });
      for (let i = 1; i < segments.length; i++) {
        const segment = segments[i];
        const href = "/" + segments.slice(0, i + 1).join("/");
        breadcrumbs.push({
          label:
            ORG_SEGMENT_LABELS[segment] ?? SEGMENT_LABELS[segment] ?? segment,
          href,
        });
      }
    } else if (segments[0] === "usage") {
      breadcrumbs.push({
        label: SEGMENT_LABELS[segments[0]] ?? segments[0],
        href: `/${segments[0]}`,
      });
    } else {
      // /organizations itself
      breadcrumbs.push({
        label: t("header.organizations"),
        href: "/organizations",
      });
    }
  } else {
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const href = "/" + segments.slice(0, i + 1).join("/");

      // Skip "edit" from breadcrumbs when followed by a sub-tab (settings/sessions)
      if (segment === "edit" && i < segments.length - 1) {
        continue;
      }

      if (isDynamicSegment(segment)) {
        const prevSegment = segments[i - 1];
        if (prevSegment === "interviews") {
          breadcrumbs.push({
            label: <InterviewBreadcrumbLabel id={segment} />,
            href: href + "/edit",
          });
        } else {
          breadcrumbs.push({ label: segment.slice(0, 8) + "...", href });
        }
      } else {
        breadcrumbs.push({
          label: SEGMENT_LABELS[segment] ?? segment,
          href,
        });
      }
    }
  }

  return (
    <header className="flex h-14 items-center border-b bg-background px-4">
      <div className="flex items-center gap-1">
        {sidebarToggle}

        {!isOrgLevelPage ? (
          <>
            <OrgSwitcher />
            <ProjectSwitcher />
          </>
        ) : segments[0] === "usage" ? (
          <OrgSwitcher />
        ) : null}

        {breadcrumbs.length > 0 && (
          <nav className="flex items-center text-sm">
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={i}>
                {(i > 0 ||
                  !isOrgLevelPage ||
                  segments[0] === "usage") && (
                  <span className="mx-1 text-muted-foreground/50 text-sm">
                    /
                  </span>
                )}
                {i < breadcrumbs.length - 1 ? (
                  <Link
                    href={crumb.href}
                    className="px-1.5 text-foreground hover:text-foreground/80 transition-colors truncate max-w-[160px]"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="px-1.5 text-foreground truncate max-w-[200px]">
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
      </div>
      <div className="ml-auto relative" style={{ zIndex: 10002 }}>
        <TourHeaderButton />
      </div>
    </header>
  );
}

function TourHeaderButton() {
  const tour = useTourSafe();
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const handleClose = useCallback(() => setChecklistOpen(false), []);
  const { t } = useAppLocale();

  useEffect(() => {
    const check = () => {
      setSheetOpen(
        !!document.querySelector('[role="dialog"][data-state="open"]'),
      );
    };
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    if (!tour?.showRecoveryHint) return;
    const timer = setTimeout(() => tour.clearRecoveryHint(), 5000);
    return () => clearTimeout(timer);
  }, [tour]);

  if (!tour || sheetOpen) return null;
  const showDot = !tour.completed;

  const handleIconClick = () => {
    if (tour.showRecoveryHint) tour.clearRecoveryHint();
    setChecklistOpen((v) => !v);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        data-tour-trigger
        onClick={handleIconClick}
        className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
        title={t("header.guidedTour")}
      >
        <Compass className="h-4 w-4" />
        {showDot && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
        )}
      </Button>
      <TourChecklist open={checklistOpen} onClose={handleClose} />
      {tour.showRecoveryHint && (
        <div
          className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl"
          style={{ zIndex: 10003 }}
        >
          <div className="absolute -top-[6px] right-3.5 h-[11px] w-[11px] rotate-45 rounded-tl-[3px] border-l border-t border-border bg-popover" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("header.resumeTour")}
          </p>
        </div>
      )}
    </>
  );
}
