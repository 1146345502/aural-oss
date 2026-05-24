import {
    resolveOrgIdFromInterview,
    trimForPrompt,
    userCanAccessPrepInterview,
    type InterviewForPrep,
} from "@/app/api/prep/_lib";
import { supabaseAdmin } from "@/lib/supabase/admin";

const CACHE_TTL_MS = 5 * 60 * 1000;

type CachedPrepInterviewContext = {
  interview: InterviewForPrep;
  orgId: string | null;
  trimmedJobDescription: string;
  trimmedResumeText: string;
  expiresAt: number;
};

const interviewContextCache = new Map<string, CachedPrepInterviewContext>();

export async function getCachedPrepInterviewContext(
  interviewId: string,
  userId: string,
): Promise<
  | {
      interview: InterviewForPrep;
      orgId: string | null;
      trimmedJobDescription: string;
      trimmedResumeText: string;
    }
  | { error: "not_found" }
> {
  const cached = interviewContextCache.get(interviewId);
  if (
    cached &&
    cached.expiresAt > Date.now() &&
    cached.interview.userId === userId
  ) {
    return cached;
  }

  const { data: interview } = await supabaseAdmin
    .from("interviews")
    .select(
      'id, "userId", "projectId", language, "followUpDepth", "jobDescription", "resumeText", "companyName", "roleTitle", title',
    )
    .eq("id", interviewId)
    .single();

  if (!interview) {
    return { error: "not_found" };
  }

  const typedInterview = interview as unknown as InterviewForPrep;
  const canAccess = await userCanAccessPrepInterview(typedInterview, userId);
  if (!canAccess) {
    return { error: "not_found" };
  }

  const orgId = await resolveOrgIdFromInterview(typedInterview);
  const entry: CachedPrepInterviewContext = {
    interview: typedInterview,
    orgId,
    trimmedJobDescription: trimForPrompt(typedInterview.jobDescription),
    trimmedResumeText: trimForPrompt(typedInterview.resumeText),
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  interviewContextCache.set(interviewId, entry);
  return entry;
}

/** Test helper — clear in-memory cache between cases. */
export function clearPrepInterviewContextCache(): void {
  interviewContextCache.clear();
}
