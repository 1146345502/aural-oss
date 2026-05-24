import { effectivePrepDurationSeconds } from "@/lib/prep/session-duration";
import {
    PREP_FEEDBACK_TOKEN_COST,
    PREP_SUGGESTED_ANSWER_TOKEN_COST,
} from "@/lib/prep/token-costs";
import { resolvePrepAnswerAudioUrl } from "@/lib/prep/upload-answer-audio";
import { RETENTION_DAYS } from "@/lib/retention-days";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
    filterAccessibleProjectIds,
    getOrgMembership,
    hasProjectAccess,
    protectedProcedure,
    router,
} from "../trpc";

type InterviewRow = {
  id: string;
  userId: string;
  projectId: string | null;
  title: string;
  description: string | null;
  language: string;
  followUpDepth: "LIGHT" | "MODERATE" | "DEEP";
  jobDescription: string | null;
  resumeText: string | null;
  parsedResume: unknown;
  companyName: string | null;
  roleTitle: string | null;
};

type QuestionRow = {
  id: string;
  interviewId: string;
  order: number;
  text: string;
  description: string | null;
  type: string;
};

type PrepAttemptRow = {
  id: string;
  sessionId: string;
  interviewId: string;
  questionId: string;
  userId: string;
  answerText: string;
  inputMode: string;
  durationSeconds: number | null;
  feedback: unknown;
  followUp: unknown;
  score: number | null;
  attemptNumber: number;
  createdAt: string;
  audioUrl: string | null;
  audioDurationSeconds: number | null;
};

type PrepSessionRow = {
  id: string;
  interviewId: string;
  userId: string;
  organizationId: string | null;
  mode: string;
  status: string;
  timed: boolean;
  durationLimitMinutes: number | null;
  startedAt: string;
  lastActivityAt: string;
  completedAt: string | null;
  totalDurationSeconds: number | null;
  createdAt: string;
};

type PrepFeedback = {
  score?: number;
  verdict?: string;
  summary?: string;
  improvements?: string[];
  missingSignals?: string[];
};

type PracticeSessionSummary = {
  id: string;
  interviewId: string;
  interviewTitle: string;
  mode: string;
  status: string;
  timed: boolean;
  durationLimitMinutes: number | null;
  startedAt: string;
  lastActivityAt: string;
  completedAt: string | null;
  totalDurationSeconds: number | null;
  createdAt: string;
  attemptCount: number;
  averageScore: number | null;
  bestScore: number | null;
  questionCount: number;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

async function loadInterviewForOwner(
  supabase: typeof import("@/lib/supabase/admin").supabaseAdmin,
  interviewId: string,
  userId: string,
): Promise<InterviewRow> {
  const { data: interview } = await supabase
    .from("interviews")
    .select(
      'id, "userId", "projectId", title, description, language, "followUpDepth", "jobDescription", "resumeText", "parsedResume", "companyName", "roleTitle"',
    )
    .eq("id", interviewId)
    .single();

  if (!interview) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Interview not found" });
  }

  if (interview.userId === userId) {
    return interview as InterviewRow;
  }

  let organizationId: string | null = null;
  if (interview.projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("organizationId")
      .eq("id", interview.projectId)
      .single();
    organizationId = (project?.organizationId as string | null) ?? null;
  }

  if (!organizationId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Interview not found" });
  }

  const membership = await getOrgMembership(supabase, organizationId, userId);
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this organization",
    });
  }

  if (interview.projectId) {
    const canAccessProject = await hasProjectAccess(
      supabase,
      interview.projectId,
      userId,
    );
    if (!canAccessProject) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have access to this project",
      });
    }
  }

  return interview as InterviewRow;
}

async function resolveInterviewOrgId(
  supabase: typeof import("@/lib/supabase/admin").supabaseAdmin,
  interview: InterviewRow,
): Promise<string | null> {
  if (!interview.projectId) return null;
  const { data: project } = await supabase
    .from("projects")
    .select("organizationId")
    .eq("id", interview.projectId)
    .single();
  return (project?.organizationId as string | null) ?? null;
}

function computeWeakAreas(
  attempts: Array<PrepAttemptRow & { question: QuestionRow | null }>,
) {
  const groups = new Map<
    string,
    { questionText: string; scores: number[]; notes: string[] }
  >();

  for (const attempt of attempts) {
    const score = Number(attempt.score);
    if (!Number.isFinite(score) || score > 7) continue;
    const key = attempt.questionId;
    const group =
      groups.get(key) ??
      {
        questionText: attempt.question?.text ?? "Question",
        scores: [],
        notes: [],
      };
    group.scores.push(score);
    const feedback = attempt.feedback as PrepFeedback | null;
    for (const note of [
      ...asStringArray(feedback?.improvements),
      ...asStringArray(feedback?.missingSignals),
    ].slice(0, 3)) {
      if (!group.notes.includes(note)) group.notes.push(note);
    }
    groups.set(key, group);
  }

  return Array.from(groups.entries())
    .map(([questionId, group]) => ({
      questionId,
      questionText: group.questionText,
      averageScore:
        group.scores.reduce((sum, value) => sum + value, 0) / group.scores.length,
      notes: group.notes.slice(0, 5),
    }))
    .sort((a, b) => a.averageScore - b.averageScore)
    .slice(0, 5);
}

function buildPracticeSummaries({
  sessions,
  attempts,
  interviewTitleMap,
  questionCountMap,
}: {
  sessions: PrepSessionRow[];
  attempts: PrepAttemptRow[];
  interviewTitleMap: Map<string, string>;
  questionCountMap: Map<string, number>;
}): PracticeSessionSummary[] {
  const attemptsBySession = new Map<string, PrepAttemptRow[]>();
  for (const attempt of attempts) {
    const rows = attemptsBySession.get(attempt.sessionId) ?? [];
    rows.push(attempt);
    attemptsBySession.set(attempt.sessionId, rows);
  }

  return sessions.map((session) => {
    const sessionAttempts = attemptsBySession.get(session.id) ?? [];
    const scores = sessionAttempts
      .map((attempt) => Number(attempt.score))
      .filter((score) => Number.isFinite(score));

    return {
      id: session.id,
      interviewId: session.interviewId,
      interviewTitle:
        interviewTitleMap.get(session.interviewId) ?? "Practice",
      mode: session.mode,
      status: session.status,
      timed: session.timed,
      durationLimitMinutes: session.durationLimitMinutes,
      startedAt: session.startedAt,
      lastActivityAt: session.lastActivityAt,
      completedAt: session.completedAt,
      totalDurationSeconds: session.totalDurationSeconds,
      createdAt: session.createdAt,
      attemptCount: sessionAttempts.length,
      averageScore:
        scores.length > 0
          ? scores.reduce((sum, score) => sum + score, 0) / scores.length
          : null,
      bestScore:
        scores.length > 0 ? Math.max(...scores) : null,
      questionCount: questionCountMap.get(session.interviewId) ?? 0,
    };
  });
}

export const prepRouter = router({
  /** Cursor-sized practice session summaries for one interview or project. */
  listSessions: protectedProcedure
    .input(
      z.object({
        interviewId: z.string().optional(),
        organizationId: z.string().optional(),
        projectId: z.string().optional(),
        limit: z.number().min(1).max(500).default(250),
      }),
    )
    .query(async ({ ctx, input }) => {
      let interviewIds: string[] = [];
      let interviewTitleMap = new Map<string, string>();

      if (input.interviewId) {
        const interview = await loadInterviewForOwner(
          ctx.supabase,
          input.interviewId,
          ctx.user.id,
        );
        interviewIds = [interview.id];
        interviewTitleMap = new Map([[interview.id, interview.title]]);
      } else {
        let projectIds: string[] = [];

        if (input.projectId) {
          const canAccess = await hasProjectAccess(
            ctx.supabase,
            input.projectId,
            ctx.user.id,
          );
          projectIds = canAccess ? [input.projectId] : [];
        } else {
          const { data: memberships } = await ctx.supabase
            .from("organization_members")
            .select("workspaceId")
            .eq("userId", ctx.user.id);

          let orgIds = (memberships ?? []).map(
            (membership: { workspaceId: string }) => membership.workspaceId,
          );

          if (input.organizationId) {
            if (!orgIds.includes(input.organizationId)) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "You are not a member of this organization",
              });
            }
            orgIds = [input.organizationId];
          }

          if (orgIds.length > 0) {
            const { data: projects } = await ctx.supabase
              .from("projects")
              .select("id")
              .in("organizationId", orgIds);
            const allProjectIds = (projects ?? []).map(
              (project: { id: string }) => project.id,
            );
            projectIds = await filterAccessibleProjectIds(
              ctx.supabase,
              allProjectIds,
              ctx.user.id,
            );
          }
        }

        if (projectIds.length > 0) {
          const { data: interviews } = await ctx.supabase
            .from("interviews")
            .select("id, title")
            .in("projectId", projectIds);

          interviewIds = (interviews ?? []).map(
            (interview: { id: string }) => interview.id,
          );
          interviewTitleMap = new Map(
            (interviews ?? []).map((interview) => [
              interview.id,
              interview.title,
            ]),
          );
        }
      }

      if (interviewIds.length === 0) {
        return { sessions: [] as PracticeSessionSummary[] };
      }

      const { data: sessions } = await ctx.supabase
        .from("prep_sessions")
        .select("*")
        .eq("userId", ctx.user.id)
        .in("interviewId", interviewIds)
        .order("createdAt", { ascending: false })
        .limit(input.limit);

      const sessionRows = (sessions ?? []) as PrepSessionRow[];
      if (sessionRows.length === 0) {
        return { sessions: [] as PracticeSessionSummary[] };
      }

      const sessionIds = sessionRows.map((session) => session.id);
      const [{ data: attempts }, { data: questions }] = await Promise.all([
        ctx.supabase
          .from("prep_attempts")
          .select("*")
          .eq("userId", ctx.user.id)
          .in("sessionId", sessionIds),
        ctx.supabase
          .from("questions")
          .select('id, "interviewId"')
          .in("interviewId", interviewIds),
      ]);

      const questionCountMap = new Map<string, number>();
      for (const question of questions ?? []) {
        const interviewId = (question as { interviewId: string }).interviewId;
        questionCountMap.set(
          interviewId,
          (questionCountMap.get(interviewId) ?? 0) + 1,
        );
      }

      return {
        sessions: buildPracticeSummaries({
          sessions: sessionRows,
          attempts: (attempts ?? []) as PrepAttemptRow[],
          interviewTitleMap,
          questionCountMap,
        }),
      };
    }),

  /** Delete practice sessions owned by the current user. */
  deleteSessions: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("prep_sessions")
        .delete()
        .eq("userId", ctx.user.id)
        .in("id", input.ids)
        .select("id");

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return { deleted: data?.length ?? 0 };
    }),

  /** Full bundle for the prep tab and focused mode. */
  getBundle: protectedProcedure
    .input(z.object({ interviewId: z.string() }))
    .query(async ({ ctx, input }) => {
      const interview = await loadInterviewForOwner(
        ctx.supabase,
        input.interviewId,
        ctx.user.id,
      );

      const [{ data: questions }, { data: attempts }, { data: sessions }] =
        await Promise.all([
          ctx.supabase
            .from("questions")
            .select('id, "interviewId", "order", text, description, type')
            .eq("interviewId", interview.id)
            .order("order", { ascending: true }),
          ctx.supabase
            .from("prep_attempts")
            .select("*")
            .eq("interviewId", interview.id)
            .eq("userId", ctx.user.id)
            .order("createdAt", { ascending: false })
            .limit(200),
          ctx.supabase
            .from("prep_sessions")
            .select("*")
            .eq("interviewId", interview.id)
            .eq("userId", ctx.user.id)
            .order("createdAt", { ascending: false })
            .limit(20),
        ]);

      const questionRows = (questions ?? []) as QuestionRow[];
      const attemptRows = (attempts ?? []) as PrepAttemptRow[];
      const questionMap = new Map(questionRows.map((q) => [q.id, q]));
      const planTier = "Self-hosted";
      const attemptsWithQuestion = await Promise.all(
        attemptRows.map(async (attempt) => {
          const playbackUrl = await resolvePrepAnswerAudioUrl(attempt.audioUrl);
          return {
            ...attempt,
            audioUrl: playbackUrl,
            question: questionMap.get(attempt.questionId) ?? null,
          };
        }),
      );
      const hasAnswerAudio = attemptsWithQuestion.some(
        (attempt) => Boolean(attempt.audioUrl),
      );

      return {
        interview,
        questions: questionRows,
        attempts: attemptsWithQuestion,
        sessions: (sessions ?? []) as PrepSessionRow[],
        weakAreas: computeWeakAreas(attemptsWithQuestion),
        planTier,
        mediaRetention: {
          retentionDays: RETENTION_DAYS,
          hasAnswerAudio,
        },
      };
    }),

  /** Update JD/resume on the interview from the prep tab. */
  updateContext: protectedProcedure
    .input(
      z.object({
        interviewId: z.string(),
        jobDescription: z.string().nullable().optional(),
        resumeText: z.string().nullable().optional(),
        parsedResume: z.unknown().optional(),
        companyName: z.string().nullable().optional(),
        roleTitle: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadInterviewForOwner(ctx.supabase, input.interviewId, ctx.user.id);

      const { interviewId, ...patch } = input;
      const { data, error } = await ctx.supabase
        .from("interviews")
        .update(patch)
        .eq("id", interviewId)
        .select(
          'id, "jobDescription", "resumeText", "parsedResume", "companyName", "roleTitle"',
        )
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return data;
    }),

  /** Start a practice session against the interview's questions. */
  startSession: protectedProcedure
    .input(
      z.object({
        interviewId: z.string(),
        mode: z.enum(["TEXT", "VOICE"]).default("TEXT"),
        timed: z.boolean().default(false),
        durationLimitMinutes: z.number().int().min(5).max(180).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const interview = await loadInterviewForOwner(
        ctx.supabase,
        input.interviewId,
        ctx.user.id,
      );
      const orgId = await resolveInterviewOrgId(ctx.supabase, interview);

      const { data: session, error } = await ctx.supabase
        .from("prep_sessions")
        .insert({
          interviewId: interview.id,
          userId: ctx.user.id,
          organizationId: orgId,
          mode: input.mode,
          timed: input.timed,
          durationLimitMinutes: input.timed ? input.durationLimitMinutes ?? 30 : null,
        })
        .select("*")
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return session as PrepSessionRow;
    }),

  /** OSS builds do not enforce commercial AI-token limits. */
  getAiTokenBalance: protectedProcedure
    .input(z.object({ interviewId: z.string() }))
    .query(async ({ ctx, input }) => {
      await loadInterviewForOwner(
        ctx.supabase,
        input.interviewId,
        ctx.user.id,
      );
      return {
        balance: Number.MAX_SAFE_INTEGER,
        canGrade: true,
        canHint: true,
        feedbackTokenCost: PREP_FEEDBACK_TOKEN_COST,
        hintTokenCost: PREP_SUGGESTED_ANSWER_TOKEN_COST,
      };
    }),

  /** Mark a practice session complete. */
  endSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: session } = await ctx.supabase
        .from("prep_sessions")
        .select("*")
        .eq("id", input.sessionId)
        .eq("userId", ctx.user.id)
        .single();

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Prep session not found",
        });
      }
      if (session.status === "COMPLETED") return session as PrepSessionRow;

      const now = new Date();
      const nowIso = now.toISOString();
      const durationSeconds =
        effectivePrepDurationSeconds(
          {
            ...session,
            lastActivityAt: nowIso,
            status: "IN_PROGRESS",
          },
          now.getTime(),
        ) ?? 0;

      const { data: completed, error } = await ctx.supabase
        .from("prep_sessions")
        .update({
          status: "COMPLETED",
          completedAt: nowIso,
          lastActivityAt: nowIso,
          totalDurationSeconds: durationSeconds,
        })
        .eq("id", input.sessionId)
        .select("*")
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return completed as PrepSessionRow;
    }),
});
