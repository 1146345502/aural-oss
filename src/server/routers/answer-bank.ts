import { resolvePrepAnswerAudioUrl } from "@/lib/prep/upload-answer-audio";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

type AnswerBankRow = {
  id: string;
  userId: string;
  interviewId: string | null;
  questionId: string | null;
  attemptId: string | null;
  interviewTitle: string;
  questionText: string;
  questionType: string | null;
  answerText: string;
  score: number | null;
  feedback: unknown;
  audioPath: string | null;
  note: string | null;
  createdAt: string;
};

export const answerBankRouter = router({
  /** Bookmark / unbookmark one practice attempt as a personal answer-bank entry. */
  toggle: protectedProcedure
    .input(z.object({ attemptId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: existing } = await ctx.supabase
        .from("prep_answer_bank")
        .select("id")
        .eq("userId", ctx.user.id)
        .eq("attemptId", input.attemptId)
        .maybeSingle();

      if (existing) {
        const { error } = await ctx.supabase
          .from("prep_answer_bank")
          .delete()
          .eq("id", existing.id)
          .eq("userId", ctx.user.id);
        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }
        return { bookmarked: false as const };
      }

      const { data: attempt } = await ctx.supabase
        .from("prep_attempts")
        .select(
          'id, "interviewId", "questionId", "answerText", feedback, score, "audioUrl"',
        )
        .eq("id", input.attemptId)
        .eq("userId", ctx.user.id)
        .single();

      if (!attempt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Practice attempt not found",
        });
      }

      const [{ data: question }, { data: interview }] = await Promise.all([
        ctx.supabase
          .from("questions")
          .select("text, type")
          .eq("id", attempt.questionId)
          .maybeSingle(),
        ctx.supabase
          .from("interviews")
          .select("title")
          .eq("id", attempt.interviewId)
          .maybeSingle(),
      ]);

      const { error } = await ctx.supabase.from("prep_answer_bank").insert({
        userId: ctx.user.id,
        interviewId: attempt.interviewId,
        questionId: attempt.questionId,
        attemptId: attempt.id,
        interviewTitle: (interview?.title as string | undefined) ?? "",
        questionText: (question?.text as string | undefined) ?? "Question",
        questionType: (question?.type as string | undefined) ?? null,
        answerText: attempt.answerText,
        score: attempt.score,
        feedback: attempt.feedback ?? {},
        audioPath: attempt.audioUrl ?? null,
      });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { bookmarked: true as const };
    }),

  /** Attempt ids the user already bookmarked (for toggle state in practice UIs). */
  listAttemptIds: protectedProcedure
    .input(z.object({ interviewId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("prep_answer_bank")
        .select('"attemptId"')
        .eq("userId", ctx.user.id)
        .not("attemptId", "is", null);
      if (input?.interviewId) {
        query = query.eq("interviewId", input.interviewId);
      }
      const { data } = await query.limit(500);
      return ((data ?? []) as Array<{ attemptId: string | null }>)
        .map((row) => row.attemptId)
        .filter((id): id is string => Boolean(id));
    }),

  /** Full answer-bank entries for the current user, newest first. */
  list: protectedProcedure
    .input(
      z
        .object({ limit: z.number().min(1).max(200).default(100) })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("prep_answer_bank")
        .select("*")
        .eq("userId", ctx.user.id)
        .order("createdAt", { ascending: false })
        .limit(input?.limit ?? 100);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const rows = (data ?? []) as AnswerBankRow[];
      return Promise.all(
        rows.map(async (row) => ({
          ...row,
          audioUrl: await resolvePrepAnswerAudioUrl(row.audioPath),
        })),
      );
    }),

  /** Manually add an answer-bank entry (not linked to a practice attempt). */
  create: protectedProcedure
    .input(
      z.object({
        questionText: z.string().trim().min(1).max(2000),
        /** Plain text or sanitized rich HTML. */
        answerText: z.string().trim().min(1).max(20000),
        note: z.string().max(2000).optional(),
        interviewId: z.string().uuid().optional(),
        questionId: z.string().uuid().optional(),
        questionType: z.string().nullable().optional(),
        interviewTitle: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("prep_answer_bank")
        .insert({
          userId: ctx.user.id,
          questionText: input.questionText,
          answerText: input.answerText,
          note: input.note?.trim() || null,
          interviewId: input.interviewId ?? null,
          questionId: input.questionId ?? null,
          questionType: input.questionType ?? null,
          interviewTitle: input.interviewTitle?.trim() ?? "",
        })
        .select("id")
        .single();
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { id: data.id as string };
    }),

  /** Edit the saved answer text (plain text or sanitized rich HTML). */
  updateAnswer: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        answerText: z.string().trim().min(1).max(20000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("prep_answer_bank")
        .update({ answerText: input.answerText })
        .eq("id", input.id)
        .eq("userId", ctx.user.id);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true };
    }),

  /** Remove one answer-bank entry. */
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("prep_answer_bank")
        .delete()
        .eq("id", input.id)
        .eq("userId", ctx.user.id);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true };
    }),

  /** Update the personal note on an entry. */
  updateNote: protectedProcedure
    .input(z.object({ id: z.string(), note: z.string().max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("prep_answer_bank")
        .update({ note: input.note.trim() || null })
        .eq("id", input.id)
        .eq("userId", ctx.user.id);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { ok: true };
    }),
});
