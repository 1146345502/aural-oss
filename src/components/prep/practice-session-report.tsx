"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
    Bookmark,
    BookmarkCheck,
    BookOpenText,
    BrainCircuit,
    CheckCircle2,
    ChevronDown,
    Clock,
    Mic,
    RotateCcw,
    Sparkles,
    Target,
    TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
    normalizePrepQuestionOptions,
    normalizeAttempt,
    scoreTone,
    type PrepAttempt,
    type PrepQuestion,
    type PrepQuestionOption,
} from "./prep-types";
import { VoiceDeliveryTimeline } from "./voice-delivery-timeline";

const RETRY_BAR = 6;

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatDateTime(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <p className={cn("mt-1.5 text-2xl font-bold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

function ScoreChip({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-baseline gap-0.5 rounded-md border px-2 py-0.5 text-sm font-bold tabular-nums",
        scoreTone(score),
      )}
    >
      {score.toFixed(1)}
      <span className="text-[10px] font-medium text-muted-foreground">/10</span>
    </span>
  );
}

function BookmarkButton({
  bookmarked,
  pending,
  onToggle,
}: {
  bookmarked: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-7 w-7",
            bookmarked
              ? "text-amber-500 hover:text-amber-600"
              : "text-muted-foreground hover:text-foreground",
          )}
          disabled={pending}
          onClick={onToggle}
          aria-label={
            bookmarked ? "Remove from answer bank" : "Save to answer bank"
          }
        >
          {bookmarked ? (
            <BookmarkCheck className="h-4 w-4" />
          ) : (
            <Bookmark className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {bookmarked ? "Remove from answer bank" : "Save to answer bank"}
      </TooltipContent>
    </Tooltip>
  );
}

function QuestionOptionsBlock({
  type,
  options,
}: {
  type?: string | null;
  options: PrepQuestionOption[];
}) {
  if (options.length === 0) return null;

  const isMultiple = type === "MULTIPLE_CHOICE";

  return (
    <div className="mt-3 rounded-lg border bg-muted/20 p-3">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {isMultiple ? "Choose one or more" : "Choose one"}
      </div>
      <ol className="grid gap-2 md:grid-cols-2">
        {options.map((option, index) => (
          <li
            key={`${option.value ?? option.label}-${index}`}
            className="flex min-w-0 items-start gap-2 rounded-md border bg-background px-2.5 py-2 text-sm"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-muted text-[11px] font-semibold text-muted-foreground">
              {String.fromCharCode(65 + index)}
            </span>
            <span className="min-w-0 leading-snug text-foreground/85">
              {option.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function AttemptRow({
  attempt,
  bookmarked,
  bookmarkPending,
  onToggleBookmark,
}: {
  attempt: PrepAttempt;
  bookmarked: boolean;
  bookmarkPending: boolean;
  onToggleBookmark: (attemptId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const feedback = attempt.feedback;
  const contentId = `practice-attempt-${attempt.id}`;
  const toggleExpanded = () => setExpanded((value) => !value);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-background/60 transition-colors",
        "hover:border-primary/30 hover:bg-muted/20",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={toggleExpanded}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggleExpanded();
        }}
        className={cn(
          "flex cursor-pointer flex-col gap-2 px-3 py-2 outline-none transition-colors sm:flex-row sm:items-center",
          "hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="font-normal">
            Attempt {attempt.attemptNumber}
          </Badge>
          <ScoreChip score={attempt.score} />
        </div>
        <span className="min-w-0 flex-1 text-sm font-medium leading-snug sm:truncate">
          {feedback.verdict || "Graded answer"}
        </span>
        <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            {formatDateTime(attempt.createdAt)}
          </span>
          <span
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <BookmarkButton
              bookmarked={bookmarked}
              pending={bookmarkPending}
              onToggle={() => onToggleBookmark(attempt.id)}
            />
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={(event) => {
              event.stopPropagation();
              toggleExpanded();
            }}
            onKeyDown={(event) => event.stopPropagation()}
            aria-label={expanded ? "Collapse attempt" : "Expand attempt"}
            aria-expanded={expanded}
            aria-controls={contentId}
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
            />
          </Button>
        </div>
      </div>

      {expanded ? (
        <div id={contentId} className="space-y-3 border-t px-3 py-3">
          {feedback.summary ? (
            <p className="rounded-md border border-primary/15 bg-primary/5 px-3 py-2 text-sm leading-relaxed text-foreground/90">
              {feedback.summary}
            </p>
          ) : null}

          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              {attempt.inputMode === "VOICE" ? (
                <Mic className="h-3 w-3" aria-hidden />
              ) : null}
              Your answer
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
              {attempt.answerText}
            </p>
            {attempt.audioUrl ? (
              <audio
                controls
                src={attempt.audioUrl}
                className="mt-2 h-8 w-full max-w-md"
                preload="metadata"
              />
            ) : null}
          </div>

          {(feedback.strengths.length > 0 || feedback.improvements.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {feedback.strengths.length > 0 ? (
                <div className="rounded-md border border-emerald-200/70 bg-emerald-50/50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    What worked
                  </p>
                  <ul className="mt-2 space-y-1">
                    {feedback.strengths.map((item) => (
                      <li key={item} className="text-xs leading-relaxed text-muted-foreground">
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {feedback.improvements.length > 0 ? (
                <div className="rounded-md border border-orange-200/70 bg-orange-50/40 p-3 dark:border-orange-900/40 dark:bg-orange-950/20">
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    <TrendingUp className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                    Improve next
                  </p>
                  <ul className="mt-2 space-y-1">
                    {feedback.improvements.map((item) => (
                      <li key={item} className="text-xs leading-relaxed text-muted-foreground">
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}

          {feedback.voiceDelivery?.timeline?.length ? (
            <VoiceDeliveryTimeline
              delivery={feedback.voiceDelivery}
              durationSeconds={attempt.audioDurationSeconds ?? attempt.durationSeconds}
              compact
              className="rounded-md border border-violet-200/60 bg-violet-50/40 p-3 dark:border-violet-900/40 dark:bg-violet-950/20"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Reviewable report for one practice session: overall stats, per-question
 * attempts with feedback + recordings, bookmarks, and the suggested next run.
 */
export function PracticeSessionReport({
  sessionId,
  className,
  onPracticeAgain,
}: {
  sessionId: string;
  className?: string;
  /** When provided, "Practice again" resets in place instead of navigating. */
  onPracticeAgain?: () => void;
}) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const reportQuery = trpc.prep.getSessionReport.useQuery({ sessionId });
  const bookmarksQuery = trpc.answerBank.listAttemptIds.useQuery({});
  const toggleBookmark = trpc.answerBank.toggle.useMutation({
    onSuccess: (result) => {
      utils.answerBank.listAttemptIds.invalidate();
      utils.answerBank.list.invalidate();
      toast({
        title: result.bookmarked
          ? "Saved to your answer bank"
          : "Removed from your answer bank",
      });
    },
    onError: (err) => {
      toast({
        title: "Could not update answer bank",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const bookmarkedIds = useMemo(
    () => new Set(bookmarksQuery.data ?? []),
    [bookmarksQuery.data],
  );

  const report = reportQuery.data;
  const attempts = useMemo<PrepAttempt[]>(
    () => (report?.attempts ?? []).map(normalizeAttempt),
    [report?.attempts],
  );
  const questions = useMemo(
    () => (report?.questions ?? []) as PrepQuestion[],
    [report?.questions],
  );

  const byQuestion = useMemo(() => {
    const map = new Map<string, PrepAttempt[]>();
    for (const attempt of attempts) {
      const rows = map.get(attempt.questionId) ?? [];
      rows.push(attempt);
      map.set(attempt.questionId, rows);
    }
    return map;
  }, [attempts]);

  const stats = useMemo(() => {
    const scores = attempts
      .map((attempt) => attempt.score)
      .filter((score): score is number => typeof score === "number");
    const answeredQuestionIds = new Set(attempts.map((a) => a.questionId));
    return {
      answered: answeredQuestionIds.size,
      attempts: attempts.length,
      averageScore:
        scores.length > 0
          ? scores.reduce((sum, score) => sum + score, 0) / scores.length
          : null,
      bestScore: scores.length > 0 ? Math.max(...scores) : null,
    };
  }, [attempts]);

  const nextRun = useMemo(() => {
    const weak: Array<{ question: PrepQuestion; bestScore: number | null }> = [];
    for (const question of questions) {
      const rows = byQuestion.get(question.id) ?? [];
      const scores = rows
        .map((row) => row.score)
        .filter((score): score is number => typeof score === "number");
      const best = scores.length > 0 ? Math.max(...scores) : null;
      if (rows.length === 0 || best == null || best < RETRY_BAR + 1) {
        weak.push({ question, bestScore: best });
      }
    }
    return weak.slice(0, 5);
  }, [byQuestion, questions]);

  if (reportQuery.isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (reportQuery.isError || !report) {
    return (
      <Card className={className}>
        <CardContent className="flex h-[200px] flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">
            {reportQuery.error?.message ?? "Could not load this practice report."}
          </p>
          <Button asChild variant="outline">
            <Link href="/practices">All practices</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const session = report.session;
  const interviewId = report.interview.id;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("space-y-5", className)} data-testid="practice-session-report">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline" className="gap-1">
            <BrainCircuit className="h-3 w-3" />
            {session.mode}
          </Badge>
          <span>{formatDateTime(session.startedAt)}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {formatDuration(session.totalDurationSeconds)}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={Target}
            label="Questions answered"
            value={`${stats.answered}/${questions.length || "—"}`}
          />
          <StatTile icon={BrainCircuit} label="Attempts" value={`${stats.attempts}`} />
          <StatTile
            icon={Sparkles}
            label="Avg score"
            value={stats.averageScore != null ? stats.averageScore.toFixed(1) : "—"}
            tone={stats.averageScore != null ? scoreTone(stats.averageScore) : undefined}
          />
          <StatTile
            icon={TrendingUp}
            label="Best score"
            value={stats.bestScore != null ? stats.bestScore.toFixed(1) : "—"}
            tone={stats.bestScore != null ? scoreTone(stats.bestScore) : undefined}
          />
        </div>

        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                Suggested next run
              </p>
              {nextRun.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {nextRun.map(({ question, bestScore }) => (
                    <li
                      key={question.id}
                      className="flex items-baseline gap-2 text-sm text-muted-foreground"
                    >
                      <RotateCcw className="h-3 w-3 shrink-0 translate-y-0.5 text-orange-500" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">
                        Q{questions.indexOf(question) + 1}: {question.text}
                      </span>
                      <span className="shrink-0 text-xs">
                        {bestScore != null ? `best ${bestScore.toFixed(1)}` : "unanswered"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Every question scored 7+ — run the full set again to lock it in.
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              {onPracticeAgain ? (
                <Button size="sm" onClick={onPracticeAgain}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Practice again
                </Button>
              ) : (
                <Button asChild size="sm">
                  <Link href={`/practice/${interviewId}`}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Practice again
                  </Link>
                </Button>
              )}
              <Button asChild size="sm" variant="outline">
                <Link href={`/interviews/${interviewId}/edit/prep`}>
                  <BookOpenText className="mr-1.5 h-3.5 w-3.5" />
                  Back to prep
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {attempts.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No answers were graded in this session.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {questions.map((question, index) => {
              const rows = byQuestion.get(question.id) ?? [];
              if (rows.length === 0) return null;
              const questionOptions = normalizePrepQuestionOptions(question.options);
              const scores = rows
                .map((row) => row.score)
                .filter((score): score is number => typeof score === "number");
              const best = scores.length > 0 ? Math.max(...scores) : null;
              return (
                <section key={question.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <Badge variant="secondary" className="shrink-0">
                      Q{index + 1}
                    </Badge>
                    <Badge variant="outline" className="shrink-0 font-normal">
                      {question.type || "OPEN_ENDED"}
                    </Badge>
                    <p className="min-w-0 flex-1 text-sm font-medium leading-relaxed">
                      {question.text}
                    </p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {best != null && best < RETRY_BAR ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-orange-300 font-normal text-orange-600 dark:border-orange-900 dark:text-orange-400"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Needs retry
                        </Badge>
                      ) : null}
                      <ScoreChip score={best} />
                    </div>
                  </div>
                  <QuestionOptionsBlock
                    type={question.type}
                    options={questionOptions}
                  />
                  <div className="mt-3 space-y-2">
                    {rows.map((attempt) => (
                      <AttemptRow
                        key={attempt.id}
                        attempt={attempt}
                        bookmarked={bookmarkedIds.has(attempt.id)}
                        bookmarkPending={toggleBookmark.isLoading}
                        onToggleBookmark={(attemptId) =>
                          toggleBookmark.mutate({ attemptId })
                        }
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
