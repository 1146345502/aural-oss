"use client";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { exportToXlsx } from "@/lib/export-xlsx";
import { effectivePrepDurationSeconds } from "@/lib/prep/session-duration";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    BrainCircuit,
    Calendar,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    CircleDot,
    CirclePlay,
    Clock,
    Download,
    Loader2,
    Search,
    Sparkles,
    Timer,
    Trash2,
    X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { scoreTone } from "./prep-types";

export type PracticeSessionSummary = {
  id: string;
  interviewId: string;
  interviewTitle: string;
  mode: string;
  status: string;
  timed: boolean;
  durationLimitMinutes: number | null;
  startedAt: string;
  lastActivityAt: string;
  completedAt: string | null;
  totalDurationSeconds: number | null;
  createdAt: string;
  attemptCount: number;
  averageScore: number | null;
  bestScore: number | null;
  questionCount: number;
};

type SortKey =
  | "interview"
  | "status"
  | "mode"
  | "score"
  | "attempts"
  | "duration"
  | "started"
  | "completed";

type SortDir = "asc" | "desc";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const TIME_RANGE_OPTIONS = [
  { value: "ALL", label: "All Time" },
  { value: "1d", label: "Past 1 day" },
  { value: "3d", label: "Past 3 days" },
  { value: "7d", label: "Past 7 days" },
  { value: "14d", label: "Past 14 days" },
  { value: "30d", label: "Past 30 days" },
  { value: "90d", label: "Past 90 days" },
] as const;

function getTimeRangeCutoff(value: string): Date | null {
  const now = Date.now();
  const ms: Record<string, number> = {
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

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "-";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatDate(date: string | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function practiceSessionHref(row: PracticeSessionSummary): string {
  const base = `/practice/${row.interviewId}`;
  if (row.status === "IN_PROGRESS") {
    return `${base}?session=${row.id}`;
  }
  return base;
}

function practiceSessionActionLabel(row: PracticeSessionSummary): string {
  if (row.status === "COMPLETED") return "Session completed";
  return row.status === "IN_PROGRESS" ? "Resume practice" : "Practice again";
}

function practiceSessionDisabledReason(row: PracticeSessionSummary): string {
  if (row.status === "COMPLETED") {
    return "This session is completed and cannot be resumed.";
  }
  return practiceSessionActionLabel(row);
}

function isPracticeSessionActionDisabled(row: PracticeSessionSummary): boolean {
  return row.status === "COMPLETED";
}

function effectiveDuration(row: PracticeSessionSummary): number | null {
  return effectivePrepDurationSeconds(row);
}

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "COMPLETED":
      return "default";
    case "IN_PROGRESS":
      return "outline";
    case "ABANDONED":
      return "destructive";
    default:
      return "secondary";
  }
}

function statusLabel(status: string): string {
  return status.replace("_", " ");
}

function getSortValue(row: PracticeSessionSummary, key: SortKey): string | number {
  switch (key) {
    case "interview":
      return row.interviewTitle.toLowerCase();
    case "status":
      return row.status;
    case "mode":
      return row.mode;
    case "score":
      return row.averageScore ?? -1;
    case "attempts":
      return row.attemptCount;
    case "duration":
      return effectiveDuration(row) ?? -1;
    case "started":
      return row.startedAt ? new Date(row.startedAt).getTime() : -1;
    case "completed":
      return row.completedAt ? new Date(row.completedAt).getTime() : -1;
  }
}

function SortableHead({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = activeKey === sortKey;
  return (
    <TableHead
      className="group cursor-pointer select-none whitespace-nowrap hover:text-foreground"
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

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <Icon className="h-8 w-8 text-primary" />
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={cn("text-2xl font-bold", tone)}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function PracticeSessionsDashboard({
  title = "Practices",
  subtitle = "Track your interview practice sessions and coaching progress.",
  rows,
  isLoading,
  showInterviewColumn = true,
  showHeader = true,
  showMetrics = true,
  allowSelection = true,
  primaryAction,
  toolbarAction,
}: {
  title?: string;
  subtitle?: string;
  rows: PracticeSessionSummary[];
  isLoading?: boolean;
  showInterviewColumn?: boolean;
  showHeader?: boolean;
  showMetrics?: boolean;
  allowSelection?: boolean;
  primaryAction?: React.ReactNode;
  toolbarAction?: React.ReactNode;
}) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [timeRange, setTimeRange] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("started");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deleteMutation = trpc.prep.deleteSessions.useMutation({
    onSuccess: (result) => {
      setSelectedIds(new Set());
      utils.prep.listSessions.invalidate();
      toast({
        title: `${result.deleted} practice ${result.deleted === 1 ? "session" : "sessions"} deleted`,
      });
    },
    onError: (err) => {
      toast({
        title: "Could not delete practices",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const metrics = useMemo(() => {
    const completed = rows.filter((row) => row.status === "COMPLETED").length;
    const scored = rows
      .map((row) => row.averageScore)
      .filter((score): score is number => typeof score === "number");
    const durations = rows
      .map(effectiveDuration)
      .filter((value): value is number => typeof value === "number" && value > 0);
    const averageScore =
      scored.length > 0
        ? scored.reduce((sum, score) => sum + score, 0) / scored.length
        : null;
    const averageDuration =
      durations.length > 0
        ? durations.reduce((sum, value) => sum + value, 0) / durations.length
        : null;

    return {
      total: rows.length,
      completed,
      averageScore,
      averageDuration,
    };
  }, [rows]);

  const processedRows = useMemo(() => {
    let result = rows;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (row) =>
          row.interviewTitle.toLowerCase().includes(query) ||
          row.status.toLowerCase().includes(query),
      );
    }

    if (statusFilter !== "ALL") {
      result = result.filter((row) => row.status === statusFilter);
    }

    const cutoff = getTimeRangeCutoff(timeRange);
    if (cutoff) {
      result = result.filter((row) => new Date(row.startedAt) >= cutoff);
    }

    result = [...result].sort((a, b) => {
      const aValue = getSortValue(a, sortKey);
      const bValue = getSortValue(b, sortKey);
      const comparison =
        typeof aValue === "number" && typeof bValue === "number"
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue));
      return sortDir === "asc" ? comparison : -comparison;
    });

    return result;
  }, [rows, searchQuery, sortDir, sortKey, statusFilter, timeRange]);

  const totalPages = Math.max(1, Math.ceil(processedRows.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paginatedRows = processedRows.slice(
    safePage * pageSize,
    (safePage + 1) * pageSize,
  );
  const pageIds = paginatedRows.map((row) => row.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));
  const isFiltering =
    searchQuery.trim() || statusFilter !== "ALL" || timeRange !== "ALL";

  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = new Set(rows.map((row) => row.id));
      const next = new Set(Array.from(prev).filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "started" || key === "completed" ? "desc" : "asc");
    }
    setPage(0);
  };

  const handleExport = () => {
    const exportRows = processedRows.map((row) => ({
      Interview: row.interviewTitle,
      Status: statusLabel(row.status),
      Mode: row.mode,
      Timed: row.timed ? "Yes" : "No",
      "Questions in template": row.questionCount,
      "Attempts submitted": row.attemptCount,
      "Average score":
        row.averageScore !== null ? Number(row.averageScore.toFixed(1)) : "",
      "Best score": row.bestScore !== null ? Number(row.bestScore.toFixed(1)) : "",
      Duration: formatDuration(effectiveDuration(row)),
      Started: formatDate(row.startedAt),
      Completed: formatDate(row.completedAt),
    }));
    exportToXlsx(
      exportRows,
      `practices-${new Date().toISOString().slice(0, 10)}`,
    );
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  return (
    <TooltipProvider>
    <div className="space-y-6" data-testid="practices-dashboard">
      {showHeader ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="text-muted-foreground">{subtitle}</p>
          </div>
          {primaryAction}
        </div>
      ) : null}

      {showMetrics ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={BrainCircuit} label="Total Practices" value={metrics.total} />
          <Metric
            icon={CheckCircle2}
            label="Completed"
            value={metrics.completed}
          />
          <Metric
            icon={Sparkles}
            label="Avg Score"
            value={
              metrics.averageScore !== null
                ? `${metrics.averageScore.toFixed(1)}/10`
                : "N/A"
            }
            tone={
              metrics.averageScore !== null
                ? scoreTone(metrics.averageScore)
                : undefined
            }
          />
          <Metric
            icon={Clock}
            label="Avg Duration"
            value={formatDuration(metrics.averageDuration)}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={
              showInterviewColumn
                ? "Search by interview or status..."
                : "Search by status..."
            }
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setPage(0);
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={timeRange}
          onValueChange={(value) => {
            setTimeRange(value);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-full xl:w-[160px]">
            <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-full xl:w-[160px]">
            <CircleDot className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="ABANDONED">Abandoned</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={handleExport}
          disabled={processedRows.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>

        {allowSelection && selectedIds.size > 0 ? (
          <>
            <Button
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={deleteMutation.isLoading}
            >
              {deleteMutation.isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete ({selectedIds.size})
            </Button>
            <Button variant="outline" onClick={() => setSelectedIds(new Set())}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          </>
        ) : (
          toolbarAction
        )}
      </div>

      <div className="rounded-lg border" data-testid="practices-table">
        {isLoading ? (
          <div className="p-6">
            <Skeleton className="h-48" />
          </div>
        ) : processedRows.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {isFiltering
              ? "No practices match your filters."
              : "No practice sessions yet."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto code-scrollbar">
              <Table className="border-collapse">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {showInterviewColumn ? (
                      <TableHead className="min-w-[240px]">
                        <div className="flex items-center gap-3">
                          {allowSelection ? (
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
                          ) : null}
                          <span
                            className="inline-flex cursor-pointer select-none items-center gap-1 whitespace-nowrap hover:text-foreground"
                            onClick={() => handleSort("interview")}
                          >
                            Interview
                            {sortKey === "interview" ? (
                              sortDir === "asc" ? (
                                <ArrowUp className="h-3.5 w-3.5" />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                            )}
                          </span>
                        </div>
                      </TableHead>
                    ) : null}
                    {!showInterviewColumn && allowSelection ? (
                      <TableHead className="w-12">
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
                    ) : null}
                    <SortableHead
                      label="Status"
                      sortKey="status"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHead
                      label="Score"
                      sortKey="score"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHead
                      label="Attempts"
                      sortKey="attempts"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHead
                      label="Mode"
                      sortKey="mode"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHead
                      label="Duration"
                      sortKey="duration"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHead
                      label="Started"
                      sortKey="started"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHead
                      label="Completed"
                      sortKey="completed"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                    <TableHead className="whitespace-nowrap text-right">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={selectedIds.has(row.id) ? "selected" : undefined}
                    >
                      {showInterviewColumn ? (
                        <TableCell className="min-w-[220px] font-medium">
                          <div className="flex items-center gap-3">
                            {allowSelection ? (
                              <Checkbox
                                checked={selectedIds.has(row.id)}
                                onCheckedChange={() => toggleSelect(row.id)}
                              />
                            ) : null}
                            <Link
                              href={`/interviews/${row.interviewId}/edit/prep`}
                              className="hover:underline"
                            >
                              {row.interviewTitle}
                            </Link>
                          </div>
                        </TableCell>
                      ) : null}
                      {!showInterviewColumn && allowSelection ? (
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(row.id)}
                            onCheckedChange={() => toggleSelect(row.id)}
                          />
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <Badge
                          variant={statusVariant(row.status)}
                          className="whitespace-nowrap"
                        >
                          {statusLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.averageScore !== null ? (
                          <span
                            className={cn(
                              "font-semibold",
                              scoreTone(row.averageScore),
                            )}
                          >
                            {row.averageScore.toFixed(1)}/10
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="whitespace-nowrap">
                          {row.attemptCount}/{row.questionCount || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{row.mode}</Badge>
                          {row.timed ? (
                            <Badge variant="secondary" className="gap-1">
                              <Timer className="h-3 w-3" />
                              {row.durationLimitMinutes}m
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDuration(effectiveDuration(row))}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(row.startedAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(row.completedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {isPracticeSessionActionDisabled(row) ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled
                                  aria-label={practiceSessionActionLabel(row)}
                                >
                                  <CirclePlay className="h-4 w-4" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              {practiceSessionDisabledReason(row)}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={practiceSessionActionLabel(row)}
                          >
                            <Link
                              href={practiceSessionHref(row)}
                              target="_blank"
                            >
                              <CirclePlay className="h-4 w-4" />
                              <span className="sr-only">
                                {practiceSessionActionLabel(row)}
                              </span>
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {processedRows.length > PAGE_SIZE_OPTIONS[0] && (
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
                    {safePage * pageSize + 1}–
                    {Math.min(
                      (safePage + 1) * pageSize,
                      processedRows.length,
                    )}{" "}
                    of {processedRows.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((value) => Math.max(0, value - 1))}
                    disabled={safePage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    {safePage + 1} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPage((value) => Math.min(totalPages - 1, value + 1))
                    }
                    disabled={safePage >= totalPages - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete practice sessions</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} practice{" "}
              {selectedIds.size === 1 ? "session" : "sessions"}? This will
              permanently remove the selected practice attempts and feedback.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteMutation.mutate({ ids: Array.from(selectedIds) });
                setConfirmDelete(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}
