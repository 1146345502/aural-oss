"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useTranslations, type Dictionary } from "@/locales";
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

function getEndReasonCopy(t: Dictionary, reason: SessionEndReason) {
  switch (reason) {
    case "INTERVIEW_TIME_LIMIT_REACHED":
      return {
        icon: Clock3,
        iconClassName: "text-amber-600",
        title: t.sessionEndedScreen.interviewTimeLimit.title,
        description: t.sessionEndedScreen.interviewTimeLimit.description,
      };
    case "ACCOUNT_SESSION_TIME_LIMIT_REACHED":
      return {
        icon: AlertTriangle,
        iconClassName: "text-amber-600",
        title: t.sessionEndedScreen.accountTimeLimit.title,
        description: t.sessionEndedScreen.accountTimeLimit.description,
      };
    default:
      return {
        icon: CheckCircle2,
        iconClassName: "text-secondary-500",
        title: t.sessionEndedScreen.completed.title,
        description: t.sessionEndedScreen.completed.description,
      };
  }
}

export function SessionEndedScreen({
  reason,
  language,
}: {
  reason?: SessionEndReasonInput;
  language?: string;
}) {
  const t = useTranslations(language);
  const normalizedReason = normalizeSessionEndReason(reason);
  const copy = getEndReasonCopy(t, normalizedReason);
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
