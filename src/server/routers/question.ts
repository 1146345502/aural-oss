import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { getOrgMembership, assertMinRole, hasProjectAccess, filterAccessibleProjectIds, getEffectiveProjectRole, type MemberRole } from "../trpc";

const questionInput = z.object({
  text: z.string().min(1),
  description: z.string().nullable().optional(),
  type: z.enum([
    "OPEN_ENDED",
    "SINGLE_CHOICE",
    "MULTIPLE_CHOICE",
    "CODING",
    "WHITEBOARD",
    "RESEARCH",
  ]),
  options: z.any().optional(),
  starterCode: z
    .object({ language: z.string(), code: z.string() })
    .nullable()
    .optional(),
  validationRules: z.any().optional(),
  followUpPrompts: z.any().optional(),
  probeOnShort: z.boolean().default(true),
  probeThreshold: z.number().nullable().optional(),
  showIf: z.any().optional(),
  skipIf: z.any().optional(),
  timeLimitSeconds: z.number().nullable().optional(),
  isRequired: z.boolean().default(true),
  allowFileUpload: z.boolean().default(false),
  allowedFileTypes: z.array(z.string()).default([]),
});

async function verifyInterviewAccess(
  supabase: Parameters<typeof getOrgMembership>[0],
  interviewId: string,
  userId: string,
): Promise<{ role: MemberRole; interviewUserId: string }> {
  const { data: interview } = await supabase
    .from("interviews")
    .select("userId, projectId, project:projects!inner(organizationId)")
    .eq("id", interviewId)
    .single();

  if (!interview) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Interview not found" });
  }

  const project = interview.project as unknown as {
    organizationId: string;
  };

  const membership = await getOrgMembership(
    supabase,
    project.organizationId,
    userId,
  );
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization" });
  }

  const projAccess = await hasProjectAccess(supabase, interview.projectId, userId);
  if (!projAccess) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" });
  }

  const effectiveRole = await getEffectiveProjectRole(
    supabase,
    interview.projectId,
    userId,
    membership.role,
  );

  return { role: effectiveRole, interviewUserId: interview.userId };
}

export const questionRouter = router({
  create: protectedProcedure
    .input(z.object({ interviewId: z.string(), order: z.number().optional(), ...questionInput.shape }))
    .mutation(async ({ ctx, input }) => {
      const { role, interviewUserId } = await verifyInterviewAccess(
        ctx.supabase,
        input.interviewId,
        ctx.user.id,
      );
      if (role === "MEMBER" && interviewUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only modify questions on interviews you created" });
      }
      assertMinRole(role, "MEMBER");

      let resolvedOrder: number;
      if (input.order !== undefined) {
        resolvedOrder = input.order;
      } else {
        const { data: maxOrderRow } = await ctx.supabase
          .from("questions")
          .select("order")
          .eq("interviewId", input.interviewId)
          .order("order", { ascending: false })
          .limit(1)
          .single();
        resolvedOrder = (maxOrderRow?.order ?? -1) + 1;
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { interviewId, starterCode, order: _order, ...rest } = input;

      const { data: question, error } = await ctx.supabase
        .from("questions")
        .insert({
          ...rest,
          interviewId,
          order: resolvedOrder,
          starterCode: starterCode ?? null,
        })
        .select()
        .single();

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      return question;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), ...questionInput.partial().shape }))
    .mutation(async ({ ctx, input }) => {
      const { id, starterCode, ...rest } = input;

      const { data: question } = await ctx.supabase
        .from("questions")
        .select("id, interviewId")
        .eq("id", id)
        .single();

      if (!question) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { role, interviewUserId } = await verifyInterviewAccess(
        ctx.supabase,
        question.interviewId,
        ctx.user.id,
      );
      if (role === "MEMBER" && interviewUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only modify questions on interviews you created" });
      }
      assertMinRole(role, "MEMBER");

      const updateData: Record<string, unknown> = { ...rest };
      if (starterCode !== undefined) {
        updateData.starterCode = starterCode;
      }

      const { data: updated } = await ctx.supabase
        .from("questions")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: question } = await ctx.supabase
        .from("questions")
        .select("id, interviewId")
        .eq("id", input.id)
        .single();

      if (!question) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { role, interviewUserId } = await verifyInterviewAccess(
        ctx.supabase,
        question.interviewId,
        ctx.user.id,
      );
      if (role === "MEMBER" && interviewUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete questions on interviews you created" });
      }
      assertMinRole(role, "MEMBER");

      await ctx.supabase.from("questions").delete().eq("id", input.id);

      const { data: remaining } = await ctx.supabase
        .from("questions")
        .select("id")
        .eq("interviewId", question.interviewId)
        .order("order", { ascending: true });

      if (remaining) {
        await Promise.all(
          remaining.map((q, index) =>
            ctx.supabase
              .from("questions")
              .update({ order: index })
              .eq("id", q.id),
          ),
        );
      }

      return { success: true };
    }),

  reorder: protectedProcedure
    .input(
      z.object({
        interviewId: z.string(),
        questionIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { role, interviewUserId } = await verifyInterviewAccess(
        ctx.supabase,
        input.interviewId,
        ctx.user.id,
      );
      if (role === "MEMBER" && interviewUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only reorder questions on interviews you created" });
      }
      assertMinRole(role, "MEMBER");

      await Promise.all(
        input.questionIds.map((id, index) =>
          ctx.supabase
            .from("questions")
            .update({ order: index })
            .eq("id", id),
        ),
      );

      return { success: true };
    }),

  listAll: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        projectId: z.string().optional(),
        type: z
          .enum([
            "OPEN_ENDED",
            "SINGLE_CHOICE",
            "MULTIPLE_CHOICE",
            "CODING",
            "WHITEBOARD",
            "RESEARCH",
          ])
          .optional(),
        limit: z.number().min(1).max(200).default(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Get interview IDs accessible to user via org membership
      const { data: memberships } = await ctx.supabase
        .from("organization_members")
        .select("workspaceId")
        .eq("userId", ctx.user.id);

      let orgIds = (memberships ?? []).map(
        (m: { workspaceId: string }) => m.workspaceId,
      );

      if (input.organizationId) {
        if (!orgIds.includes(input.organizationId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization" });
        }
        orgIds = [input.organizationId];
      }

      if (orgIds.length === 0) return { questions: [] };

      let projectIds: string[];
      if (input.projectId) {
        const projAccess = await hasProjectAccess(ctx.supabase, input.projectId, ctx.user.id);
        projectIds = projAccess ? [input.projectId] : [];
      } else {
        const { data: projects } = await ctx.supabase
          .from("projects")
          .select("id")
          .in("organizationId", orgIds);
        const allProjIds = (projects ?? []).map((p: { id: string }) => p.id);
        projectIds = await filterAccessibleProjectIds(ctx.supabase, allProjIds, ctx.user.id);
      }
      if (projectIds.length === 0) return { questions: [] };

      const { data: interviews } = await ctx.supabase
        .from("interviews")
        .select("id")
        .in("projectId", projectIds);

      const interviewIds = (interviews ?? []).map(
        (i: { id: string }) => i.id,
      );
      if (interviewIds.length === 0) return { questions: [] };

      let query = ctx.supabase
        .from("questions")
        .select("*, interview:interviews!inner(id, title)")
        .in("interviewId", interviewIds)
        .order("createdAt", { ascending: false })
        .limit(input.limit);

      if (input.type) {
        query = query.eq("type", input.type);
      }

      const { data: questions } = await query;
      return { questions: questions ?? [] };
    }),
});
