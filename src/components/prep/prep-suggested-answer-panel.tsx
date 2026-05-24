"use client";

import { PrepContextDrawer } from "@/components/prep/prep-context-drawer";
import type { PrepContextInitial } from "@/components/prep/prep-context-types";
import { AiButton } from "@/components/ui/ai-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  StreamingTextPanels,
  type StreamPanelPhase,
} from "@/components/ui/streaming-text-panels";
import { useToast } from "@/hooks/use-toast";
import {
  countSpeakableUnits,
  estimateSpeakMinutes,
  inferSuggestedAnswerStructure,
  structureTagLabel,
} from "@/lib/prep/answer-rubric";
import {
  segmentAnswerHighlights,
  splitSuggestedAnswerParagraphs,
  stripVerifyBlocks,
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
import { cn } from "@/lib/utils";
import {
  Clock,
  Lightbulb,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { readPrepStream } from "./prep-stream";

export type { PrepContextInitial } from "@/components/prep/prep-context-types";

type Props = {
  interviewId: string;
  questionId: string | null;
  questionType?: string | null;
  hasContext: boolean;
  prepContext: PrepContextInitial;
  onContextSaved?: () => void;
  /** When false, suggested answer generation is blocked (insufficient tokens). */
  canUseHint?: boolean;
  hintTokenCost?: number;
  aiTokensRemaining?: number;
  onAiTokensSpent?: () => void;
};

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
  text,
  questionType,
}: {
  text: string;
  questionType?: string | null;
}) {
  const units = countSpeakableUnits(text);
  const minutes = estimateSpeakMinutes(units);
  const structure = inferSuggestedAnswerStructure(questionType, text);
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

function AnswerCardRefresh({
  loading,
  onRefresh,
}: {
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="ml-auto h-6 shrink-0 gap-1 px-1.5 text-xs font-normal text-muted-foreground hover:text-foreground"
      disabled={loading}
      onClick={onRefresh}
      aria-label="Regenerate suggested answer"
    >
      <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
      Refresh
    </Button>
  );
}

function AnswerCardTopBar({
  text,
  questionType,
  loading,
  onRefresh,
}: {
  text: string;
  questionType?: string | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <SuggestedAnswerMeta text={text} questionType={questionType} />
      <AnswerCardRefresh loading={loading} onRefresh={onRefresh} />
    </div>
  );
}

function SuggestedAnswerBody({ text }: { text: string }) {
  const paragraphs = splitSuggestedAnswerParagraphs(text);

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
  questionId,
  questionType = null,
  hasContext,
  prepContext,
  onContextSaved,
  canUseHint = true,
  onAiTokensSpent,
}: Props) {
  const { toast } = useToast();
  const [hint, setHint] = useState("");
  const [thinkingText, setThinkingText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requestedForQuestionId, setRequestedForQuestionId] = useState<
    string | null
  >(null);
  const abortRef = useRef<AbortController | null>(null);
  const [contextOpen, setContextOpen] = useState(false);

  const restoreFromCache = useCallback(
    (targetQuestionId: string) => {
      const cached = getSuggestedAnswerCache(interviewId, targetQuestionId);
      if (!cached) return false;
      setHint(cached.hint);
      setRequestedForQuestionId(targetQuestionId);
      setLoadError(null);
      return true;
    },
    [interviewId],
  );

  const fetchHint = useCallback(
    async (targetQuestionId: string) => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      setLoading(true);
      setLoadError(null);
      setHint("");
      setThinkingText("");
      setRequestedForQuestionId(targetQuestionId);

      let rawHint = "";
      try {
        const res = await fetch("/api/prep/hint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interviewId, questionId: targetQuestionId }),
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
        const finalHint = stripVerifyBlocks(rawHint);
        setHint(finalHint);
        setSuggestedAnswerCache(interviewId, targetQuestionId, {
          hint: finalHint,
          questionType,
        });
        if (finalHint.trim()) onAiTokensSpent?.();
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Hint failed";
        const partial = stripVerifyBlocks(rawHint);
        if (partial.trim()) {
          setHint(partial);
          setSuggestedAnswerCache(interviewId, targetQuestionId, {
            hint: partial,
            questionType,
          });
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
    [interviewId, questionType, onAiTokensSpent, toast],
  );

  useEffect(() => {
    abortRef.current?.abort();
    setLoading(false);
    setLoadError(null);

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
  }, [questionId, restoreFromCache]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleShow = () => {
    if (!questionId || loading) return;
    if (!canUseHint) {
      toast({
        title: "Suggested answer unavailable",
        description: "The suggested answer helper is not available right now.",
        variant: "destructive",
      });
      return;
    }
    if (!hasContext) {
      setContextOpen(true);
      return;
    }
    void fetchHint(questionId);
  };

  const handleRegenerate = () => {
    if (!questionId || loading || !canUseHint) return;
    deleteSuggestedAnswerCache(interviewId, questionId);
    void fetchHint(questionId);
  };

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
    questionId && getSuggestedAnswerCache(interviewId, questionId)?.questionType;

  return (
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
        {questionId ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setContextOpen(true)}
            aria-label="Practice context"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
            Practice context
          </Button>
        ) : null}
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
          <div className="flex min-h-full flex-col px-5 py-4">
            <div
              className={cn(
                "flex min-h-full flex-1 flex-col rounded-xl border border-border/80 bg-card/80 shadow-sm",
                showStreamPanels || showPreparing
                  ? "px-4 pb-4 pt-2"
                  : "p-4",
              )}
            >
              {showEmpty ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    {hasContext
                      ? PREP_SUGGESTED_ANSWER_EMPTY_HINT
                      : PREP_SUGGESTED_ANSWER_EMPTY_HINT_NO_CONTEXT}
                  </p>
                  {!canUseHint ? (
                    <p className="text-xs text-destructive">
                      Suggested answers are unavailable right now.
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
                <div className="flex flex-1 items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  <span>Preparing suggested answer…</span>
                </div>
              ) : null}
              {showStreamPanels ? (
                <StreamingTextPanels
                  phase={streamPhase}
                  thinkingText={thinkingText}
                  contentText={hint.trim() ? hint : ""}
                  thinkingLabel="Preparing suggested answer"
                  thinkingCompleteLabel="Outline ready"
                  contentLabel="Writing suggested answer"
                  contentCompleteLabel="Finishing up"
                  className="flex-1 py-2"
                />
              ) : null}
              {showFinal ? (
                <div className="flex min-h-0 flex-1 flex-col gap-4">
                  <AnswerCardTopBar
                    text={hint}
                    questionType={questionType ?? cachedType}
                    loading={loading}
                    onRefresh={handleRegenerate}
                  />
                  <SuggestedAnswerBody text={hint} />
                </div>
              ) : null}
              {hasRequested && !loading && !hint.trim() && loadError ? (
                <div className="flex flex-1 flex-col justify-center space-y-3 py-2">
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
  );
}
