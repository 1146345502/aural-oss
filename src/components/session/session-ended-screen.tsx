"use client";

import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";

export type SessionEndReason =
  | "COMPLETED"
  | "INTERVIEW_TIME_LIMIT_REACHED"
  | "ACCOUNT_SESSION_TIME_LIMIT_REACHED";

export type SessionEndReasonInput =
  | SessionEndReason
  | "TIME_LIMIT_EXCEEDED"
  | undefined
  | null;

export function normalizeSessionEndReason(
  reason?: SessionEndReasonInput,
): SessionEndReason {
  if (reason === "INTERVIEW_TIME_LIMIT_REACHED") {
    return "INTERVIEW_TIME_LIMIT_REACHED";
  }
  if (
    reason === "ACCOUNT_SESSION_TIME_LIMIT_REACHED" ||
    reason === "TIME_LIMIT_EXCEEDED"
  ) {
    return "ACCOUNT_SESSION_TIME_LIMIT_REACHED";
  }
  return "COMPLETED";
}

const endReasonCopy: Record<
  SessionEndReason,
  {
    description: string;
    icon: typeof CheckCircle2;
    iconClassName: string;
    title: string;
  }
> = {
  COMPLETED: {
    icon: CheckCircle2,
    iconClassName: "text-secondary-500",
    title: "Thank you!",
    description:
      "Your interview has been completed successfully. We appreciate your time and thoughtful responses.",
  },
  INTERVIEW_TIME_LIMIT_REACHED: {
    icon: Clock3,
    iconClassName: "text-amber-600",
    title: "Interview time limit reached",
    description:
      "This interview reached its configured time limit and was submitted automatically. Thank you for your time and responses.",
  },
  ACCOUNT_SESSION_TIME_LIMIT_REACHED: {
    icon: AlertTriangle,
    iconClassName: "text-amber-600",
    title: "Session time limit reached",
    description:
      "This interview ended because the organization's available session time was used up. Your responses were saved, but please contact the interviewer if you need to continue.",
  },
};

export function SessionEndedScreen({
  reason,
}: {
  reason?: SessionEndReasonInput;
}) {
  const normalizedReason = normalizeSessionEndReason(reason);
  const copy = endReasonCopy[normalizedReason];
  const Icon = copy.icon;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="py-12 text-center">
          <Icon className={`mx-auto h-16 w-16 ${copy.iconClassName}`} />
          <h2 className="mt-4 text-2xl font-bold">{copy.title}</h2>
          <p className="mt-2 text-muted-foreground">{copy.description}</p>
        </CardContent>
      </Card>
    </div>
  );
}
