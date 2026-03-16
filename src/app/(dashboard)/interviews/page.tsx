"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  MoreVertical,
  Copy,
  Trash2,
  ExternalLink,
  Link2,
  Lock,
  FileText,
  CheckSquare,
  Loader2,
  X,
  LayoutGrid,
  List,
  Search,
  Calendar,
  CircleDot,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportToXlsx } from "@/lib/export-xlsx";
import { useProject } from "@/components/project-provider";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function getTimeRangeCutoff(value: string): Date | null {
  const now = Date.now();
  const ms: Record<string, number> = {
    "30m": 30 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
    "3d": 3 * 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "14d": 14 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
  };
  if (!ms[value]) return null;
  return new Date(now - ms[value]);
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SortKey =
  | "title"
  | "status"
  | "channels"
  | "questions"
  | "sessions"
  | "date";
type SortDir = "asc" | "desc";

/* ------------------------------------------------------------------ */
/*  Sortable Header                                                    */
/* ------------------------------------------------------------------ */

function SortableHead({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  direction: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = activeKey === sortKey;
  return (
    <TableHead
      className={cn(
        "group cursor-pointer select-none whitespace-nowrap hover:text-foreground",
        className,
      )}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          direction === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-40" />
        )}
      </span>
    </TableHead>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function InterviewsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { locale, t } = useAppLocale();
  const utils = trpc.useUtils();
  const { currentProject } = useProject();
  const projectId = currentProject?.id;
  const interviews = trpc.interview.list.useQuery(
    { limit: 100, projectId: projectId ?? undefined },
    { enabled: !!projectId },
  );

  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [searchQuery, setSearchQuery] = useState("");
  const [timeRange, setTimeRange] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey | null>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const TIME_RANGE_OPTIONS = [
    { value: "ALL", label: t("interviews.allTime") },
    { value: "30m", label: t("interviews.past30Min") },
    { value: "1h", label: t("interviews.past1Hour") },
    { value: "6h", label: t("interviews.past6Hours") },
    { value: "1d", label: t("interviews.past1Day") },
    { value: "3d", label: t("interviews.past3Days") },
    { value: "7d", label: t("interviews.past7Days") },
    { value: "14d", label: t("interviews.past14Days") },
    { value: "30d", label: t("interviews.past30Days") },
    { value: "90d", label: t("interviews.past90Days") },
  ] as const;

  const STATUS_OPTIONS = [
    { value: "ALL", label: t("interviews.allAccess") },
    { value: "SHAREABLE", label: t("interviews.hasLink") },
    { value: "INVITE_ONLY", label: t("interviews.inviteOnly") },
  ] as const;

  const isFiltering =
    searchQuery.trim() || timeRange !== "ALL" || statusFilter !== "ALL";

  const formatDate = useCallback(
    (date: Date | string) => {
      return new Date(date).toLocaleString(
        locale === "zh" ? "zh-CN" : "en-US",
        {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        },
      );
    },
    [locale],
  );

  const formatDateShort = useCallback(
    (date: Date | string) => {
      return new Date(date).toLocaleDateString(
        locale === "zh" ? "zh-CN" : "en-US",
        {
          year: "numeric",
          month: "short",
          day: "numeric",
        },
      );
    },
    [locale],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const duplicateMutation = trpc.interview.duplicate.useMutation({
    onSuccess: () => {
      utils.interview.list.invalidate();
      toast({ title: t("interviews.interviewDuplicated") });
    },
  });

  const deleteMutation = trpc.interview.delete.useMutation({
    onSuccess: () => {
      utils.interview.list.invalidate();
      toast({ title: t("interviews.interviewDeleted") });
    },
  });

  const deleteManyMutation = trpc.interview.deleteMany.useMutation({
    onSuccess: (data) => {
      utils.interview.list.invalidate();
      clearSelection();
      toast({
        title:
          data.count > 1
            ? t("interviews.interviewsDeletedPlural", { count: data.count })
            : t("interviews.interviewsDeleted", { count: data.count }),
      });
    },
  });

  const handleBatchDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    deleteManyMutation.mutate({ ids: Array.from(selectedIds) });
    setConfirmDelete(false);
  }, [selectedIds, deleteManyMutation]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
    setPage(0);
  };

  const processedInterviews = useMemo(() => {
    let result = interviews.data?.interviews ?? [];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (iv) =>
          iv.title.toLowerCase().includes(q) ||
          (iv.description ?? "").toLowerCase().includes(q),
      );
    }

    if (statusFilter !== "ALL") {
      result = result.filter((iv) => {
        const hasLink = !!(iv.publicSlug && iv.isActive && !iv.requireInvite);
        return statusFilter === "SHAREABLE" ? hasLink : !hasLink;
      });
    }

    const cutoff = getTimeRangeCutoff(timeRange);
    if (cutoff) {
      result = result.filter(
        (iv) => new Date(iv.createdAt).getTime() >= cutoff.getTime(),
      );
    }

    if (sortKey) {
      result = [...result].sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;
        switch (sortKey) {
          case "title":
            aVal = a.title.toLowerCase();
            bVal = b.title.toLowerCase();
            break;
          case "status":
            aVal = a.publicSlug && a.isActive && !a.requireInvite ? 1 : 0;
            bVal = b.publicSlug && b.isActive && !b.requireInvite ? 1 : 0;
            break;
          case "channels": {
            const ch = (iv: typeof a) =>
              [
                iv.chatEnabled && "C",
                iv.voiceEnabled && "V",
                iv.videoEnabled && "R",
              ]
                .filter(Boolean)
                .join("");
            aVal = ch(a);
            bVal = ch(b);
            break;
          }
          case "questions":
            aVal = a._count.questions;
            bVal = b._count.questions;
            break;
          case "sessions":
            aVal = a._count.sessions;
            bVal = b._count.sessions;
            break;
          case "date":
            aVal = new Date(a.createdAt).getTime();
            bVal = new Date(b.createdAt).getTime();
            break;
        }
        let cmp: number;
        if (typeof aVal === "number" && typeof bVal === "number") {
          cmp = aVal - bVal;
        } else {
          cmp = String(aVal).localeCompare(String(bVal));
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [interviews.data, searchQuery, statusFilter, timeRange, sortKey, sortDir]);

  const totalPages = Math.max(
    1,
    Math.ceil(processedInterviews.length / pageSize),
  );
  const paginatedInterviews = processedInterviews.slice(
    page * pageSize,
    (page + 1) * pageSize,
  );

  const pageIds = paginatedInterviews.map((iv) => iv.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  };

  const handleExport = useCallback(() => {
    const rows = processedInterviews.map((iv) => ({
      Title: iv.title,
      Description: iv.description || "",
      Channels: [
        iv.chatEnabled && "Chat",
        iv.voiceEnabled && "Voice",
        iv.videoEnabled && "Video",
      ]
        .filter(Boolean)
        .join(", "),
      Access:
        iv.publicSlug && iv.isActive && !iv.requireInvite
          ? "Public"
          : "Invite Only",
      Questions: iv._count.questions,
      Sessions: iv._count.sessions,
      Created: formatDate(iv.createdAt),
    }));
    exportToXlsx(rows, `interviews-${new Date().toISOString().slice(0, 10)}`);
  }, [processedInterviews, formatDate]);

  const renderActionsMenu = (
    interview: (typeof paginatedInterviews)[number],
    align: "end" | "start" = "end",
  ) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem asChild>
          <Link
            href={`/interviews/${interview.id}/edit`}
            onClick={(e) => e.stopPropagation()}
          >
            <FileText className="mr-2 h-4 w-4" />
            Details
          </Link>
        </DropdownMenuItem>
        {interview.publicSlug && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(
                `${window.location.origin}/i/${interview.publicSlug}`,
              );
              toast({ title: "Link copied!" });
            }}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Copy Link
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            duplicateMutation.mutate({ id: interview.id });
          }}
        >
          <Copy className="mr-2 h-4 w-4" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            toggleSelect(interview.id);
          }}
        >
          <CheckSquare className="mr-2 h-4 w-4" />
          Select
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            setSingleDeleteId(interview.id);
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("interviews.title")}</h1>
          <p className="text-muted-foreground">{t("interviews.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border bg-muted/30 p-0.5">
            <Button
              variant={viewMode === "card" ? "default" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode("card")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === "table" ? "default" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode("table")}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button
            disabled={creatingNew}
            onClick={() => {
              setCreatingNew(true);
              router.push("/interviews/new");
            }}
          >
            {creatingNew ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            {t("sidebar.newInterview")}
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("interviews.search")}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={timeRange}
          onValueChange={(v) => {
            setTimeRange(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <CircleDot className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={handleExport}
          disabled={processedInterviews.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>

        {selectedIds.size > 0 && (
          <>
            <Button
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={deleteManyMutation.isLoading}
            >
              {deleteManyMutation.isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t("common.delete")} ({selectedIds.size})
            </Button>
            <Button
              variant="outline"
              className="border-foreground/50 hover:bg-foreground/5"
              onClick={clearSelection}
            >
              <X className="mr-1 h-4 w-4" />
              {t("common.cancel")}
            </Button>
          </>
        )}
      </div>

      {/* Batch-delete confirmation dialog */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("common.delete")} {selectedIds.size}{" "}
              {t("interviews.title").toLowerCase()}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All selected interviews and their
              sessions will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single-delete confirmation dialog */}
      <AlertDialog
        open={!!singleDeleteId}
        onOpenChange={(open) => {
          if (!open) setSingleDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this interview?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The interview and all its sessions
              will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (singleDeleteId) {
                  deleteMutation.mutate({ id: singleDeleteId });
                  setSingleDeleteId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Content */}
      {interviews.isLoading ? (
        viewMode === "card" ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border p-6">
            <Skeleton className="h-48" />
          </div>
        )
      ) : processedInterviews.length === 0 ? (
        isFiltering ? (
          <div className="rounded-lg border">
            <p className="py-8 text-center text-muted-foreground">
              {t("interviews.search")}
            </p>
          </div>
        ) : (
          <Card>
            <CardContent className="py-16 text-center">
              <h3 className="text-lg font-semibold">
                {t("dashboard.noInterviews")}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("dashboard.createFirstInterview")}
              </p>
              <Link href="/interviews/new" className="mt-4 inline-block">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("dashboard.createInterview")}
                </Button>
              </Link>
            </CardContent>
          </Card>
        )
      ) : viewMode === "card" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {processedInterviews.map((interview) => {
            const isSelected = selectedIds.has(interview.id);
            return (
              <Card
                key={interview.id}
                onMouseEnter={() =>
                  utils.interview.getById.prefetch({ id: interview.id })
                }
                onClick={() => {
                  if (selectedIds.size > 0) {
                    toggleSelect(interview.id);
                  } else {
                    setNavigatingId(interview.id);
                    router.push(`/interviews/${interview.id}/edit`);
                  }
                }}
                className={cn(
                  "group relative cursor-pointer transition-all",
                  isSelected
                    ? "border-primary ring-1 ring-primary bg-primary/5"
                    : "hover:shadow-md hover:border-primary/30 hover:bg-muted/30",
                  navigatingId === interview.id &&
                    "opacity-70 pointer-events-none",
                )}
              >
                {navigatingId === interview.id && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">
                        {interview.title}
                      </CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {interview.description ?? t("dashboard.noData")}
                      </CardDescription>
                    </div>
                    {renderActionsMenu(interview)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>
                      {interview._count.questions}{" "}
                      {t("dashboard.questions").toLowerCase()}
                    </span>
                    <span>&middot;</span>
                    <span>
                      {interview._count.sessions}{" "}
                      {t("sidebar.sessions").toLowerCase()}
                    </span>
                    <span>&middot;</span>
                    <span>{formatDateShort(interview.createdAt)}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {interview.publicSlug &&
                    interview.isActive &&
                    !interview.requireInvite ? (
                      <Badge
                        variant="outline"
                        className="gap-1 max-w-[200px] border-border bg-background text-foreground"
                      >
                        <Link2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          /i/{interview.publicSlug}
                        </span>
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" />
                        {t("interviews.inviteOnly")}
                      </Badge>
                    )}
                    {interview.chatEnabled && (
                      <Badge variant="outline">{t("dashboard.chat")}</Badge>
                    )}
                    {interview.voiceEnabled && (
                      <Badge variant="outline">{t("dashboard.voice")}</Badge>
                    )}
                    {interview.videoEnabled && (
                      <Badge variant="outline">{t("dashboard.video")}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* ── Table view ─────────────────────────────────────────── */
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      allPageSelected
                        ? true
                        : somePageSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <SortableHead
                  label={t("interviews.title")}
                  sortKey="title"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label={t("interviews.allAccess")}
                  sortKey="status"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label={t("dashboard.chat")}
                  sortKey="channels"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label={t("dashboard.questions")}
                  sortKey="questions"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={handleSort}
                  className="text-center"
                />
                <SortableHead
                  label={t("sidebar.sessions")}
                  sortKey="sessions"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={handleSort}
                  className="text-center"
                />
                <SortableHead
                  label="Created"
                  sortKey="date"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={handleSort}
                />
                <TableHead className="w-10" />
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedInterviews.map((interview) => {
                const hasLink = !!(
                  interview.publicSlug &&
                  interview.isActive &&
                  !interview.requireInvite
                );
                return (
                  <TableRow
                    key={interview.id}
                    className={cn(
                      "cursor-pointer",
                      navigatingId === interview.id &&
                        "opacity-50 pointer-events-none",
                    )}
                    data-state={
                      selectedIds.has(interview.id) ? "selected" : undefined
                    }
                    onMouseEnter={() =>
                      utils.interview.getById.prefetch({ id: interview.id })
                    }
                    onClick={() => {
                      if (selectedIds.size > 0) {
                        toggleSelect(interview.id);
                      } else {
                        setNavigatingId(interview.id);
                        router.push(`/interviews/${interview.id}/edit`);
                      }
                    }}
                  >
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      className="w-10"
                    >
                      <Checkbox
                        checked={selectedIds.has(interview.id)}
                        onCheckedChange={() => toggleSelect(interview.id)}
                      />
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="font-medium">{interview.title}</div>
                      {interview.description && (
                        <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                          {interview.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {hasLink ? (
                        <span
                          className="inline-flex max-w-[180px] cursor-pointer items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
                          title={`${window.location.origin}/i/${interview.publicSlug}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(
                              `${window.location.origin}/i/${interview.publicSlug}`,
                            );
                            toast({ title: t("interviews.hasLink") });
                          }}
                        >
                          <Link2 className="h-3 w-3 shrink-0" />
                          /i/{interview.publicSlug}
                        </span>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="h-3 w-3" />
                          {t("interviews.inviteOnly")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {interview.chatEnabled && (
                          <Badge variant="outline">{t("dashboard.chat")}</Badge>
                        )}
                        {interview.voiceEnabled && (
                          <Badge variant="outline">
                            {t("dashboard.voice")}
                          </Badge>
                        )}
                        {interview.videoEnabled && (
                          <Badge variant="outline">
                            {t("dashboard.video")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {interview._count.questions}
                    </TableCell>
                    <TableCell className="text-center">
                      {interview._count.sessions}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(interview.createdAt)}
                    </TableCell>
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      className="w-10"
                    >
                      {renderActionsMenu(interview)}
                    </TableCell>
                    <TableCell className="w-8">
                      {navigatingId === interview.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {processedInterviews.length > PAGE_SIZE_OPTIONS[0] && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Rows per page</span>
                <select
                  className="rounded border bg-background px-2 py-1 text-sm"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(0);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <span className="ml-2">
                  {page * pageSize + 1}–
                  {Math.min((page + 1) * pageSize, processedInterviews.length)}{" "}
                  of {processedInterviews.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
