"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useProject } from "@/components/project-provider";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { exportToXlsx } from "@/lib/export-xlsx";
import { trpc } from "@/lib/trpc/client";
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Calendar,
    ChevronLeft,
    ChevronRight,
    CircleDot,
    Code2,
    Copy,
    Download,
    HelpCircle,
    ListChecks,
    Loader2,
    MessageSquare,
    Microscope,
    PenLine,
    Search,
    Trash2,
    X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const QUESTION_TYPE_META: Record<
  string,
  { icon: React.ElementType; label: string; badgeClass: string }
> = {
  OPEN_ENDED: {
    icon: MessageSquare,
    label: "Open Ended",
    badgeClass:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  SINGLE_CHOICE: {
    icon: CircleDot,
    label: "Single Choice",
    badgeClass:
      "border-tertiary-400 bg-tertiary-100 text-tertiary-900 dark:border-tertiary-800 dark:bg-tertiary-900/30 dark:text-tertiary-300",
  },
  MULTIPLE_CHOICE: {
    icon: ListChecks,
    label: "Multiple Choice",
    badgeClass:
      "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300",
  },
  CODING: {
    icon: Code2,
    label: "Coding",
    badgeClass:
      "border-secondary-200 bg-secondary-50 text-secondary-700 dark:border-secondary-800 dark:bg-secondary-900/30 dark:text-secondary-300",
  },
  WHITEBOARD: {
    icon: PenLine,
    label: "Whiteboard",
    badgeClass:
      "border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-300",
  },
  RESEARCH: {
    icon: Microscope,
    label: "Research",
    badgeClass:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
};

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

type SortKey = "text" | "type" | "interview" | "date";
type SortDir = "asc" | "desc";

interface QuestionRow {
  id: string;
  text: string;
  description: string | null;
  type: string;
  options: unknown;
  starterCode: unknown;
  createdAt: string | Date;
  interview?: { id: string; title: string };
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
/*  Sort helper                                                        */
/* ------------------------------------------------------------------ */

function getSortValue(q: QuestionRow, key: SortKey): string | number {
  switch (key) {
    case "text":
      return q.text.toLowerCase();
    case "type":
      return q.type;
    case "interview":
      return (q.interview?.title ?? "").toLowerCase();
    case "date":
      return new Date(q.createdAt).getTime();
  }
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function QuestionsPage() {
  const { locale } = useAppLocale();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { currentProject } = useProject();
  const projectId = currentProject?.id;
  const isZh = locale === "zh";
  const questionTypeMeta = useMemo(() => ({
    OPEN_ENDED: {
      ...QUESTION_TYPE_META.OPEN_ENDED,
      label: isZh ? "开放题" : "Open Ended",
    },
    SINGLE_CHOICE: {
      ...QUESTION_TYPE_META.SINGLE_CHOICE,
      label: isZh ? "单选题" : "Single Choice",
    },
    MULTIPLE_CHOICE: {
      ...QUESTION_TYPE_META.MULTIPLE_CHOICE,
      label: isZh ? "多选题" : "Multiple Choice",
    },
    CODING: {
      ...QUESTION_TYPE_META.CODING,
      label: isZh ? "编程题" : "Coding",
    },
    WHITEBOARD: {
      ...QUESTION_TYPE_META.WHITEBOARD,
      label: isZh ? "白板题" : "Whiteboard",
    },
    RESEARCH: {
      ...QUESTION_TYPE_META.RESEARCH,
      label: isZh ? "调研题" : "Research",
    },
  }), [isZh]);
  const typeOptions = [
    { value: "ALL", label: isZh ? "全部类型" : "All Types" },
    { value: "OPEN_ENDED", label: questionTypeMeta.OPEN_ENDED.label },
    { value: "SINGLE_CHOICE", label: questionTypeMeta.SINGLE_CHOICE.label },
    { value: "MULTIPLE_CHOICE", label: questionTypeMeta.MULTIPLE_CHOICE.label },
    { value: "CODING", label: questionTypeMeta.CODING.label },
    { value: "WHITEBOARD", label: questionTypeMeta.WHITEBOARD.label },
    { value: "RESEARCH", label: questionTypeMeta.RESEARCH.label },
  ];
  const timeRangeOptions = [
    { value: "ALL", label: isZh ? "全部时间" : "All Time" },
    { value: "30m", label: isZh ? "过去 30 分钟" : "Past 30 min" },
    { value: "1h", label: isZh ? "过去 1 小时" : "Past 1 hour" },
    { value: "6h", label: isZh ? "过去 6 小时" : "Past 6 hours" },
    { value: "1d", label: isZh ? "过去 1 天" : "Past 1 day" },
    { value: "3d", label: isZh ? "过去 3 天" : "Past 3 days" },
    { value: "7d", label: isZh ? "过去 7 天" : "Past 7 days" },
    { value: "14d", label: isZh ? "过去 14 天" : "Past 14 days" },
    { value: "30d", label: isZh ? "过去 30 天" : "Past 30 days" },
    { value: "90d", label: isZh ? "过去 90 天" : "Past 90 days" },
  ];

  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [timeRange, setTimeRange] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copyDialog, setCopyDialog] = useState<QuestionRow | null>(null);
  const [copyTarget, setCopyTarget] = useState<string>("");

  const questions = trpc.question.listAll.useQuery(
    { limit: 200, projectId: projectId ?? undefined },
    { enabled: !!projectId },
  );
  const interviews = trpc.interview.list.useQuery(
    { projectId: projectId ?? undefined },
    { enabled: !!projectId },
  );

  const deleteMutation = trpc.question.delete.useMutation({
    onSuccess: () => {
      utils.question.listAll.invalidate();
    },
  });

  const createMutation = trpc.question.create.useMutation({
    onSuccess: () => {
      toast({
        title: isZh ? "题目已复制到面试中" : "Question copied to interview",
      });
      setCopyDialog(null);
      setCopyTarget("");
    },
  });

  const [deleteProgress, setDeleteProgress] = useState(false);

  const handleBulkDelete = async () => {
    setDeleteProgress(true);
    setConfirmDelete(false);
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map((id) => deleteMutation.mutateAsync({ id })));
    setSelectedIds(new Set());
    setDeleteProgress(false);
    toast({
      title: isZh
        ? `已删除 ${ids.length} 道题目`
        : `${ids.length} question${ids.length > 1 ? "s" : ""} deleted`,
    });
    utils.question.listAll.invalidate();
  };

  const handleCopyToInterview = () => {
    if (!copyDialog || !copyTarget) return;
    createMutation.mutate({
      interviewId: copyTarget,
      text: copyDialog.text,
      description: copyDialog.description,
      type: copyDialog.type as
        | "OPEN_ENDED"
        | "SINGLE_CHOICE"
        | "MULTIPLE_CHOICE"
        | "CODING"
        | "WHITEBOARD"
        | "RESEARCH",
      options: copyDialog.options ?? undefined,
      starterCode: copyDialog.starterCode as
        | { language: string; code: string }
        | null
        | undefined,
    });
  };

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
    searchQuery.trim() || typeFilter !== "ALL" || timeRange !== "ALL";

  const processedQuestions = useMemo(() => {
    let result = (questions.data?.questions ?? []) as QuestionRow[];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.text.toLowerCase().includes(q) ||
          (item.description ?? "").toLowerCase().includes(q) ||
          (item.interview?.title ?? "").toLowerCase().includes(q),
      );
    }

    if (typeFilter !== "ALL") {
      result = result.filter((item) => item.type === typeFilter);
    }

    const cutoff = getTimeRangeCutoff(timeRange);
    if (cutoff) {
      result = result.filter(
        (item) => new Date(item.createdAt).getTime() >= cutoff.getTime(),
      );
    }

    if (sortKey) {
      result = [...result].sort((a, b) => {
        const aVal = getSortValue(a, sortKey);
        const bVal = getSortValue(b, sortKey);
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
  }, [questions.data, searchQuery, typeFilter, timeRange, sortKey, sortDir]);

  const totalPages = Math.max(
    1,
    Math.ceil(processedQuestions.length / pageSize),
  );
  const paginatedQuestions = processedQuestions.slice(
    page * pageSize,
    (page + 1) * pageSize,
  );

  const pageIds = paginatedQuestions.map((q) => q.id);
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
    const rows = processedQuestions.map((q) => ({
      [isZh ? "面试" : "Interview"]: q.interview?.title ?? "",
      [isZh ? "题目" : "Question"]: q.text,
      [isZh ? "描述" : "Description"]: q.description ?? "",
      [isZh ? "类型" : "Type"]:
        questionTypeMeta[q.type as keyof typeof questionTypeMeta]?.label ??
        q.type,
      [isZh ? "创建时间" : "Created"]: new Date(q.createdAt).toLocaleString(
        undefined,
        {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        },
      ),
    }));
    exportToXlsx(rows, `questions-${new Date().toISOString().slice(0, 10)}`);
  }, [isZh, processedQuestions, questionTypeMeta]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{isZh ? "题库" : "Questions"}</h1>
        <p className="text-muted-foreground">
          {isZh
            ? "查看所有面试中的题目"
            : "All questions across your interviews"}
        </p>
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={
              isZh
                ? "按题目内容、描述或面试搜索..."
                : "Search by question text, description, or interview..."
            }
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
            {timeRangeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[170px]">
            <HelpCircle className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={handleExport}
          disabled={processedQuestions.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          {isZh ? "导出" : "Export"}
        </Button>

        {selectedIds.size > 0 && (
          <>
            <Button
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={deleteProgress}
            >
              {deleteProgress ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {isZh
                ? `删除（${selectedIds.size}）`
                : `Delete (${selectedIds.size})`}
            </Button>
            <Button
              variant="outline"
              className="border-foreground/50 hover:bg-foreground/5"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="mr-1 h-4 w-4" />
              {isZh ? "取消" : "Cancel"}
            </Button>
          </>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        {questions.isLoading ? (
          <div className="p-6">
            <Skeleton className="h-48" />
          </div>
        ) : processedQuestions.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {isFiltering
              ? isZh
                ? "没有符合筛选条件的题目。"
                : "No questions match your search."
              : isZh
                ? "暂无题目。先创建一场面试开始使用。"
                : "No questions found. Create an interview to get started."}
          </p>
        ) : (
          <>
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
                    label={isZh ? "题目" : "Question"}
                    sortKey="text"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label={isZh ? "类型" : "Type"}
                    sortKey="type"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label={isZh ? "面试" : "Interview"}
                    sortKey="interview"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label={isZh ? "创建时间" : "Created"}
                    sortKey="date"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedQuestions.map((q) => {
                  const meta =
                    questionTypeMeta[q.type as keyof typeof questionTypeMeta] ??
                    questionTypeMeta.OPEN_ENDED;
                  const TypeIcon = meta.icon;
                  return (
                    <TableRow
                      key={q.id}
                      data-state={
                        selectedIds.has(q.id) ? "selected" : undefined
                      }
                    >
                      <TableCell
                        onClick={(e) => e.stopPropagation()}
                        className="w-10"
                      >
                        <Checkbox
                          checked={selectedIds.has(q.id)}
                          onCheckedChange={() => toggleSelect(q.id)}
                        />
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p className="truncate font-medium">{q.text}</p>
                        {q.description && (
                          <p className="truncate text-xs text-muted-foreground">
                            {q.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta.badgeClass}>
                          <TypeIcon className="mr-1 h-3 w-3" />
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {q.interview?.title ?? "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(q.createdAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "numeric",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="w-10">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={isZh ? "复制到其他面试" : "Copy to interview"}
                          onClick={() => setCopyDialog(q)}
                        >
                          <Copy className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {processedQuestions.length > PAGE_SIZE_OPTIONS[0] && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Rows per page</span>
                  <span>{isZh ? "每页行数" : "Rows per page"}</span>
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
                    {Math.min((page + 1) * pageSize, processedQuestions.length)}{" "}
                    {isZh ? " / 共 " : " of "} {processedQuestions.length}
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
          </>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isZh ? "删除题目" : "Delete Questions"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isZh
                ? `确认要删除 ${selectedIds.size} 道题目吗？此操作无法撤销。`
                : `Are you sure you want to delete ${selectedIds.size} question${selectedIds.size > 1 ? "s" : ""}? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isZh ? "取消" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBulkDelete}
            >
              {isZh ? "删除" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Copy to Interview dialog */}
      <Dialog
        open={!!copyDialog}
        onOpenChange={(open) => {
          if (!open) {
            setCopyDialog(null);
            setCopyTarget("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isZh ? "复制题目到面试" : "Copy Question to Interview"}
            </DialogTitle>
            <DialogDescription>
              {isZh
                ? "选择要复制到的目标面试。"
                : "Select the interview you want to copy this question to."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="text-sm font-medium">{copyDialog?.text}</p>
              {copyDialog?.type && (
                <Badge
                  variant="outline"
                  className={`mt-1 ${QUESTION_TYPE_META[copyDialog.type]?.badgeClass ?? ""}`}
                >
                  {questionTypeMeta[
                    copyDialog.type as keyof typeof questionTypeMeta
                  ]?.label ?? copyDialog.type}
                </Badge>
              )}
            </div>
            <Select value={copyTarget} onValueChange={setCopyTarget}>
              <SelectTrigger>
                <SelectValue
                  placeholder={isZh ? "选择面试..." : "Select an interview..."}
                />
              </SelectTrigger>
              <SelectContent>
                {(interviews.data?.interviews ?? []).map((iv) => (
                  <SelectItem key={iv.id} value={iv.id}>
                    {iv.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCopyDialog(null);
                setCopyTarget("");
              }}
            >
              {isZh ? "取消" : "Cancel"}
            </Button>
            <Button
              onClick={handleCopyToInterview}
              disabled={!copyTarget || createMutation.isLoading}
            >
              {createMutation.isLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <Copy className="mr-2 h-4 w-4" />
              {isZh ? "复制" : "Copy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
