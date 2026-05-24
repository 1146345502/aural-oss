"use client";

import { Button } from "@/components/ui/button";
import { useVolcengineTts } from "@/hooks/use-volcengine-tts";
import { cn } from "@/lib/utils";
import { CheckCircle2, Volume2 } from "lucide-react";
import type { PrepFeedback } from "./prep-types";
import { scoreTone } from "./prep-types";

type Props = {
  feedback: PrepFeedback | null;
  /** Streaming raw text (the model is still typing). */
  streaming?: string;
  isLoading?: boolean;
  language?: string;
};

export function PrepFeedbackStream({
  feedback,
  streaming,
  isLoading,
  language,
}: Props) {
  const tts = useVolcengineTts(language);

  if (isLoading && !feedback) {
    return (
      <div className="rounded-md border bg-background p-5">
        <p className="text-sm text-muted-foreground">Generating feedback...</p>
        {streaming ? (
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            {streaming}
          </pre>
        ) : null}
      </div>
    );
  }

  if (!feedback) return null;

  const speak = () => {
    void tts.speak(
      `${feedback.verdict}. Score ${feedback.score} out of 10. ${feedback.summary} ${feedback.improvements
        .slice(0, 2)
        .join(". ")}`,
    );
  };

  return (
    <div className="rounded-md border bg-background p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <CheckCircle2 className={cn("h-5 w-5", scoreTone(feedback.score))} />
            <h3 className="text-lg font-semibold">{feedback.verdict}</h3>
            <span className={cn("text-lg font-bold", scoreTone(feedback.score))}>
              {feedback.score}/10
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{feedback.summary}</p>
        </div>
        <Button variant="outline" size="icon" onClick={speak} aria-label="Read feedback">
          <Volume2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <FeedbackList title="What worked" items={feedback.strengths} />
        <FeedbackList title="Improve next" items={feedback.improvements} />
        <FeedbackList title="Missing signals" items={feedback.missingSignals} />
        <FeedbackList title="Resume leverage" items={feedback.resumeLeverage} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md bg-muted/40 p-4">
          <p className="text-sm font-medium">Structure</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {feedback.structureSuggestion}
          </p>
          {feedback.followUpQuestion ? (
            <>
              <p className="mt-4 text-sm font-medium">Likely follow-up</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {feedback.followUpQuestion}
              </p>
            </>
          ) : null}
        </div>
        <div className="rounded-md bg-muted/40 p-4">
          <p className="text-sm font-medium">Sample answer</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {feedback.sampleAnswer || "Sample answer not generated yet."}
          </p>
          {feedback.needsUserVerification.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-medium">Verify before using</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {feedback.needsUserVerification.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FeedbackList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md bg-muted/40 p-4">
      <p className="text-sm font-medium">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">No items.</p>
      )}
    </div>
  );
}
