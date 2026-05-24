import type { InterviewForPrep } from "@/app/api/prep/_lib";
import { getAuthUser } from "@/lib/auth";
import { getCachedPrepInterviewContext } from "@/lib/prep/prep-feedback-context-cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

type PrepSessionRow = {
  id: string;
  interviewId: string;
  userId: string;
  status: string;
};

type PrepQuestionRow = {
  id: string;
  text: string;
  description: string | null;
  type: string;
};

type PriorAttemptRow = {
  answerText: unknown;
  score: unknown;
  feedback: unknown;
  attemptNumber: unknown;
};

export type LoadedPrepFeedbackContext = {
  user: { id: string };
  session: PrepSessionRow;
  interview: InterviewForPrep;
  orgId: string | null;
  trimmedJobDescription: string;
  trimmedResumeText: string;
  question: PrepQuestionRow;
  priorAttempts: PriorAttemptRow[] | null;
  tokenCheck: {
    allowed: true;
    balance: number;
  };
};

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Load session, auth, interview cache, question, attempts, and token balance in parallel where possible. */
export async function loadPrepFeedbackContext(
  sessionId: string,
  questionId: string,
): Promise<LoadedPrepFeedbackContext | { error: Response }> {
  const [user, sessionResult] = await Promise.all([
    getAuthUser(),
    supabaseAdmin
      .from("prep_sessions")
      .select("id, interviewId, userId, status")
      .eq("id", sessionId)
      .single(),
  ]);

  if (!user) {
    return { error: jsonError(401, "Unauthorized") };
  }

  const session = sessionResult.data as PrepSessionRow | null;
  if (!session) {
    return { error: jsonError(404, "Prep session not found") };
  }
  if (session.status !== "IN_PROGRESS") {
    return {
      error: jsonError(400, "This prep session is already complete."),
    };
  }
  if (session.userId !== user.id) {
    return { error: jsonError(403, "Forbidden") };
  }

  const interviewCtx = await getCachedPrepInterviewContext(
    session.interviewId,
    user.id,
  );
  if ("error" in interviewCtx) {
    return { error: jsonError(404, "Interview not found") };
  }

  const {
    interview,
    orgId,
    trimmedJobDescription,
    trimmedResumeText,
  } = interviewCtx;

  const [questionResult, priorAttemptsResult] = await Promise.all([
    supabaseAdmin
      .from("questions")
      .select("id, text, description, type")
      .eq("id", questionId)
      .eq("interviewId", interview.id)
      .single(),
    supabaseAdmin
      .from("prep_attempts")
      .select("answerText, score, feedback, attemptNumber")
      .eq("questionId", questionId)
      .eq("userId", user.id)
      .order("attemptNumber", { ascending: true })
      .limit(5),
  ]);

  const question = questionResult.data as PrepQuestionRow | null;
  if (!question) {
    return { error: jsonError(404, "Question not found") };
  }

  return {
    user: { id: user.id },
    session,
    interview,
    orgId,
    trimmedJobDescription,
    trimmedResumeText,
    question,
    priorAttempts: priorAttemptsResult.data as PriorAttemptRow[] | null,
    tokenCheck: {
      allowed: true,
      balance: Number.MAX_SAFE_INTEGER,
    },
  };
}
