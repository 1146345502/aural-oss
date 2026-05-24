"use client";

import { AiButton } from "@/components/ui/ai-button";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Lightbulb, X } from "lucide-react";
import { useState } from "react";
import { readPrepStream } from "./prep-stream";

type Props = {
  interviewId: string;
  questionId: string;
  disabledReason?: string;
};

export function PrepHintButton({ interviewId, questionId, disabledReason }: Props) {
  const { toast } = useToast();
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchHint = async () => {
    if (loading) return;
    setLoading(true);
    setHint("");
    try {
      const res = await fetch("/api/prep/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId, questionId }),
      });
      await readPrepStream<Record<string, unknown>>(res, (token) => {
        setHint((prev) => prev + token);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Hint failed";
      toast({ title: "Hint failed", description: message, variant: "destructive" });
      setHint("");
    } finally {
      setLoading(false);
    }
  };

  if (!hint && !loading) {
    return (
      <AiButton
        wrapperClassName="w-fit"
        size="sm"
        className="gap-2"
        loading={false}
        disabled={!!disabledReason}
        onClick={fetchHint}
        title={disabledReason}
      >
        <Lightbulb className="h-4 w-4" />
        Show suggested answer
      </AiButton>
    );
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-300">
          <Lightbulb className="h-4 w-4" />
          Suggested answer
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => {
            setHint("");
          }}
          aria-label="Hide suggested answer"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-amber-900/90 dark:text-amber-100/80">
        {hint || "Generating..."}
      </p>
    </div>
  );
}
