"use client";

import { scoreBadgeClasses } from "@/components/prep/prep-types";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    plainToRichHtml,
    RichTextContent,
    RichTextEditor,
    richTextToPlain,
    sanitizeRichHtml,
} from "@/components/ui/rich-text-editor";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { exportToXlsx } from "@/lib/export-xlsx";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
    Briefcase,
    Calendar,
    ChevronDown,
    CirclePlay,
    Download,
    Loader2,
    Mic,
    NotebookPen,
    Pencil,
    Plus,
    Search,
    Sparkles,
    Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

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

type AnswerBankEntry = {
  id: string;
  interviewId: string | null;
  questionId: string | null;
  attemptId: string | null;
  interviewTitle: string;
  questionText: string;
  questionType: string | null;
  answerText: string;
  score: number | null;
  note: string | null;
  createdAt: string;
  audioUrl: string | null;
};

function ExpandAllIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 -960 960 960"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M480-80 240-320l57-57 183 183 183-183 57 57L480-80ZM298-584l-58-56 240-240 240 240-58 56-182-182-182 182Z" />
    </svg>
  );
}

function CollapseAllIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 -960 960 960"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="m296-80-56-56 240-240 240 240-56 56-184-184L296-80Zm184-504L240-824l56-56 184 184 184-184 56 56-240 240Z" />
    </svg>
  );
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 shadow-sm",
        scoreBadgeClasses(score),
      )}
    >
      <span className="text-sm font-bold leading-none tabular-nums">
        {score.toFixed(1)}
      </span>
      <span className="text-[10px] font-medium leading-none opacity-70">
        /10
      </span>
    </span>
  );
}

function NoteEditor({
  entry,
  onSave,
  saving,
}: {
  entry: AnswerBankEntry;
  onSave: (note: string) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(entry.note ?? "");

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(entry.note ?? "");
          setEditing(true);
        }}
        className="flex w-full items-start gap-2 rounded-md border border-dashed border-border/80 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        <NotebookPen className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 whitespace-pre-wrap leading-relaxed">
          {entry.note?.trim() || "Add a personal note (why this answer works, when to use it)…"}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Why does this answer work? When should you use it?"
        className="resize-none text-sm"
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={() => setEditing(false)}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 px-2.5 text-xs"
          disabled={saving}
          onClick={() => {
            onSave(value);
            setEditing(false);
          }}
        >
          Save note
        </Button>
      </div>
    </div>
  );
}

function IconAction({
  icon: Icon,
  label,
  onClick,
  href,
  destructive = false,
  "aria-expanded": ariaExpanded,
  iconClassName,
}: {
  icon: typeof Pencil;
  label: string;
  onClick?: () => void;
  href?: string;
  destructive?: boolean;
  "aria-expanded"?: boolean;
  iconClassName?: string;
}) {
  const button = (
    <Button
      asChild={Boolean(href)}
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "h-7 w-7 text-muted-foreground",
        destructive ? "hover:text-destructive" : "hover:text-foreground",
      )}
      onClick={href ? undefined : onClick}
      aria-label={href ? undefined : label}
      aria-expanded={ariaExpanded}
    >
      {href ? (
        <Link href={href} target="_blank">
          <Icon className={cn("h-3.5 w-3.5", iconClassName)} />
          <span className="sr-only">{label}</span>
        </Link>
      ) : (
        <Icon className={cn("h-3.5 w-3.5", iconClassName)} />
      )}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function AnswerBankCard({
  entry,
  expanded,
  onExpandedChange,
  onRemove,
  onSaveNote,
  noteSaving,
  onSaveAnswer,
  answerSaving,
}: {
  entry: AnswerBankEntry;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onRemove: () => void;
  onSaveNote: (note: string) => void;
  noteSaving: boolean;
  onSaveAnswer: (answerHtml: string) => void;
  answerSaving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draftHtml, setDraftHtml] = useState("");

  const previewText = useMemo(
    () => richTextToPlain(entry.answerText),
    [entry.answerText],
  );
  const canPractice = Boolean(entry.interviewId && entry.questionId);

  const toggleExpanded = () => {
    if (editing) return;
    onExpandedChange(!expanded);
  };

  const startEditing = () => {
    setDraftHtml(plainToRichHtml(entry.answerText));
    setEditing(true);
    onExpandedChange(true);
  };

  const saveAnswer = () => {
    const sanitized = sanitizeRichHtml(draftHtml);
    if (!richTextToPlain(sanitized).trim()) return;
    onSaveAnswer(sanitized);
    setEditing(false);
  };

  return (
    <Card
      className={cn(
        "group/card transition-colors",
        !editing &&
          "hover:border-primary/15 hover:bg-muted/10",
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div
          className={cn(
            "flex flex-wrap items-start gap-2 rounded-md -m-1 p-1",
            !editing && "cursor-pointer",
          )}
          onClick={toggleExpanded}
        >
          <div className="min-w-0 flex-1 select-text">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="text-sm font-semibold leading-relaxed">
                {entry.questionText}
              </p>
              {entry.score != null ? (
                <ScoreBadge score={entry.score} />
              ) : null}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {entry.questionType ? (
                <Badge variant="outline" className="font-normal">
                  {entry.questionType}
                </Badge>
              ) : null}
              {entry.interviewTitle ? (
                entry.interviewId ? (
                  <Link
                    href={`/interviews/${entry.interviewId}/edit/prep`}
                    className="hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {entry.interviewTitle}
                  </Link>
                ) : (
                  <span>{entry.interviewTitle}</span>
                )
              ) : null}
              <span aria-hidden>·</span>
              <span>Saved {formatDate(entry.createdAt)}</span>
            </div>
          </div>
          <div
            className="flex shrink-0 items-center gap-1.5"
            onClick={(event) => event.stopPropagation()}
          >
            {canPractice ? (
              <IconAction
                icon={CirclePlay}
                label="Practice this question"
                href={`/practice/${entry.interviewId}?question=${entry.questionId}`}
              />
            ) : null}
            <IconAction
              icon={Pencil}
              label="Edit answer"
              onClick={startEditing}
            />
            <IconAction
              icon={Trash2}
              label="Remove from answer bank"
              onClick={onRemove}
              destructive
            />
            <IconAction
              icon={ChevronDown}
              label={expanded ? "Collapse" : "Expand"}
              onClick={toggleExpanded}
              aria-expanded={expanded}
              iconClassName={cn(
                "h-4 w-4 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </div>
        </div>

        {!expanded ? (
          <p
            className={cn(
              "text-sm leading-relaxed text-muted-foreground line-clamp-2",
              !editing && "cursor-pointer",
            )}
            onClick={toggleExpanded}
          >
            {previewText}
          </p>
        ) : (
          <>
            {editing ? (
              <div
                className="space-y-2"
                onClick={(event) => event.stopPropagation()}
              >
                <RichTextEditor
                  value={draftHtml}
                  onChange={setDraftHtml}
                  placeholder="Write your answer…"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setEditing(false)}
                    disabled={answerSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    disabled={answerSaving || !richTextToPlain(draftHtml).trim()}
                    onClick={saveAnswer}
                  >
                    {answerSaving ? (
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    ) : null}
                    Save answer
                  </Button>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                className="cursor-pointer rounded-md border bg-muted/20 px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/30"
                onClick={startEditing}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    startEditing();
                  }
                }}
              >
                <RichTextContent
                  value={entry.answerText}
                  className="text-sm leading-relaxed text-foreground/90"
                />
                {entry.audioUrl ? (
                  <div
                    className="mt-2 flex items-center gap-2"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Mic
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <audio
                      controls
                      src={entry.audioUrl}
                      className="h-8 w-full max-w-md"
                      preload="metadata"
                    />
                  </div>
                ) : null}
              </div>
            )}

            <NoteEditor entry={entry} onSave={onSaveNote} saving={noteSaving} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AddAnswerDialog({
  open,
  onOpenChange,
  onCreate,
  creating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { questionText: string; answerText: string }) => void;
  creating: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [answerHtml, setAnswerHtml] = useState("");

  const canSave =
    question.trim().length > 0 && richTextToPlain(answerHtml).trim().length > 0;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuestion("");
      setAnswerHtml("");
    }
    onOpenChange(next);
  };

  const submit = () => {
    if (!canSave) return;
    onCreate({
      questionText: question.trim(),
      answerText: sanitizeRichHtml(answerHtml),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add answer</DialogTitle>
          <DialogDescription>
            Save a question and the answer you want to reuse in interviews.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="answer-bank-question">Question</Label>
            <Textarea
              id="answer-bank-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="e.g. Tell me about a time you led a project under pressure."
              className="resize-none text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Answer</Label>
            <RichTextEditor
              value={answerHtml}
              onChange={setAnswerHtml}
              placeholder="Write the answer you want to keep…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canSave || creating} onClick={submit}>
            {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Save answer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AnswerBankPage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [timeRange, setTimeRange] = useState("ALL");
  const [interviewFilter, setInterviewFilter] = useState("ALL");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AnswerBankEntry | null>(
    null,
  );

  const listQuery = trpc.answerBank.list.useQuery({});
  const allRows = useMemo(
    () => (listQuery.data ?? []) as AnswerBankEntry[],
    [listQuery.data],
  );

  const interviewOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of allRows) {
      if (row.interviewId && row.interviewTitle) {
        map.set(row.interviewId, row.interviewTitle);
      }
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1]),
    );
  }, [allRows]);

  const hasManualEntries = useMemo(
    () => allRows.some((row) => !row.interviewId),
    [allRows],
  );
  const removeMutation = trpc.answerBank.remove.useMutation({
    onSuccess: () => {
      utils.answerBank.list.invalidate();
      utils.answerBank.listAttemptIds.invalidate();
      toast({ title: "Removed from your answer bank" });
    },
    onError: (err) => {
      toast({
        title: "Could not remove answer",
        description: err.message,
        variant: "destructive",
      });
    },
  });
  const noteMutation = trpc.answerBank.updateNote.useMutation({
    onSuccess: () => {
      utils.answerBank.list.invalidate();
      toast({ title: "Note saved" });
    },
    onError: (err) => {
      toast({
        title: "Could not save note",
        description: err.message,
        variant: "destructive",
      });
    },
  });
  const answerMutation = trpc.answerBank.updateAnswer.useMutation({
    onSuccess: () => {
      utils.answerBank.list.invalidate();
      toast({ title: "Answer updated" });
    },
    onError: (err) => {
      toast({
        title: "Could not update answer",
        description: err.message,
        variant: "destructive",
      });
    },
  });
  const createMutation = trpc.answerBank.create.useMutation({
    onSuccess: () => {
      utils.answerBank.list.invalidate();
      setAddOpen(false);
      toast({ title: "Added to your answer bank" });
    },
    onError: (err) => {
      toast({
        title: "Could not add answer",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const entries = useMemo(() => {
    let result = allRows;
    const query = search.trim().toLowerCase();

    if (query) {
      result = result.filter(
        (row) =>
          row.questionText.toLowerCase().includes(query) ||
          richTextToPlain(row.answerText).toLowerCase().includes(query) ||
          row.interviewTitle.toLowerCase().includes(query) ||
          (row.note ?? "").toLowerCase().includes(query),
      );
    }

    if (interviewFilter === "MANUAL") {
      result = result.filter((row) => !row.interviewId);
    } else if (interviewFilter !== "ALL") {
      result = result.filter((row) => row.interviewId === interviewFilter);
    }

    const cutoff = getTimeRangeCutoff(timeRange);
    if (cutoff) {
      result = result.filter((row) => new Date(row.createdAt) >= cutoff);
    }

    return result;
  }, [allRows, interviewFilter, search, timeRange]);

  const isFiltering =
    search.trim().length > 0 ||
    interviewFilter !== "ALL" ||
    timeRange !== "ALL";

  const allExpanded =
    entries.length > 0 && entries.every((entry) => expandedIds.has(entry.id));

  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedIds(new Set());
      return;
    }
    setExpandedIds(new Set(entries.map((entry) => entry.id)));
  };

  const setEntryExpanded = useCallback((id: string, expanded: boolean) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (expanded) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleExport = useCallback(() => {
    const rows = entries.map((entry) => ({
      Question: entry.questionText,
      Answer: richTextToPlain(entry.answerText),
      Interview: entry.interviewTitle || "Manual entry",
      Type: entry.questionType ?? "",
      Score: entry.score != null ? Number(entry.score.toFixed(1)) : "",
      Note: entry.note ?? "",
      Saved: formatDate(entry.createdAt),
    }));
    exportToXlsx(rows, `answer-bank-${new Date().toISOString().slice(0, 10)}`);
  }, [entries]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6" data-testid="answer-bank-page">
        <div>
          <h1 className="text-3xl font-bold">Answer bank</h1>
          <p className="text-muted-foreground">
            Your strongest practice answers, saved for quick review before
            interviews.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search questions, answers, notes…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-full sm:w-[160px]">
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

          <Select value={interviewFilter} onValueChange={setInterviewFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <Briefcase className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Interviews</SelectItem>
              {hasManualEntries ? (
                <SelectItem value="MANUAL">Manual entries</SelectItem>
              ) : null}
              {interviewOptions.map(([id, title]) => (
                <SelectItem key={id} value={id}>
                  {title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            onClick={handleExport}
            disabled={entries.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={toggleExpandAll}
                disabled={entries.length === 0}
                aria-label={allExpanded ? "Collapse all" : "Expand all"}
              >
                {allExpanded ? (
                  <CollapseAllIcon className="h-4 w-4" />
                ) : (
                  <ExpandAllIcon className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {allExpanded ? "Collapse all" : "Expand all"}
            </TooltipContent>
          </Tooltip>
          <Button type="button" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add answer
          </Button>
        </div>

        {listQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <Sparkles className="h-10 w-10 text-muted-foreground/60" aria-hidden />
              <div>
                <p className="font-medium">
                  {isFiltering
                    ? "No saved answers match your filters."
                    : "No saved answers yet."}
                </p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {isFiltering
                    ? "Try adjusting your search or filters."
                    : "During practice, tap the bookmark icon on coach feedback (or in a practice report) to save your strongest answers here."}
                </p>
              </div>
              {!isFiltering ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button asChild>
                    <Link href="/practices">Go to practices</Link>
                  </Button>
                  <Button variant="outline" onClick={() => setAddOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add answer manually
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <AnswerBankCard
                key={entry.id}
                entry={entry}
                expanded={expandedIds.has(entry.id)}
                onExpandedChange={(expanded) =>
                  setEntryExpanded(entry.id, expanded)
                }
                onRemove={() => setPendingDelete(entry)}
                onSaveNote={(note) =>
                  noteMutation.mutate({ id: entry.id, note })
                }
                noteSaving={noteMutation.isLoading}
                onSaveAnswer={(answerText) =>
                  answerMutation.mutate({ id: entry.id, answerText })
                }
                answerSaving={answerMutation.isLoading}
              />
            ))}
          </div>
        )}

        <AddAnswerDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onCreate={(input) => createMutation.mutate(input)}
          creating={createMutation.isLoading}
        />

        <AlertDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove saved answer?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the answer from your answer bank. The original
                practice attempt is not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (pendingDelete) {
                    removeMutation.mutate({ id: pendingDelete.id });
                  }
                  setPendingDelete(null);
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
