"use client";

import { useAuth } from "@/components/auth-provider";
import { PrepContextDrawer } from "@/components/prep/prep-context-drawer";
import type { PrepContextInitial } from "@/components/prep/prep-context-types";
import { AiButton } from "@/components/ui/ai-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    plainToRichHtml,
    RichTextEditor,
    richTextToPlain,
    sanitizeRichHtml,
} from "@/components/ui/rich-text-editor";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    StreamingTextPanels,
    type StreamPanelPhase,
} from "@/components/ui/streaming-text-panels";
import { Textarea } from "@/components/ui/textarea";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
    countSpeakableUnits,
    estimateSpeakMinutes,
    inferSuggestedAnswerStructure,
    structureTagLabel,
} from "@/lib/prep/answer-rubric";
import { parseHintLayers } from "@/lib/prep/hint-layers";
import {
    segmentAnswerHighlights,
    splitSuggestedAnswerParagraphs,
    stripVerifyMarkers,
} from "@/lib/prep/sanitize-hint";
import {
    deleteSuggestedAnswerCache,
    getSuggestedAnswerCache,
    setSuggestedAnswerCache,
} from "@/lib/prep/suggested-answer-cache";
import {
    PREP_SUGGESTED_ANSWER_EMPTY_HINT,
    PREP_SUGGESTED_ANSWER_EMPTY_HINT_NO_CONTEXT,
} from "@/lib/prep/ui-copy";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
    Bookmark,
    Clock,
    Lightbulb,
    ListTree,
    Loader2,
    MessageSquarePlus,
    Mic,
    PanelRightClose,
    RefreshCw,
    SlidersHorizontal,
    Sparkles,
    Wand2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readPrepStream } from "./prep-stream";

export type { PrepContextInitial } from "@/components/prep/prep-context-types";

type Props = {
  interviewId: string;
  interviewTitle?: string;
  questionId: string | null;
  questionText?: string | null;
  questionType?: string | null;
  hasContext: boolean;
  prepContext: PrepContextInitial;
  onContextSaved?: () => void;
  /** When false, suggested answer generation is blocked (insufficient tokens). */
  canUseHint?: boolean;
  hintTokenCost?: number;
  aiTokensRemaining?: number;
  onAiTokensSpent?: () => void;
  /** Turn the suggested answer into a speaking drill in the practice composer. */
  onPracticeAnswer?: (answerText: string) => void;
  /** Desktop: collapse the suggested-answer rail. */
  onToggleRightPanel?: () => void;
};

type HintRefinement = {
  instruction: string;
};

const REFINEMENT_PRESETS = [
  {
    id: "concise",
    label: "More concise",
    instruction:
      "Make it more concise: tighten to the essentials, cut hedging, keep only the strongest proof points.",
  },
  {
    id: "senior",
    label: "More senior",
    instruction:
      "Make it sound more senior: emphasize ownership, strategic framing, measurable impact, and leadership signals.",
  },
  {
    id: "technical",
    label: "More technical",
    instruction:
      "Make it more technical: add concrete technical depth, precise terminology, and trade-off reasoning the role expects.",
  },
  {
    id: "conversational",
    label: "More conversational",
    instruction:
      "Make it more conversational: natural spoken tone, shorter sentences, contractions, less formal phrasing.",
  },
] as const;

function appendHintToken(prev: string, token: string): string {
  const combined = prev + token;
  return prev ? combined : combined.replace(/^[\s\u00a0]+/, "");
}

function HighlightedParagraph({ text }: { text: string }) {
  const segments = segmentAnswerHighlights(text);

  return (
    <p className="text-[15px] leading-[1.7] tracking-[0.01em] text-foreground/90">
      {segments.map((segment, index) =>
        segment.highlight ? (
          <mark
            key={index}
            className="rounded-sm bg-amber-100/90 px-0.5 font-medium text-foreground dark:bg-amber-500/25"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

function SuggestedAnswerMeta({
  answerText,
  questionType,
}: {
  answerText: string;
  questionType?: string | null;
}) {
  const units = countSpeakableUnits(answerText);
  const minutes = estimateSpeakMinutes(units);
  const structure = inferSuggestedAnswerStructure(questionType, answerText);
  const { label: structureLabel, hint: structureHint } =
    structureTagLabel(structure);

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <Badge variant="secondary" className="gap-1 font-normal">
        {units} words
      </Badge>
      <Badge variant="secondary" className="gap-1 font-normal">
        <Clock className="h-3 w-3" aria-hidden />
        ~{minutes} min
      </Badge>
      <Badge
        variant="outline"
        className="gap-1 font-normal"
        title={structureHint}
      >
        {structureLabel}
      </Badge>
    </div>
  );
}

function IconActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  spinning = false,
  loading = false,
  "aria-expanded": ariaExpanded,
}: {
  icon: typeof RefreshCw;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  spinning?: boolean;
  loading?: boolean;
  "aria-expanded"?: boolean;
}) {
  const DisplayIcon = loading ? Loader2 : Icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
          aria-expanded={ariaExpanded}
        >
          <DisplayIcon
            className={cn(
              "h-3.5 w-3.5",
              (spinning || loading) && "animate-spin",
            )}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function AskForChangesPopover({
  loading,
  disabled,
  onSubmit,
}: {
  loading: boolean;
  disabled?: boolean;
  onSubmit: (instruction: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const submit = () => {
    const instruction = text.trim();
    if (!instruction) return;
    setOpen(false);
    setText("");
    onSubmit(instruction);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
              disabled={disabled || loading}
              aria-label="Ask for changes"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Ask for changes
        </TooltipContent>
      </Tooltip>
      <PopoverContent side="bottom" align="end" className="w-72 p-3">
        <p className="text-xs font-semibold">Ask for changes</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Tell the coach how to rewrite this answer.
        </p>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="e.g. Lead with the metrics, drop the second example…"
          rows={3}
          maxLength={280}
          className="mt-2 resize-none text-sm"
        />
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            disabled={!text.trim()}
            onClick={submit}
          >
            <Wand2 className="h-3 w-3" aria-hidden />
            Rewrite
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AnswerOutline({ outline }: { outline: string[] }) {
  if (outline.length === 0) return null;
  return (
    <div className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
        <ListTree className="h-3.5 w-3.5 text-primary" aria-hidden />
        Outline
      </p>
      <ol className="mt-1.5 space-y-1">
        {outline.map((item, index) => (
          <li key={index} className="flex gap-2 text-sm leading-relaxed">
            <span className="shrink-0 font-semibold text-primary/70">
              {index + 1}.
            </span>
            <span className="text-foreground/85">{item}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function AnswerParagraphs({ answerText }: { answerText: string }) {
  const paragraphs = splitSuggestedAnswerParagraphs(answerText);
  if (!paragraphs.length) {
    return <p className="text-sm text-muted-foreground">—</p>;
  }
  return (
    <div className="space-y-4">
      {paragraphs.map((paragraph, index) => (
        <HighlightedParagraph key={index} text={paragraph} />
      ))}
    </div>
  );
}

export function PrepSuggestedAnswerPanel({
  interviewId,
  interviewTitle = "",
  questionId,
  questionText = null,
  questionType = null,
  hasContext,
  prepContext,
  onContextSaved,
  canUseHint = true,
  hintTokenCost = 5,
  aiTokensRemaining,
  onAiTokensSpent,
  onPracticeAnswer,
  onToggleRightPanel,
}: Props) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [hint, setHint] = useState("");
  const [editedAnswer, setEditedAnswer] = useState("");
  const [thinkingText, setThinkingText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requestedForQuestionId, setRequestedForQuestionId] = useState<
    string | null
  >(null);
  const abortRef = useRef<AbortController | null>(null);
  const [contextOpen, setContextOpen] = useState(false);

  const saveAnswer = trpc.answerBank.create.useMutation({
    onSuccess: () => {
      void utils.answerBank.list.invalidate();
      toast({ title: "Saved to your answer bank" });
    },
    onError: (err) => {
      toast({
        title: "Could not save answer",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const restoreFromCache = useCallback(
    (targetQuestionId: string) => {
      if (!userId) return false;
      const cached = getSuggestedAnswerCache(
        userId,
        interviewId,
        targetQuestionId,
      );
      if (!cached) return false;
      setHint(cached.hint);
      setRequestedForQuestionId(targetQuestionId);
      setLoadError(null);
      return true;
    },
    [interviewId, userId],
  );

  const fetchHint = useCallback(
    async (targetQuestionId: string, refinement?: HintRefinement) => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      const previousAnswer = refinement
        ? richTextToPlain(editedAnswer).trim() ||
          parseHintLayers(stripVerifyMarkers(hint)).answer ||
          hint
        : "";

      setLoading(true);
      setLoadError(null);
      setHint("");
      setEditedAnswer("");
      setThinkingText("");
      setRequestedForQuestionId(targetQuestionId);

      let rawHint = "";
      try {
        const res = await fetch("/api/prep/hint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interviewId,
            questionId: targetQuestionId,
            instruction: refinement?.instruction,
            previousAnswer: refinement ? previousAnswer : undefined,
          }),
          signal: abort.signal,
        });
        await readPrepStream<Record<string, unknown>>(
          res,
          (token) => {
            rawHint = appendHintToken(rawHint, token);
            setHint(stripVerifyMarkers(rawHint));
          },
          {
            signal: abort.signal,
            onThinking: (text) => {
              setThinkingText((prev) => prev + text);
            },
          },
        );
        const finalHint = stripVerifyMarkers(rawHint).trim();
        setHint(finalHint);
        if (userId) {
          setSuggestedAnswerCache(userId, interviewId, targetQuestionId, {
            hint: finalHint,
            questionType,
          });
        }
        if (finalHint.trim()) onAiTokensSpent?.();
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Hint failed";
        const partial = stripVerifyMarkers(rawHint).trim();
        if (partial.trim()) {
          setHint(partial);
          if (userId) {
            setSuggestedAnswerCache(userId, interviewId, targetQuestionId, {
              hint: partial,
              questionType,
            });
          }
          toast({
            title: "Suggested answer incomplete",
            description: message,
            variant: "destructive",
          });
        } else {
          setLoadError(message);
          toast({
            title: "Suggested answer failed",
            description: message,
            variant: "destructive",
          });
        }
      } finally {
        if (abortRef.current === abort) {
          setLoading(false);
          setThinkingText("");
          abortRef.current = null;
        }
      }
    },
    [
      editedAnswer,
      hint,
      interviewId,
      questionType,
      onAiTokensSpent,
      toast,
      userId,
    ],
  );

  useEffect(() => {
    abortRef.current?.abort();
    setLoading(false);
    setLoadError(null);
    setEditedAnswer("");

    if (!questionId) {
      setHint("");
      setThinkingText("");
      setRequestedForQuestionId(null);
      return;
    }

    if (restoreFromCache(questionId)) return;

    setHint("");
    setThinkingText("");
    setRequestedForQuestionId(null);
  }, [questionId, restoreFromCache, userId]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const hasRequested = Boolean(
    questionId && requestedForQuestionId === questionId,
  );
  const showLoadingStream = loading && hasRequested;
  const streamPhase: StreamPanelPhase = hint.trim() ? "writing" : "thinking";
  const showStreamPanels =
    showLoadingStream && Boolean(thinkingText.trim() || hint.trim());
  const showPreparing =
    showLoadingStream && !thinkingText.trim() && !hint.trim();
  const showFinal = !loading && hasRequested && Boolean(hint.trim());
  const showEmpty = Boolean(questionId && !hasRequested && !loading);

  const cachedType =
    userId &&
    questionId &&
    getSuggestedAnswerCache(userId, interviewId, questionId)?.questionType;

  const layers = parseHintLayers(hint);
  const generatedAnswer =
    layers.answer || (layers.outline.length ? "" : hint);

  useEffect(() => {
    if (!showFinal) return;
    setEditedAnswer(plainToRichHtml(generatedAnswer));
  }, [generatedAnswer, showFinal]);

  const answerPlain = useMemo(
    () => richTextToPlain(editedAnswer).trim(),
    [editedAnswer],
  );
  const hasAnswer = answerPlain.length > 0;

  const guardHintUsage = (): boolean => {
    if (!questionId || loading) return false;
    if (!canUseHint) {
      toast({
        title: "Suggested answer unavailable",
        description: "AI token limits are not enforced in self-hosted builds.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleShow = () => {
    if (!guardHintUsage()) return;
    if (!hasContext) {
      setContextOpen(true);
      return;
    }
    void fetchHint(questionId!);
  };

  const handleRegenerate = () => {
    if (!guardHintUsage()) return;
    if (userId) deleteSuggestedAnswerCache(userId, interviewId, questionId!);
    void fetchHint(questionId!);
  };

  const handleRefine = (instruction: string) => {
    if (!guardHintUsage()) return;
    if (userId) deleteSuggestedAnswerCache(userId, interviewId, questionId!);
    void fetchHint(questionId!, { instruction });
  };

  const handleSaveAnswer = () => {
    if (!hasAnswer) return;
    const resolvedQuestionText = questionText?.trim() || "Question";
    saveAnswer.mutate({
      questionText: resolvedQuestionText,
      answerText: sanitizeRichHtml(editedAnswer),
      interviewId,
      questionId: questionId ?? undefined,
      questionType,
      interviewTitle,
    });
  };

  const handlePractice = () => {
    if (!hasAnswer || !onPracticeAnswer) return;
    onPracticeAnswer(answerPlain);
  };

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b bg-background px-5 py-3.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400">
            <Lightbulb className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight">Suggested answer</h3>
            <p className="text-xs text-muted-foreground">Based on your JD and resume</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {questionId ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setContextOpen(true)}
                  aria-label="Practice context"
                >
                  <SlidersHorizontal className="h-4 w-4 shrink-0" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Practice context
              </TooltipContent>
            </Tooltip>
          ) : null}
          {onToggleRightPanel ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={onToggleRightPanel}
                  aria-label="Hide suggested answer panel"
                >
                  <PanelRightClose className="h-4 w-4 shrink-0" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Hide suggested answer panel
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      <PrepContextDrawer
        interviewId={interviewId}
        open={contextOpen}
        onOpenChange={setContextOpen}
        fallbackInitial={prepContext}
        onContextSaved={onContextSaved}
      />

      {!questionId ? (
        <div className="px-5 py-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Select a question to generate a suggested answer.
          </p>
        </div>
      ) : (
        <ScrollArea className="h-full min-h-0 flex-1">
          <div className="px-5 py-4 pb-8">
            <div
              className={cn(
                "rounded-xl border border-border/80 bg-card/80 shadow-sm",
                showStreamPanels || showPreparing
                  ? "px-4 pb-4 pt-2"
                  : "p-4",
              )}
            >
              {showEmpty ? (
                <div className="flex flex-col items-center justify-center gap-5 py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    {hasContext
                      ? PREP_SUGGESTED_ANSWER_EMPTY_HINT
                      : PREP_SUGGESTED_ANSWER_EMPTY_HINT_NO_CONTEXT}
                  </p>
                  {!canUseHint ? (
                    <p className="text-xs text-destructive">
                      You need {hintTokenCost} AI tokens for a suggested answer
                      {aiTokensRemaining != null
                        ? ` (${aiTokensRemaining.toLocaleString()} remaining).`
                        : "."}
                    </p>
                  ) : null}
                  <AiButton
                    type="button"
                    wrapperClassName="w-full max-w-xs"
                    className="w-full"
                    disabled={!canUseHint}
                    onClick={handleShow}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Show suggested answer
                  </AiButton>
                </div>
              ) : null}
              {showPreparing ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  <span>Preparing suggested answer…</span>
                </div>
              ) : null}
              {showStreamPanels ? (
                hint.trim() ? (
                  <div className="flex flex-col gap-3 py-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                      Writing suggested answer…
                    </div>
                    <AnswerOutline outline={layers.outline} />
                    {layers.answer.trim() ? (
                      <AnswerParagraphs answerText={layers.answer} />
                    ) : null}
                  </div>
                ) : (
                  <StreamingTextPanels
                    phase={streamPhase}
                    thinkingText={thinkingText}
                    contentText=""
                    thinkingLabel="Preparing suggested answer"
                    thinkingCompleteLabel="Outline ready"
                    contentLabel="Writing suggested answer"
                    contentCompleteLabel="Finishing up"
                    className="py-2"
                  />
                )
              ) : null}
              {showFinal ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-1">
                    <SuggestedAnswerMeta
                      answerText={answerPlain || hint}
                      questionType={questionType ?? cachedType}
                    />
                    <IconActionButton
                      icon={Bookmark}
                      label="Save answer"
                      loading={saveAnswer.isLoading}
                      disabled={!hasAnswer || saveAnswer.isLoading}
                      onClick={handleSaveAnswer}
                    />
                    <AskForChangesPopover
                      loading={loading}
                      disabled={!canUseHint}
                      onSubmit={handleRefine}
                    />
                    <IconActionButton
                      icon={RefreshCw}
                      label="Refresh"
                      disabled={loading || !canUseHint}
                      spinning={loading}
                      onClick={handleRegenerate}
                    />
                  </div>

                  <AnswerOutline outline={layers.outline} />

                  {hasAnswer || editedAnswer ? (
                    <RichTextEditor
                      value={editedAnswer}
                      onChange={setEditedAnswer}
                      placeholder="Edit the suggested answer…"
                      resizable
                    />
                  ) : null}

                  <div className="space-y-3 border-t border-border/60 pt-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Tune
                      </span>
                      {REFINEMENT_PRESETS.map((preset) => (
                        <Button
                          key={preset.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={loading || !canUseHint}
                          className="h-6 rounded-full px-2.5 text-[11px] font-normal"
                          onClick={() => handleRefine(preset.instruction)}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                    {onPracticeAnswer ? (
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 w-full gap-1.5 text-xs"
                        disabled={!hasAnswer}
                        onClick={handlePractice}
                      >
                        <Mic className="h-3.5 w-3.5" aria-hidden />
                        Practice this answer
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {hasRequested && !loading && !hint.trim() && loadError ? (
                <div className="flex flex-col justify-center space-y-3 py-2">
                  <p className="text-sm text-destructive">{loadError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerate}
                  >
                    Try again
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
    </TooltipProvider>
  );
}
