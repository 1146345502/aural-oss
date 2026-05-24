"use client";

import { Button } from "@/components/ui/button";
import { ChatComposer } from "@/components/ui/chat-composer";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";
import { readPrepStream } from "./prep-stream";
import type { PrepFollowUpTurn } from "./prep-types";

type FollowUpFinal = {
  shouldContinue?: boolean;
  nextPrompt?: string;
  refinement?: {
    verdict?: string;
    stillStrong?: string[];
    stillMissing?: string[];
  };
  completedTurns?: number;
  maxTurns?: number;
};

type Props = {
  attemptId: string | null;
  initialFollowUpQuestion: string;
  existingTurns: PrepFollowUpTurn[];
  maxTurns: number;
  onTurnSaved?: () => void;
};

export function PrepFollowUp({
  attemptId,
  initialFollowUpQuestion,
  existingTurns,
  maxTurns,
  onTurnSaved,
}: Props) {
  const { toast } = useToast();
  const [activePrompt, setActivePrompt] = useState("");
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Local snapshot of turns (kept in sync with `existingTurns`, but updated
  // optimistically after a successful submit so the UI stays consistent
  // before the parent's bundle refetch propagates back down).
  const [localTurns, setLocalTurns] = useState<PrepFollowUpTurn[]>(existingTurns);

  useEffect(() => {
    setLocalTurns((prev) =>
      existingTurns.length >= prev.length ? existingTurns : prev,
    );
  }, [existingTurns]);

  useEffect(() => {
    if (localTurns.length === 0) {
      setActivePrompt(initialFollowUpQuestion);
    } else {
      const lastTurn = localTurns[localTurns.length - 1];
      setActivePrompt(lastTurn.shouldContinue ? lastTurn.nextPrompt : "");
    }
  }, [localTurns, initialFollowUpQuestion]);

  if (!attemptId || maxTurns === 0) return null;

  const completedTurns = localTurns.length;
  const exhausted = completedTurns >= maxTurns;

  const submit = async () => {
    if (!attemptId || !activePrompt || draft.trim().length < 4 || submitting) return;
    setSubmitting(true);
    setStreaming("");
    try {
      const res = await fetch("/api/prep/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId,
          promptText: activePrompt,
          answerText: draft.trim(),
        }),
      });
      const final = await readPrepStream<FollowUpFinal>(res, (token) => {
        setStreaming((prev) => prev + token);
      });
      if (!final) {
        throw new Error("Follow-up stream ended without a final payload");
      }
      const refinement = {
        verdict: final.refinement?.verdict?.trim() || "Refinement",
        stillStrong: Array.isArray(final.refinement?.stillStrong)
          ? final.refinement!.stillStrong!.filter(
              (v): v is string => typeof v === "string",
            )
          : [],
        stillMissing: Array.isArray(final.refinement?.stillMissing)
          ? final.refinement!.stillMissing!.filter(
              (v): v is string => typeof v === "string",
            )
          : [],
      };
      const newTurn: PrepFollowUpTurn = {
        prompt: activePrompt,
        answer: draft.trim(),
        refinement,
        shouldContinue: !!final.shouldContinue,
        nextPrompt: final.nextPrompt ?? "",
      };
      setLocalTurns((prev) => [...prev, newTurn]);
      setStreaming("");
      setDraft("");
      onTurnSaved?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Follow-up failed";
      toast({
        title: "Follow-up failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-md border bg-background">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquareText className="h-4 w-4 text-primary" />
          Coaching follow-up
        </div>
        <span className="text-xs text-muted-foreground">
          {completedTurns}/{maxTurns} turn{maxTurns === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-4 px-4 py-4">
        {localTurns.map((turn, idx) => (
          <div key={idx} className="space-y-3 rounded-md bg-muted/40 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Turn {idx + 1}
            </div>
            <div className="text-sm font-medium">{turn.prompt}</div>
            <div className="rounded-md bg-background p-2 text-sm">
              {turn.answer}
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {turn.refinement.verdict}
              </div>
              {turn.refinement.stillStrong.length > 0 ? (
                <ul className="ml-6 list-disc text-muted-foreground">
                  {turn.refinement.stillStrong.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              ) : null}
              {turn.refinement.stillMissing.length > 0 ? (
                <div>
                  <div className="mt-2 text-xs font-medium text-muted-foreground">
                    Still missing
                  </div>
                  <ul className="ml-6 list-disc text-muted-foreground">
                    {turn.refinement.stillMissing.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {exhausted ? (
          <p className="text-sm text-muted-foreground">
            Follow-up coaching complete for this question.
          </p>
        ) : activePrompt ? (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 text-sm font-medium">
              {activePrompt}
            </div>
            <ChatComposer
              value={draft}
              onChange={setDraft}
              onSubmit={submit}
              onStop={() => setSubmitting(false)}
              isGenerating={submitting}
              submitDisabled={draft.trim().length < 4}
              minLength={4}
              placeholder="Your answer to the follow-up..."
            />
            {streaming ? (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                {streaming}
              </pre>
            ) : null}
            <div className="flex items-center justify-end">
              <Button
                variant="ghost"
                size="sm"
                disabled={submitting}
                onClick={() => {
                  setActivePrompt("");
                }}
              >
                Skip
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No more follow-ups for this question.
          </p>
        )}
      </div>
    </div>
  );
}
