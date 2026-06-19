"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { ShareModal } from "@/components/interview/share-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
    BrainCircuit,
    ExternalLink,
    Link2,
    ListOrdered,
    Loader2,
    Lock,
    Settings,
    Share2,
    Users,
} from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { EditInterviewProvider } from "./edit-context";

const tabSkeletons: Record<string, React.ReactNode> = {
  content: (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  ),
  settings: (
    <div className="grid gap-6 md:grid-cols-2">
      <Skeleton className="h-40 md:col-span-2" />
      <Skeleton className="h-[400px]" />
      <Skeleton className="h-[400px]" />
    </div>
  ),
  sessions: (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[400px]" />
    </div>
  ),
  prep: (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[300px]" />
    </div>
  ),
};

const tabs = [
  { value: "content", labelKey: "header.content", icon: ListOrdered, href: "" },
  { value: "settings", labelKey: "header.settings", icon: Settings, href: "/settings" },
  { value: "sessions", labelKey: "header.sessions", icon: Users, href: "/sessions" },
  { value: "prep", labelKey: "header.practices", icon: BrainCircuit, href: "/prep" },
] as const;

export default function EditInterviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useAppLocale();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const id = params.id as string;
  const basePath = `/interviews/${id}/edit`;

  const interview = trpc.interview.getById.useQuery({ id });
  const utils = trpc.useUtils();

  const updateMutation = trpc.interview.update.useMutation({
    onSuccess: () => {
      utils.interview.getById.invalidate({ id });
      toast({ title: t("interviewEdit.updated") });
    },
  });

  const previewMutation = trpc.session.createPreview.useMutation({
    onSuccess: (data) => {
      const slug = (interview.data as any)?.publicSlug; // eslint-disable-line @typescript-eslint/no-explicit-any
      window.open(`/i/${slug}/session?sid=${data.sessionId}&preview=true`, "_blank");
    },
    onError: (err) => {
      toast({ title: t("interviewEdit.previewFailed"), description: err.message, variant: "destructive" });
    },
  });

  const activeTab = useMemo(() => {
    if (pathname.endsWith("/settings")) return "settings";
    if (pathname.endsWith("/sessions")) return "sessions";
    if (pathname.endsWith("/prep")) return "prep";
    return "content";
  }, [pathname]);

  if (interview.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (!interview.data) {
    return <div>{t("interviewEdit.notFound")}</div>;
  }

  const data = interview.data;

  return (
    <EditInterviewProvider
      value={{ interview: data, interviewId: id, updateMutation }}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="no-print">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">{data.title}</h1>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShareOpen(true)}
              >
                <Share2 className="mr-2 h-3.5 w-3.5" />
                {t("common.share")}
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="gap-2 border-primary text-primary hover:bg-primary/5 hover:text-primary"
              >
                <a
                  href={`/practice/${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <BrainCircuit className="h-3.5 w-3.5" />
                  {t("common.practice")}
                </a>
              </Button>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(data as any).publicSlug && (
                <Button
                  size="sm"
                  className="gap-2"
                  disabled={previewMutation.isPending}
                  onClick={() => previewMutation.mutate({ interviewId: id })}
                >
                  {previewMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5" />
                  )}
                  {t("interviewEdit.testAsCandidate")}
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(data as any).publicSlug && (data as any).isActive && !(data as any).requireInvite ? (
              <Badge
                variant="outline"
                className="cursor-pointer gap-1 border-border bg-background text-foreground hover:bg-muted"
                onClick={() => {
                  navigator.clipboard.writeText(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    `${window.location.origin}/i/${(data as any).publicSlug}`,
                  );
                  toast({ title: t("interviewEdit.linkCopied") });
                }}
              >
                <Link2 className="h-3 w-3" />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                /i/{(data as any).publicSlug}
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" />
                {t("dashboard.inviteOnly")}
              </Badge>
            )}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(data as any).chatEnabled && <Badge variant="outline">{t("dashboard.chat")}</Badge>}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(data as any).voiceEnabled && <Badge variant="outline">{t("dashboard.voice")}</Badge>}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(data as any).videoEnabled && <Badge variant="outline">{t("dashboard.video")}</Badge>}
          </div>
        </div>

        {/* Tab navigation */}
        <div
          className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground no-print"
          role="tablist"
        >
          {tabs.map((tab) => {
            const displayTab = isPending && pendingTab ? pendingTab : activeTab;
            const isActive = displayTab === tab.value;
            return (
              <button
                key={tab.value}
                role="tab"
                aria-selected={isActive}
                disabled={isActive}
                onClick={() => {
                  setPendingTab(tab.value);
                  startTransition(() => {
                    router.push(`${basePath}${tab.href}`);
                  });
                }}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 gap-2",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "hover:text-foreground/80",
                )}
              >
                <tab.icon className="h-4 w-4" />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {isPending && pendingTab ? tabSkeletons[pendingTab] : children}
      </div>

      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        interviewId={id}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        publicSlug={(data as any).publicSlug ?? null}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        isPublic={!!(data as any).publicSlug && (data as any).isActive && !(data as any).requireInvite}
      />
    </EditInterviewProvider>
  );
}
