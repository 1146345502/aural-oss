/* eslint-disable @typescript-eslint/no-explicit-any */
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { exportToXlsx } from "@/lib/export-xlsx";
import { getSessionOverallScore } from "@/lib/session-score";
import { trpc } from "@/lib/trpc/client";
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Calendar,
    Check,
    ChevronLeft,
    ChevronRight,
    CircleDot,
    ClipboardList,
    Clock,
    Download,
    FileSpreadsheet,
    FileText,
    GripVertical,
    Link as LinkIcon,
    Loader2,
    Plus,
    Search,
    Settings,
    Trash2,
    UserCheck,
    UserPlus,
    Users,
    X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CandidateCreateDialog } from "./candidate-create-dialog";
import { CandidateImportDialog } from "./candidate-import-dialog";
import { ResumeImportDialog } from "./resume-import-dialog";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CandidateManagerProps {
  interviewId: string;
  interview: any;
  onViewSession: (sessionId: string) => void;
}

type CandidateRow = {
  type: "candidate";
  id: string;
  email: string | null;
  name: string;
  phone: string | null;
  gender: string | null;
  birthday: string | null;
  education: string | null;
  school: string | null;
  major: string | null;
  graduationYear: number | null;
  workExperience: string | null;
  notes: string | null;
  inviteToken: string | null;
  session: any;
  createdAt: string;
};

type WalkInRow = {
  type: "walkin";
  id: string;
  email: string | null;
  name: string | null;
  session: any;
};

type UnifiedRow = CandidateRow | WalkInRow;

type SortKey =
  | "name"
  | "email"
  | "phone"
  | "gender"
  | "birthday"
  | "education"
  | "school"
  | "major"
  | "gradYear"
  | "experience"
  | "notes"
  | "score"
  | "duration"
  | "started"
  | "finished"
  | "source"
  | "status"
  | "created";

type SortDir = "asc" | "desc";

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

type ColumnDef = {
  key: string;
  label: string;
  sortKey?: SortKey;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
};

const COLUMNS: ColumnDef[] = [
  {
    key: "name",
    label: "Name",
    sortKey: "name",
    defaultVisible: true,
    alwaysVisible: true,
  },
  { key: "email", label: "Email", sortKey: "email", defaultVisible: true },
  { key: "phone", label: "Phone", sortKey: "phone", defaultVisible: false },
  { key: "gender", label: "Gender", sortKey: "gender", defaultVisible: false },
  {
    key: "birthday",
    label: "Birthday",
    sortKey: "birthday",
    defaultVisible: false,
  },
  {
    key: "education",
    label: "Education",
    sortKey: "education",
    defaultVisible: false,
  },
  { key: "school", label: "School", sortKey: "school", defaultVisible: false },
  { key: "major", label: "Major", sortKey: "major", defaultVisible: false },
  {
    key: "gradYear",
    label: "Grad Year",
    sortKey: "gradYear",
    defaultVisible: false,
  },
  {
    key: "experience",
    label: "Experience",
    sortKey: "experience",
    defaultVisible: false,
  },
  { key: "notes", label: "Notes", sortKey: "notes", defaultVisible: false },
  {
    key: "created",
    label: "Created",
    sortKey: "created",
    defaultVisible: true,
  },
  { key: "score", label: "Score", sortKey: "score", defaultVisible: true },
  {
    key: "duration",
    label: "Duration",
    sortKey: "duration",
    defaultVisible: true,
  },
  {
    key: "started",
    label: "Started",
    sortKey: "started",
    defaultVisible: true,
  },
  {
    key: "finished",
    label: "Finished",
    sortKey: "finished",
    defaultVisible: true,
  },
  { key: "source", label: "Source", sortKey: "source", defaultVisible: true },
  { key: "status", label: "Status", sortKey: "status", defaultVisible: true },
];

const DEFAULT_VISIBLE = new Set(
  COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
);

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getSessionStatus(row: UnifiedRow): string {
  const session = row.session;
  if (!session) return "Not Started";
  return session.status;
}

function getSessionBadgeVariant(
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

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "-";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
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

function getStartDate(row: UnifiedRow): string | null {
  const s = row.session;
  if (!s) return null;
  return s.startedAt ?? s.createdAt ?? null;
}

function getCandidateField(row: UnifiedRow): CandidateRow | null {
  return row.type === "candidate" ? (row as CandidateRow) : null;
}

function getSessionScore(row: UnifiedRow): number | null {
  const session = row.session;
  if (!session?.insights) return null;
  return getSessionOverallScore(
    session.insights as {
      questionEvaluations?: { score: number }[];
      criteriaEvaluations?: { score: number }[];
    },
  );
}

function getSortValue(row: UnifiedRow, key: SortKey): string | number {
  const c = getCandidateField(row);
  switch (key) {
    case "name":
      return (row.name ?? "").toLowerCase();
    case "email":
      return (row.email ?? "").toLowerCase();
    case "phone":
      return (c?.phone ?? "").toLowerCase();
    case "gender":
      return (c?.gender ?? "").toLowerCase();
    case "birthday":
      return c?.birthday ?? "";
    case "education":
      return (c?.education ?? "").toLowerCase();
    case "school":
      return (c?.school ?? "").toLowerCase();
    case "major":
      return (c?.major ?? "").toLowerCase();
    case "gradYear":
      return c?.graduationYear ?? -1;
    case "experience":
      return (c?.workExperience ?? "").toLowerCase();
    case "notes":
      return (c?.notes ?? "").toLowerCase();
    case "created":
      return c?.createdAt ? new Date(c.createdAt).getTime() : -1;
    case "score":
      return getSessionScore(row) ?? -1;
    case "duration":
      return row.session?.totalDurationSeconds ?? -1;
    case "started":
      return getStartDate(row) ? new Date(getStartDate(row)!).getTime() : -1;
    case "finished":
      return row.session?.completedAt
        ? new Date(row.session.completedAt).getTime()
        : -1;
    case "source":
      return row.type === "walkin" ? "Walk-in" : "Invited";
    case "status":
      return getSessionStatus(row);
  }
}

/* ------------------------------------------------------------------ */
/*  Sortable Header                                                    */
/* ------------------------------------------------------------------ */

function SortableHead({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CandidateManager({
  interviewId,
  onViewSession,
}: CandidateManagerProps) {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // ── State ──
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [timeRange, setTimeRange] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey | null>("created");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [resumeImportOpen, setResumeImportOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] =
    useState<Set<string>>(DEFAULT_VISIBLE);

  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    COLUMNS.map((c) => c.key),
  );

  const toggleColumn = useCallback((key: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Column reorder via document-level pointer tracking ──
  const [draggingCol, setDraggingCol] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const draggingColRef = useRef<string | null>(null);
  const dragOverColRef = useRef<string | null>(null);

  const handleGripPointerDown = useCallback(
    (key: string, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      draggingColRef.current = key;
      dragOverColRef.current = null;
      setDraggingCol(key);
      setDragOverCol(null);
    },
    [],
  );

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingColRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest<HTMLElement>("[data-col-key]");
      const key = row?.dataset.colKey ?? null;
      if (
        key &&
        key !== draggingColRef.current &&
        key !== dragOverColRef.current
      ) {
        dragOverColRef.current = key;
        setDragOverCol(key);
      } else if (!key && dragOverColRef.current) {
        dragOverColRef.current = null;
        setDragOverCol(null);
      }
    };

    const onPointerUp = () => {
      const src = draggingColRef.current;
      const tgt = dragOverColRef.current;
      if (src && tgt && src !== tgt) {
        setColumnOrder((prev) => {
          const next = [...prev];
          const srcIdx = next.indexOf(src);
          const tgtIdx = next.indexOf(tgt);
          if (srcIdx === -1 || tgtIdx === -1) return prev;
          next.splice(srcIdx, 1);
          next.splice(tgtIdx, 0, src);
          return next;
        });
      }
      draggingColRef.current = null;
      dragOverColRef.current = null;
      setDraggingCol(null);
      setDragOverCol(null);
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const orderedColumns = useMemo(() => {
    const orderMap = new Map(columnOrder.map((key, idx) => [key, idx]));
    return [...COLUMNS].sort(
      (a, b) => (orderMap.get(a.key) ?? 0) - (orderMap.get(b.key) ?? 0),
    );
  }, [columnOrder]);

  // ── Data ──
  const candidateList = trpc.candidate.list.useQuery({ interviewId });
  const insights = trpc.analysis.getInterviewInsights.useQuery({ interviewId });

  const removeCandidatesMutation = trpc.candidate.removeMany.useMutation({
    onSuccess: () => invalidateAll(),
    onError: (err) => {
      toast({
        title: "Failed to remove sessions",
        description: err.message,
        variant: "destructive",
      });
    },
  });
  const removeSessionsMutation = trpc.session.deleteMany.useMutation({
    onSuccess: () => invalidateAll(),
    onError: (err) => {
      toast({
        title: "Failed to remove sessions",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const invalidateAll = useCallback(() => {
    utils.candidate.list.invalidate({ interviewId });
    utils.analysis.getInterviewInsights.invalidate({ interviewId });
  }, [utils, interviewId]);

  const handleCopyInviteLink = useCallback(
    (inviteToken: string) => {
      const link = `${window.location.origin}/i/invite/${inviteToken}`;
      navigator.clipboard.writeText(link);
      toast({ title: "Invite link copied!" });
    },
    [toast],
  );

  // ── Build unified rows ──
  const candidates: CandidateRow[] = (candidateList.data?.candidates ?? []).map(
    (c: any) => ({
      type: "candidate" as const,
      id: c.id,
      email: c.email,
      name: c.name,
      phone: c.phone,
      gender: c.gender ?? null,
      birthday: c.birthday ?? null,
      education: c.education ?? null,
      school: c.school ?? null,
      major: c.major ?? null,
      graduationYear: c.graduationYear ?? null,
      workExperience: c.workExperience ?? null,
      notes: c.notes ?? null,
      inviteToken: c.inviteToken,
      session: c.session,
      createdAt: c.createdAt,
    }),
  );

  const walkIns: WalkInRow[] = (candidateList.data?.walkInSessions ?? []).map(
    (s: any) => ({
      type: "walkin" as const,
      id: s.id,
      email: s.participantEmail,
      name: s.participantName,
      session: s,
    }),
  );

  const isFiltering =
    searchQuery.trim() || statusFilter !== "ALL" || timeRange !== "ALL";

  // ── Filter + Sort ──
  const processedRows = useMemo(() => {
    const allRows: UnifiedRow[] = [...candidates, ...walkIns];
    let result = allRows;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (row) =>
          (row.email?.toLowerCase().includes(q) ?? false) ||
          (row.name?.toLowerCase().includes(q) ?? false),
      );
    }

    if (statusFilter !== "ALL") {
      result = result.filter((row) => {
        const s = getSessionStatus(row);
        if (statusFilter === "NOT_STARTED") return s === "Not Started";
        return s === statusFilter;
      });
    }

    const cutoff = getTimeRangeCutoff(timeRange);
    if (cutoff) {
      result = result.filter((row) => {
        const started = getStartDate(row);
        if (!started) return false;
        return new Date(started) >= cutoff;
      });
    }

    if (sortKey) {
      result = [...result].sort((a, b) => {
        const va = getSortValue(a, sortKey);
        const vb = getSortValue(b, sortKey);
        const cmp =
          typeof va === "number" && typeof vb === "number"
            ? va - vb
            : String(va).localeCompare(String(vb));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [candidates, walkIns, searchQuery, statusFilter, timeRange, sortKey, sortDir]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(processedRows.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paginatedRows = useMemo(
    () => processedRows.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [processedRows, safePage, pageSize],
  );

  // ── Sort handler ──
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "started" || key === "finished" || key === "created"
          ? "desc"
          : "asc",
      );
    }
    setPage(0);
  };

  // ── Multi-select ──
  const pageIds = paginatedRows.map((r) => `${r.type}-${r.id}`);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));

  const toggleSelect = useCallback((compositeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(compositeId)) next.delete(compositeId);
      else next.add(compositeId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }, [allPageSelected, pageIds]);

  const isBulkDeleting =
    removeCandidatesMutation.isLoading || removeSessionsMutation.isLoading;

  const handleBulkDelete = useCallback(() => {
    const candidateIds = Array.from(selectedIds)
      .filter((id) => id.startsWith("candidate-"))
      .map((id) => id.replace("candidate-", ""));
    const sessionIds = Array.from(selectedIds)
      .filter((id) => id.startsWith("walkin-"))
      .map((id) => id.replace("walkin-", ""));

    let pending = 0;
    const onDone = () => {
      pending--;
      if (pending === 0) {
        toast({
          title: `${selectedIds.size} entry${selectedIds.size > 1 ? "s" : ""} removed`,
        });
        setSelectedIds(new Set());
      }
    };

    if (candidateIds.length > 0) {
      pending++;
      removeCandidatesMutation.mutate(
        { ids: candidateIds },
        { onSuccess: onDone },
      );
    }
    if (sessionIds.length > 0) {
      pending++;
      removeSessionsMutation.mutate({ ids: sessionIds }, { onSuccess: onDone });
    }
  }, [selectedIds, removeCandidatesMutation, removeSessionsMutation, toast]);

  // Clear selection when data changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [candidateList.data]);

  const handleExport = useCallback(() => {
    const nameCol = COLUMNS.find((c) => c.alwaysVisible)!;
    const dynCols = COLUMNS.filter(
      (c) => c !== nameCol && visibleColumns.has(c.key),
    );
    const exportCols = [nameCol, ...dynCols];

    const rows = processedRows.map((row) => {
      const c = getCandidateField(row);
      const status = getSessionStatus(row);
      const session = row.session;
      const hasSession = !!session && status !== "Not Started";
      const record: Record<string, string | number | null> = {};
      for (const col of exportCols) {
        switch (col.key) {
          case "name":
            record[col.label] = row.name || "";
            break;
          case "email":
            record[col.label] = row.email || "";
            break;
          case "phone":
            record[col.label] = c?.phone || "";
            break;
          case "gender":
            record[col.label] = c?.gender || "";
            break;
          case "birthday":
            record[col.label] = c?.birthday || "";
            break;
          case "education":
            record[col.label] = c?.education || "";
            break;
          case "school":
            record[col.label] = c?.school || "";
            break;
          case "major":
            record[col.label] = c?.major || "";
            break;
          case "gradYear":
            record[col.label] = c?.graduationYear ?? "";
            break;
          case "experience":
            record[col.label] = c?.workExperience || "";
            break;
          case "notes":
            record[col.label] = c?.notes || "";
            break;
          case "created":
            record[col.label] = c?.createdAt ? formatDate(c.createdAt) : "";
            break;
          case "score": {
            const sv = getSessionScore(row);
            record[col.label] = sv !== null ? Number(sv.toFixed(1)) : "";
            break;
          }
          case "duration":
            record[col.label] = hasSession
              ? formatDuration(session.totalDurationSeconds)
              : "";
            break;
          case "started":
            record[col.label] = hasSession ? formatDate(getStartDate(row)) : "";
            break;
          case "finished":
            record[col.label] =
              hasSession && session.completedAt
                ? formatDate(session.completedAt)
                : "";
            break;
          case "source":
            record[col.label] = row.type === "walkin" ? "Walk-in" : "Invited";
            break;
          case "status":
            record[col.label] =
              status === "Not Started"
                ? "NOT STARTED"
                : status.replace("_", " ");
            break;
        }
      }
      return record;
    });
    exportToXlsx(rows, `candidates-${new Date().toISOString().slice(0, 10)}`);
  }, [processedRows, visibleColumns]);

  // ── Stats ──
  const totalCandidates = candidates.length + walkIns.length;
  const completedCount = [...candidates, ...walkIns].filter(
    (r: UnifiedRow) => getSessionStatus(r) === "COMPLETED",
  ).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Total Sessions</p>
              <p className="text-2xl font-bold">{totalCandidates}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <UserCheck className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold">{completedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <Clock className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Avg Duration</p>
              <p className="text-2xl font-bold">
                {insights.data?.avgDurationSeconds
                  ? `${Math.round(insights.data.avgDurationSeconds / 60)}m`
                  : "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters toolbar — matching sessions table layout */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
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
          <SelectTrigger className="w-[160px]">
            <CircleDot className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="NOT_STARTED">Not Started</SelectItem>
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

        {/* Bulk actions / Import+Add */}
        {selectedIds.size > 0 ? (
          <>
            <Button
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete ({selectedIds.size})
            </Button>
            <Button variant="outline" onClick={() => setSelectedIds(new Set())}>
              <X className="mr-1 h-4 w-4" />
              Cancel
            </Button>
          </>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button data-tour="add-session">
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                data-tour="create-individually"
                onClick={() => setCreateOpen(true)}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Create individually
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Import by Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setResumeImportOpen(true)}>
                <FileText className="mr-2 h-4 w-4" />
                Import by resumes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        {candidateList.isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : processedRows.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {isFiltering
              ? "No sessions match your filters."
              : "No sessions yet. Add sessions individually or import them in bulk."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto code-scrollbar">
              <Table className="border-collapse">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {/* Frozen left: checkbox + name (single cell to avoid gap) */}
                    <TableHead className="sticky left-0 z-20 min-w-[180px] bg-background shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <div className="flex items-center gap-3">
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
                        <span
                          className="inline-flex cursor-pointer items-center gap-1 select-none whitespace-nowrap hover:text-foreground"
                          onClick={() => handleSort("name")}
                        >
                          Name
                          {sortKey === "name" ? (
                            sortDir === "asc" ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowDown className="h-3.5 w-3.5" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-40" />
                          )}
                        </span>
                      </div>
                    </TableHead>
                    {/* Dynamic columns (skip name — it's frozen) */}
                    {orderedColumns
                      .filter(
                        (col) =>
                          col.key !== "name" && visibleColumns.has(col.key),
                      )
                      .map((col) =>
                        col.sortKey ? (
                          <SortableHead
                            key={col.key}
                            label={col.label}
                            sortKey={col.sortKey}
                            activeKey={sortKey}
                            direction={sortDir}
                            onSort={handleSort}
                          />
                        ) : (
                          <TableHead
                            key={col.key}
                            className="whitespace-nowrap"
                          >
                            {col.label}
                          </TableHead>
                        ),
                      )}
                    {/* Frozen right: gear icon */}
                    <TableHead className="sticky right-0 z-20 w-10 bg-background shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                          >
                            <Settings className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-48 p-1">
                          <div className="max-h-[320px] overflow-y-auto code-scrollbar">
                            {orderedColumns
                              .filter((col) => !col.alwaysVisible)
                              .map((col) => (
                                <div
                                  key={col.key}
                                  data-col-key={col.key}
                                  className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors ${
                                    draggingCol === col.key
                                      ? "bg-accent/80 opacity-50"
                                      : dragOverCol === col.key
                                        ? "border-t-2 border-primary bg-primary/5"
                                        : "hover:bg-accent"
                                  }`}
                                >
                                  <GripVertical
                                    className="h-3.5 w-3.5 shrink-0 cursor-grab touch-none text-muted-foreground/50 active:cursor-grabbing"
                                    onPointerDown={(e) =>
                                      handleGripPointerDown(col.key, e)
                                    }
                                  />
                                  <span
                                    className="flex-1 cursor-pointer select-none text-left"
                                    onClick={() => {
                                      if (!draggingCol) toggleColumn(col.key);
                                    }}
                                  >
                                    {col.label}
                                  </span>
                                  {visibleColumns.has(col.key) && (
                                    <Check className="h-4 w-4 shrink-0 text-primary" />
                                  )}
                                </div>
                              ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRows.map((row) => {
                    const status = getSessionStatus(row);
                    const session = row.session;
                    const hasSession = !!session && status !== "Not Started";
                    const compositeId = `${row.type}-${row.id}`;
                    const c = getCandidateField(row);

                    const cellValues: Record<string, JSX.Element | string> = {
                      email: (
                        <span className="text-muted-foreground">
                          {row.email || "-"}
                        </span>
                      ),
                      phone: (
                        <span className="whitespace-nowrap text-muted-foreground">
                          {c?.phone || "-"}
                        </span>
                      ),
                      gender: (
                        <span className="text-muted-foreground">
                          {c?.gender || "-"}
                        </span>
                      ),
                      birthday: (
                        <span className="text-muted-foreground">
                          {c?.birthday || "-"}
                        </span>
                      ),
                      education: (
                        <span className="text-muted-foreground">
                          {c?.education || "-"}
                        </span>
                      ),
                      school: (
                        <span className="max-w-[200px] truncate text-muted-foreground">
                          {c?.school || "-"}
                        </span>
                      ),
                      major: (
                        <span className="max-w-[160px] truncate text-muted-foreground">
                          {c?.major || "-"}
                        </span>
                      ),
                      gradYear: (
                        <span className="text-muted-foreground">
                          {c?.graduationYear || "-"}
                        </span>
                      ),
                      experience: (
                        <span className="text-muted-foreground">
                          {c?.workExperience || "-"}
                        </span>
                      ),
                      notes: (
                        <span
                          className="block max-w-[200px] truncate text-muted-foreground"
                          title={c?.notes || undefined}
                        >
                          {c?.notes || "-"}
                        </span>
                      ),
                      created: (
                        <span className="whitespace-nowrap">
                          {c?.createdAt ? formatDate(c.createdAt) : "-"}
                        </span>
                      ),
                      score: (() => {
                        const sv = getSessionScore(row);
                        if (sv === null)
                          return (
                            <span className="text-muted-foreground">-</span>
                          );
                        const sc =
                          sv >= 7
                            ? "text-green-700 dark:text-green-400"
                            : sv >= 4
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-red-700 dark:text-red-400";
                        return (
                          <span className={`font-semibold ${sc}`}>
                            {sv.toFixed(1)}/10
                          </span>
                        );
                      })(),
                      duration: hasSession
                        ? formatDuration(session.totalDurationSeconds)
                        : "-",
                      started: (
                        <span className="whitespace-nowrap">
                          {hasSession ? formatDate(getStartDate(row)) : "-"}
                        </span>
                      ),
                      finished: (
                        <span className="whitespace-nowrap">
                          {hasSession && session.completedAt
                            ? formatDate(session.completedAt)
                            : "-"}
                        </span>
                      ),
                      source:
                        row.type === "walkin" ? (
                          <Badge
                            variant="secondary"
                            className="whitespace-nowrap text-xs"
                          >
                            Walk-in
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="whitespace-nowrap border-transparent bg-primary/5 text-xs text-primary"
                          >
                            Invited
                          </Badge>
                        ),
                      status: (
                        <Badge
                          variant={getSessionBadgeVariant(status)}
                          className="whitespace-nowrap"
                        >
                          {status === "Not Started"
                            ? "NOT STARTED"
                            : status.replace("_", " ")}
                        </Badge>
                      ),
                    };

                    return (
                      <TableRow
                        key={compositeId}
                        className={hasSession ? "cursor-pointer" : undefined}
                        data-state={
                          selectedIds.has(compositeId) ? "selected" : undefined
                        }
                        onClick={
                          hasSession
                            ? () => onViewSession(session.id)
                            : undefined
                        }
                      >
                        {/* Frozen left: checkbox + name (single cell) */}
                        <TableCell className="sticky left-0 z-10 bg-background shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                          <div className="flex items-center gap-3">
                            <div onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedIds.has(compositeId)}
                                onCheckedChange={() =>
                                  toggleSelect(compositeId)
                                }
                              />
                            </div>
                            <span className="font-medium">
                              {row.name || (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </span>
                          </div>
                        </TableCell>
                        {/* Dynamic columns (skip name — it's frozen) */}
                        {orderedColumns
                          .filter(
                            (col) =>
                              col.key !== "name" && visibleColumns.has(col.key),
                          )
                          .map((col) => (
                            <TableCell key={col.key}>
                              {cellValues[col.key]}
                            </TableCell>
                          ))}
                        {/* Frozen right: actions */}
                        <TableCell
                          onClick={(e) => e.stopPropagation()}
                          className="sticky right-0 z-10 w-10 bg-background shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                        >
                          {hasSession && status === "COMPLETED" ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="View report"
                              onClick={() => onViewSession(session.id)}
                            >
                              <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          ) : row.type === "candidate" && row.inviteToken ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Copy invite link"
                              data-tour="copy-link"
                              onClick={() =>
                                handleCopyInviteLink(row.inviteToken!)
                              }
                            >
                              <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
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
                    {Math.min((safePage + 1) * pageSize, processedRows.length)}{" "}
                    of {processedRows.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
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
                      setPage((p) => Math.min(totalPages - 1, p + 1))
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sessions</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} session
              {selectedIds.size > 1 ? "s" : ""}? This will permanently remove
              the selected entries and any associated data. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                handleBulkDelete();
                setConfirmDelete(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialogs */}
      <CandidateCreateDialog
        interviewId={interviewId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={invalidateAll}
      />
      <CandidateImportDialog
        interviewId={interviewId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={invalidateAll}
      />
      <ResumeImportDialog
        interviewId={interviewId}
        open={resumeImportOpen}
        onOpenChange={setResumeImportOpen}
        onImported={invalidateAll}
      />
    </div>
  );
}
