"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
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
  ExternalLink,
  GripVertical,
  Loader2,
  Search,
  Settings,
  Trash2,
  X,
  Download,
} from "lucide-react";
import { exportToXlsx } from "@/lib/export-xlsx";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SessionRow {
  id: string;
  participantName: string | null;
  participantEmail: string | null;
  status: string;
  totalDurationSeconds: number | null;
  createdAt: string | Date;
  _count: { messages: number };
  interview?: { id: string; title: string };
}

type SortKey =
  | "interview"
  | "participant"
  | "email"
  | "status"
  | "messages"
  | "duration"
  | "date";

type SortDir = "asc" | "desc";

export interface SessionsTableProps {
  sessions: SessionRow[];
  isLoading: boolean;
  showInterviewColumn?: boolean;
  onSessionClick: (session: SessionRow) => void;
  onDeleteSuccess?: () => void;
  rowClickable?: boolean;
  searchPlaceholder?: string;
  emptyFilterMessage?: string;
  emptyMessage?: string;
}

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

type ColumnDef = {
  key: string;
  label: string;
  sortKey: SortKey;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
  /** Only shown when showInterviewColumn is true. */
  interviewOnly?: boolean;
};

const COLUMNS: ColumnDef[] = [
  { key: "interview",  label: "Interview",   sortKey: "interview",   defaultVisible: true,  alwaysVisible: true, interviewOnly: true },
  { key: "participant", label: "Participant", sortKey: "participant", defaultVisible: true },
  { key: "email",      label: "Email",       sortKey: "email",       defaultVisible: true },
  { key: "status",     label: "Status",      sortKey: "status",      defaultVisible: true },
  { key: "messages",   label: "Messages",    sortKey: "messages",    defaultVisible: true },
  { key: "duration",   label: "Duration",    sortKey: "duration",    defaultVisible: true },
  { key: "date",       label: "Date",        sortKey: "date",        defaultVisible: true },
];

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const TIME_RANGE_OPTIONS = [
  { value: "ALL", label: "All Time" },
  { value: "30m", label: "Past 30 min" },
  { value: "1h", label: "Past 1 hour" },
  { value: "6h", label: "Past 6 hours" },
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
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getSortValue(session: SessionRow, key: SortKey): string | number {
  switch (key) {
    case "interview":
      return (session.interview?.title ?? "").toLowerCase();
    case "participant":
      return (session.participantName ?? "").toLowerCase();
    case "email":
      return (session.participantEmail ?? "").toLowerCase();
    case "status":
      return session.status;
    case "messages":
      return session._count.messages;
    case "duration":
      return session.totalDurationSeconds ?? -1;
    case "date":
      return new Date(session.createdAt).getTime();
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

export function SessionsTable({
  sessions,
  isLoading,
  showInterviewColumn = false,
  onSessionClick,
  onDeleteSuccess,
  rowClickable = true,
  searchPlaceholder = "Search by participant or email...",
  emptyFilterMessage = "No sessions match your search.",
  emptyMessage = "No sessions found.",
}: SessionsTableProps) {
  const { toast } = useToast();

  // ── State ──
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [timeRange, setTimeRange] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)),
  );
  const [columnOrder, setColumnOrder] = useState<string[]>(
    () => COLUMNS.map((c) => c.key),
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

  const handleGripPointerDown = useCallback((key: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    draggingColRef.current = key;
    dragOverColRef.current = null;
    setDraggingCol(key);
    setDragOverCol(null);
  }, []);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingColRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest<HTMLElement>("[data-col-key]");
      const key = row?.dataset.colKey ?? null;
      if (key && key !== draggingColRef.current && key !== dragOverColRef.current) {
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

  // Active columns depending on context, sorted by columnOrder
  const activeColumns = useMemo(
    () => {
      const filtered = COLUMNS.filter((col) => {
        if (col.interviewOnly && !showInterviewColumn) return false;
        return true;
      });
      const orderMap = new Map(columnOrder.map((key, idx) => [key, idx]));
      return [...filtered].sort(
        (a, b) => (orderMap.get(a.key) ?? 0) - (orderMap.get(b.key) ?? 0),
      );
    },
    [showInterviewColumn, columnOrder],
  );

  // The first always-visible column is the frozen left column
  const frozenCol = activeColumns.find((c) => c.alwaysVisible);
  const dynamicColumns = activeColumns.filter(
    (c) => c !== frozenCol && visibleColumns.has(c.key),
  );

  // ── Mutations ──
  const deleteMutation = trpc.session.deleteMany.useMutation({
    onSuccess: ({ deleted }) => {
      toast({ title: `${deleted} session${deleted > 1 ? "s" : ""} deleted` });
      setSelectedIds(new Set());
      onDeleteSuccess?.();
    },
  });

  // ── Handlers ──
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
    setPage(0);
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isFiltering =
    searchQuery.trim() || timeRange !== "ALL" || statusFilter !== "ALL";

  // ── Filter + Sort ──
  const processedSessions = useMemo(() => {
    let result = sessions;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          (s.interview?.title ?? "").toLowerCase().includes(q) ||
          (s.participantName ?? "").toLowerCase().includes(q) ||
          (s.participantEmail ?? "").toLowerCase().includes(q),
      );
    }

    if (statusFilter !== "ALL") {
      result = result.filter((s) => s.status === statusFilter);
    }

    const cutoff = getTimeRangeCutoff(timeRange);
    if (cutoff) {
      result = result.filter(
        (s) => new Date(s.createdAt).getTime() >= cutoff.getTime(),
      );
    }

    if (sortKey) {
      result = [...result].sort((a, b) => {
        const aVal = getSortValue(a, sortKey);
        const bVal = getSortValue(b, sortKey);
        const cmp =
          typeof aVal === "number" && typeof bVal === "number"
            ? aVal - bVal
            : String(aVal).localeCompare(String(bVal));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [sessions, searchQuery, statusFilter, timeRange, sortKey, sortDir]);

  // ── Pagination ──
  const totalPages = Math.max(
    1,
    Math.ceil(processedSessions.length / pageSize),
  );
  const safePage = Math.min(page, totalPages - 1);
  const paginatedSessions = processedSessions.slice(
    safePage * pageSize,
    (safePage + 1) * pageSize,
  );

  // ── Multi-select ──
  const pageIds = paginatedSessions.map((s) => s.id);
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

  // ── Cell value renderer ──
  function getCellValue(session: SessionRow, key: string): JSX.Element | string {
    switch (key) {
      case "participant":
        return <span>{session.participantName || "Anonymous"}</span>;
      case "email":
        return (
          <span className="text-muted-foreground">
            {session.participantEmail || "-"}
          </span>
        );
      case "status":
        return (
          <Badge
            variant={session.status === "COMPLETED" ? "default" : "secondary"}
            className="whitespace-nowrap"
          >
            {session.status}
          </Badge>
        );
      case "messages":
        return <span>{session._count.messages}</span>;
      case "duration":
        return (
          <span>
            {session.totalDurationSeconds
              ? `${Math.round(session.totalDurationSeconds / 60)}m`
              : "-"}
          </span>
        );
      case "date":
        return (
          <span className="whitespace-nowrap">
            {new Date(session.createdAt).toLocaleString(undefined, {
              year: "numeric",
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        );
      default:
        return "-";
    }
  }

  // Frozen-left label and value for the interview column (when shown) or participant
  const frozenSortKey = frozenCol?.sortKey ?? "participant";
  const frozenLabel = frozenCol?.label ?? "Participant";

  function getFrozenCellContent(session: SessionRow): string {
    if (frozenCol?.key === "interview") {
      return session.interview?.title ?? "-";
    }
    return session.participantName || "Anonymous";
  }

  const handleExport = useCallback(() => {
    const visibleCols = [...(frozenCol ? [frozenCol] : []), ...dynamicColumns];
    const formatDate = (d: string | Date) =>
      new Date(d).toLocaleString(undefined, {
        year: "numeric", month: "numeric", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    const rows = processedSessions.map((s) => {
      const record: Record<string, string | number | null> = {};
      for (const col of visibleCols) {
        switch (col.key) {
          case "interview": record[col.label] = s.interview?.title ?? ""; break;
          case "participant": record[col.label] = s.participantName || "Anonymous"; break;
          case "email": record[col.label] = s.participantEmail || ""; break;
          case "status": record[col.label] = s.status; break;
          case "messages": record[col.label] = s._count.messages; break;
          case "duration": record[col.label] = s.totalDurationSeconds ? `${Math.round(s.totalDurationSeconds / 60)}m` : ""; break;
          case "date": record[col.label] = formatDate(s.createdAt); break;
        }
      }
      return record;
    });
    exportToXlsx(rows, `sessions-${new Date().toISOString().slice(0, 10)}`);
  }, [processedSessions, frozenCol, dynamicColumns]);

  return (
    <>
      {/* Filters row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
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
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={handleExport} disabled={processedSessions.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>

        {selectedIds.size > 0 && (
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
            <Button
              variant="outline"
              className="border-foreground/50 hover:bg-foreground/5"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="mr-1 h-4 w-4" />
              Cancel
            </Button>
          </>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        {isLoading ? (
          <div className="p-6">
            <Skeleton className="h-48" />
          </div>
        ) : processedSessions.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {isFiltering ? emptyFilterMessage : emptyMessage}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto code-scrollbar">
              <Table className="border-collapse">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {/* Frozen left: checkbox + first column */}
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
                          className="group inline-flex cursor-pointer items-center gap-1 select-none whitespace-nowrap hover:text-foreground"
                          onClick={() => handleSort(frozenSortKey)}
                        >
                          {frozenLabel}
                          {sortKey === frozenSortKey ? (
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

                    {/* Dynamic columns */}
                    {dynamicColumns.map((col) => (
                      <SortableHead
                        key={col.key}
                        label={col.label}
                        sortKey={col.sortKey}
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                      />
                    ))}

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
                            {activeColumns
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
                                    onPointerDown={(e) => handleGripPointerDown(col.key, e)}
                                  />
                                  <span
                                    className="flex-1 cursor-pointer select-none text-left"
                                    onClick={() => { if (!draggingCol) toggleColumn(col.key); }}
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
                  {paginatedSessions.map((session) => (
                    <TableRow
                      key={session.id}
                      className={rowClickable ? "cursor-pointer" : undefined}
                      data-state={
                        selectedIds.has(session.id) ? "selected" : undefined
                      }
                      onClick={
                        rowClickable
                          ? () => onSessionClick(session)
                          : undefined
                      }
                    >
                      {/* Frozen left: checkbox + first column value */}
                      <TableCell className="sticky left-0 z-10 bg-background shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        <div className="flex items-center gap-3">
                          <div
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={selectedIds.has(session.id)}
                              onCheckedChange={() =>
                                toggleSelect(session.id)
                              }
                            />
                          </div>
                          <span className="font-medium">
                            {getFrozenCellContent(session)}
                          </span>
                        </div>
                      </TableCell>

                      {/* Dynamic columns */}
                      {dynamicColumns.map((col) => (
                        <TableCell key={col.key}>
                          {getCellValue(session, col.key)}
                        </TableCell>
                      ))}

                      {/* Frozen right: action */}
                      <TableCell
                        onClick={(e) => e.stopPropagation()}
                        className="sticky right-0 z-10 w-10 bg-background shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                      >
                        {rowClickable && session.status === "COMPLETED" ? (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="View session details"
                            onClick={() => onSessionClick(session)}
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {processedSessions.length > PAGE_SIZE_OPTIONS[0] && (
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
                      processedSessions.length,
                    )}{" "}
                    of {processedSessions.length}
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
              all associated messages and data. This action cannot be undone.
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
    </>
  );
}
