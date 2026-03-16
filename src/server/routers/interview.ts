import { nanoid } from "@/lib/id";
import { getSessionOverallScore } from "@/lib/session-score";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  assertMinRole,
  filterAccessibleProjectIds,
  getEffectiveProjectRole,
  getOrgMembership,
  hasProjectAccess,
  protectedProcedure,
  publicProcedure,
  router,
} from "../trpc";

function emptyDashboard() {
  return {
    totalInterviews: 0,
    totalSessions: 0,
    totalQuestions: 0,
    totalDuration: 0,
    totalMessages: 0,
    completionRate: 0,
    avgSessionDuration: 0,
    avgMessagesPerSession: 0,
    daily: [] as {
      date: string;
      sessions: number;
      sessionMinutes: number;
      messages: number;
      interviews: number;
      questions: number;
    }[],
    questionTypeBreakdown: {
      OPEN_ENDED: 0,
      SINGLE_CHOICE: 0,
      MULTIPLE_CHOICE: 0,
      CODING: 0,
      WHITEBOARD: 0,
      RESEARCH: 0,
    },
    statusBreakdown: { COMPLETED: 0, IN_PROGRESS: 0, NOT_STARTED: 0 },
    topThemes: [] as { theme: string; count: number }[],
    recentSessions: [] as {
      id: string;
      interviewId: string;
      name: string;
      status: string;
      duration: number;
      messages: number;
      date: string;
      score: number | null;
    }[],
  };
}

/* ------------------------------------------------------------------ */
/*  Helper: verify the caller has access to an interview via org      */
/* ------------------------------------------------------------------ */

async function getInterviewWithAccess(
  supabase: Parameters<typeof getOrgMembership>[0],
  interviewId: string,
  userId: string,
) {
  const { data: interview } = await supabase
    .from("interviews")
    .select("*, project:projects!inner(id, organizationId)")
    .eq("id", interviewId)
    .single();

  if (!interview) return null;

  const project = interview.project as unknown as {
    id: string;
    organizationId: string;
  };

  const membership = await getOrgMembership(
    supabase,
    project.organizationId,
    userId,
  );

  if (!membership) return null;

  const projectAccess = await hasProjectAccess(supabase, project.id, userId);
  if (!projectAccess) return null;

  const effectiveRole = await getEffectiveProjectRole(
    supabase,
    project.id,
    userId,
    membership.role,
  );

  return { interview, orgId: project.organizationId, role: effectiveRole };
}

export const interviewRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          organizationId: z.string().optional(),
          projectId: z.string().optional(),
          limit: z.number().min(1).max(100).default(20),
          cursor: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;

      // If orgId given, verify membership
      if (input?.organizationId) {
        const membership = await getOrgMembership(
          ctx.supabase,
          input.organizationId,
          ctx.user.id,
        );
        if (!membership) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not a member of this organization",
          });
        }
      }

      let query = ctx.supabase
        .from("interviews")
        .select(
          "*, questions(id), sessions(id), project:projects!inner(id, organizationId)",
        )
        .order("updatedAt", { ascending: false })
        .limit(limit + 1);

      if (input?.projectId) {
        const projAccess = await hasProjectAccess(
          ctx.supabase,
          input.projectId,
          ctx.user.id,
        );
        if (!projAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this project",
          });
        }
        query = query.eq("projectId", input.projectId);
      } else if (input?.organizationId) {
        const { data: orgProjects } = await ctx.supabase
          .from("projects")
          .select("id")
          .eq("organizationId", input.organizationId);
        const allProjIds = (orgProjects ?? []).map((p: { id: string }) => p.id);
        const accessibleProjIds = await filterAccessibleProjectIds(
          ctx.supabase,
          allProjIds,
          ctx.user.id,
        );
        if (accessibleProjIds.length === 0)
          return { interviews: [], nextCursor: undefined };
        query = query.in("projectId", accessibleProjIds);
      } else {
        const { data: memberships } = await ctx.supabase
          .from("organization_members")
          .select("workspaceId")
          .eq("userId", ctx.user.id);

        const orgIds = (memberships ?? []).map(
          (m: { workspaceId: string }) => m.workspaceId,
        );
        if (orgIds.length === 0)
          return { interviews: [], nextCursor: undefined };

        const { data: allProjects } = await ctx.supabase
          .from("projects")
          .select("id")
          .in("organizationId", orgIds);
        const allProjIds = (allProjects ?? []).map((p: { id: string }) => p.id);
        const accessibleProjIds = await filterAccessibleProjectIds(
          ctx.supabase,
          allProjIds,
          ctx.user.id,
        );
        if (accessibleProjIds.length === 0)
          return { interviews: [], nextCursor: undefined };
        query = query.in("projectId", accessibleProjIds);
      }

      if (input?.cursor) {
        const { data: cursorRow } = await ctx.supabase
          .from("interviews")
          .select("updatedAt")
          .eq("id", input.cursor)
          .single();
        if (cursorRow) {
          query = query.lte("updatedAt", cursorRow.updatedAt);
        }
      }

      const { data: raw } = await query;
      const rows = raw ?? [];

      const interviews = rows.slice(0, limit).map((i) => ({
        ...i,
        _count: {
          questions: (i.questions as { id: string }[])?.length ?? 0,
          sessions: (i.sessions as { id: string }[])?.length ?? 0,
        },
        questions: undefined,
        sessions: undefined,
      }));

      let nextCursor: string | undefined;
      if (rows.length > limit) {
        nextCursor = rows[limit - 1].id;
      }

      return { interviews, nextCursor };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await getInterviewWithAccess(
        ctx.supabase,
        input.id,
        ctx.user.id,
      );

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Interview not found",
        });
      }

      // Re-fetch with full data
      const { data: interview } = await ctx.supabase
        .from("interviews")
        .select("*, questions(*), sessions(id)")
        .eq("id", input.id)
        .order("order", { referencedTable: "questions", ascending: true })
        .single();

      if (!interview) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return {
        ...interview,
        _count: {
          sessions: (interview.sessions as { id: string }[])?.length ?? 0,
        },
      };
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: interview } = await ctx.supabase
        .from("interviews")
        .select("*, questions(*)")
        .eq("publicSlug", input.slug)
        .eq("isActive", true)
        .order("order", { referencedTable: "questions", ascending: true })
        .single();

      if (!interview) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Interview not found",
        });
      }

      return interview;
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        objective: z.string().optional(),
        assessmentCriteria: z
          .array(z.object({ name: z.string(), description: z.string() }))
          .optional(),
        chatEnabled: z.boolean().default(true),
        voiceEnabled: z.boolean().default(false),
        videoEnabled: z.boolean().default(false),
        aiName: z.string().default("Aural"),
        aiTone: z
          .enum(["CASUAL", "PROFESSIONAL", "FORMAL", "FRIENDLY"])
          .default("PROFESSIONAL"),
        followUpDepth: z
          .enum(["LIGHT", "MODERATE", "DEEP"])
          .default("MODERATE"),
        language: z.string().default("en"),
        timeLimitMinutes: z.number().int().min(1).optional(),
        llmProvider: z.string().optional(),
        llmModel: z.string().optional(),
        antiCheatingEnabled: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let projectId = input.projectId;

      if (!projectId) {
        // Auto-resolve: pick the user's first org's first project
        const { data: membership } = await ctx.supabase
          .from("organization_members")
          .select("workspaceId")
          .eq("userId", ctx.user.id)
          .limit(1)
          .single();

        if (!membership) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "No organization found",
          });
        }

        const { data: defaultProject } = await ctx.supabase
          .from("projects")
          .select("id")
          .eq("organizationId", membership.workspaceId)
          .order("createdAt", { ascending: true })
          .limit(1)
          .single();

        if (!defaultProject) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No project found. Create a project first.",
          });
        }

        projectId = defaultProject.id;
      }

      const { data: project } = await ctx.supabase
        .from("projects")
        .select("id, organizationId")
        .eq("id", projectId)
        .single();

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      const membership = await getOrgMembership(
        ctx.supabase,
        project.organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this organization",
        });
      }

      const projAccess = await hasProjectAccess(
        ctx.supabase,
        project.id,
        ctx.user.id,
      );
      if (!projAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this project",
        });
      }

      const effectiveRole = await getEffectiveProjectRole(
        ctx.supabase,
        project.id,
        ctx.user.id,
        membership.role,
      );
      assertMinRole(effectiveRole, "MEMBER");


      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { projectId: _pid, ...rest } = input;
      const { data: interview, error } = await ctx.supabase
        .from("interviews")
        .insert({
          ...rest,
          projectId,
          userId: ctx.user.id,
          requireInvite: true,
        })
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return interview;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        objective: z.string().optional(),
        assessmentCriteria: z
          .array(z.object({ name: z.string(), description: z.string() }))
          .optional(),
        chatEnabled: z.boolean().optional(),
        voiceEnabled: z.boolean().optional(),
        videoEnabled: z.boolean().optional(),
        aiPersona: z.string().optional(),
        aiName: z.string().optional(),
        aiTone: z
          .enum(["CASUAL", "PROFESSIONAL", "FORMAL", "FRIENDLY"])
          .optional(),
        followUpDepth: z.enum(["LIGHT", "MODERATE", "DEEP"]).optional(),
        language: z.string().optional(),
        llmProvider: z.string().optional(),
        llmModel: z.string().optional(),
        isActive: z.boolean().optional(),
        timeLimitMinutes: z.number().nullable().optional(),
        customBranding: z.any().optional(),
        requireInvite: z.boolean().optional(),
        invitedEmails: z.array(z.string().email()).optional(),
        antiCheatingEnabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await getInterviewWithAccess(
        ctx.supabase,
        input.id,
        ctx.user.id,
      );
      if (!result) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (result.role === "MEMBER" && result.interview.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "You can only edit interviews you created. Ask an admin for broader access.",
        });
      }
      assertMinRole(result.role, "MEMBER");

      const { id, ...data } = input;
      const { data: interview, error } = await ctx.supabase
        .from("interviews")
        .update(data)
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw new TRPCError({
          code:
            error.code === "PGRST116" ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return interview;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await getInterviewWithAccess(
        ctx.supabase,
        input.id,
        ctx.user.id,
      );
      if (!result) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (result.role === "MEMBER") {
        if (result.interview.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "You can only delete interviews you created. Ask an admin for broader access.",
          });
        }
        const { count } = await ctx.supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .eq("interviewId", input.id)
          .in("status", ["IN_PROGRESS", "COMPLETED"]);

        if ((count ?? 0) > 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Cannot delete an interview with active or completed sessions. Contact an admin.",
          });
        }
      } else {
        assertMinRole(result.role, "MEMBER");
      }

      await ctx.supabase.from("interviews").delete().eq("id", input.id);
      return { success: true };
    }),

  deleteMany: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      await Promise.all(
        input.ids.map(async (id) => {
          const result = await getInterviewWithAccess(
            ctx.supabase,
            id,
            ctx.user.id,
          );
          if (!result) {
            throw new TRPCError({ code: "NOT_FOUND" });
          }
          if (
            result.role === "MEMBER" &&
            result.interview.userId !== ctx.user.id
          ) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message:
                "You can only delete interviews you created. Ask an admin for broader access.",
            });
          }
          assertMinRole(result.role, "MEMBER");
        }),
      );

      await ctx.supabase.from("interviews").delete().in("id", input.ids);
      return { success: true, count: input.ids.length };
    }),

  publish: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await getInterviewWithAccess(
        ctx.supabase,
        input.id,
        ctx.user.id,
      );
      if (!result) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      assertMinRole(result.role, "MEMBER");

      const slug = result.interview.publicSlug ?? nanoid(10);

      await ctx.supabase
        .from("interviews")
        .update({ publicSlug: slug, isActive: true })
        .eq("id", input.id);

      return { slug };
    }),

  unpublish: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await getInterviewWithAccess(
        ctx.supabase,
        input.id,
        ctx.user.id,
      );
      if (!result) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      assertMinRole(result.role, "MEMBER");

      await ctx.supabase
        .from("interviews")
        .update({ isActive: false })
        .eq("id", input.id);

      return { success: true };
    }),

  duplicate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await getInterviewWithAccess(
        ctx.supabase,
        input.id,
        ctx.user.id,
      );
      if (!result) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      assertMinRole(result.role, "MEMBER");

      const source = result.interview;
      const sourceQuestions = ((
        await ctx.supabase
          .from("questions")
          .select("*")
          .eq("interviewId", source.id)
          .order("order", { ascending: true })
      ).data ?? []) as Array<{
        order: number;
        text: string;
        description: string | null;
        type: string;
        options: unknown;
        starterCode: unknown;
        validationRules: unknown;
        followUpPrompts: unknown;
        probeOnShort: boolean;
        probeThreshold: number | null;
        showIf: unknown;
        skipIf: unknown;
        timeLimitSeconds: number | null;
        isRequired: boolean;
        allowFileUpload: boolean;
        allowedFileTypes: string[];
      }>;

      const { data: newInterview, error } = await ctx.supabase
        .from("interviews")
        .insert({
          title: `${source.title} (Copy)`,
          description: source.description,
          objective: source.objective,
          assessmentCriteria: source.assessmentCriteria,
          chatEnabled: source.chatEnabled,
          voiceEnabled: source.voiceEnabled,
          videoEnabled: source.videoEnabled,
          userId: ctx.user.id,
          projectId: source.projectId,
          aiPersona: source.aiPersona,
          aiName: source.aiName,
          aiTone: source.aiTone,
          followUpDepth: source.followUpDepth,
          language: source.language,
          llmProvider: source.llmProvider,
          llmModel: source.llmModel,
          isActive: false,
          timeLimitMinutes: source.timeLimitMinutes,
          customBranding: source.customBranding,
          publicSlug: null,
          requireInvite: source.requireInvite,
          invitedEmails: source.invitedEmails,
          antiCheatingEnabled: source.antiCheatingEnabled,
        })
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      if (sourceQuestions.length > 0) {
        await ctx.supabase.from("questions").insert(
          sourceQuestions.map((q) => ({
            interviewId: newInterview.id,
            order: q.order,
            text: q.text,
            description: q.description,
            type: q.type,
            options: q.options,
            starterCode: q.starterCode,
            validationRules: q.validationRules,
            followUpPrompts: q.followUpPrompts,
            probeOnShort: q.probeOnShort,
            probeThreshold: q.probeThreshold,
            showIf: q.showIf,
            skipIf: q.skipIf,
            timeLimitSeconds: q.timeLimitSeconds,
            isRequired: q.isRequired,
            allowFileUpload: q.allowFileUpload,
            allowedFileTypes: q.allowedFileTypes,
          })),
        );
      }

      const { data: result2 } = await ctx.supabase
        .from("interviews")
        .select("*, questions(*)")
        .eq("id", newInterview.id)
        .order("order", { referencedTable: "questions", ascending: true })
        .single();

      return result2;
    }),

  stats: protectedProcedure
    .input(
      z
        .object({
          organizationId: z.string().optional(),
          projectId: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // Get all org IDs for the user
      const { data: memberships } = await ctx.supabase
        .from("organization_members")
        .select("workspaceId")
        .eq("userId", ctx.user.id);

      let orgIds = (memberships ?? []).map(
        (m: { workspaceId: string }) => m.workspaceId,
      );

      if (input?.organizationId) {
        if (!orgIds.includes(input.organizationId)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not a member of this organization",
          });
        }
        orgIds = [input.organizationId];
      }

      if (orgIds.length === 0) {
        return {
          totalInterviews: 0,
          totalSessions: 0,
          recentSessions: 0,
          completionRate: 0,
        };
      }

      let projectIds: string[];
      if (input?.projectId) {
        const projAccess = await hasProjectAccess(
          ctx.supabase,
          input.projectId,
          ctx.user.id,
        );
        projectIds = projAccess ? [input.projectId] : [];
      } else {
        const { data: projects } = await ctx.supabase
          .from("projects")
          .select("id")
          .in("organizationId", orgIds);
        const allProjIds = (projects ?? []).map((p: { id: string }) => p.id);
        projectIds = await filterAccessibleProjectIds(
          ctx.supabase,
          allProjIds,
          ctx.user.id,
        );
      }
      if (projectIds.length === 0) {
        return {
          totalInterviews: 0,
          totalSessions: 0,
          recentSessions: 0,
          completionRate: 0,
        };
      }

      const { data: userInterviews } = await ctx.supabase
        .from("interviews")
        .select("id")
        .in("projectId", projectIds);

      const interviewIds = (userInterviews ?? []).map(
        (i: { id: string }) => i.id,
      );

      let totalSessions = 0;
      let recentSessions = 0;
      let completedSessions = 0;

      if (interviewIds.length > 0) {
        const { count: total } = await ctx.supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .in("interviewId", interviewIds);

        const { count: recent } = await ctx.supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .in("interviewId", interviewIds)
          .gte(
            "createdAt",
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          );

        const { count: completed } = await ctx.supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .in("interviewId", interviewIds)
          .eq("status", "COMPLETED");

        totalSessions = total ?? 0;
        recentSessions = recent ?? 0;
        completedSessions = completed ?? 0;
      }

      const completionRate =
        totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0;

      return {
        totalInterviews: interviewIds.length,
        totalSessions,
        recentSessions,
        completionRate: Math.round(completionRate),
      };
    }),

  dashboardStats: protectedProcedure
    .input(z.object({ projectId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { data: memberships } = await ctx.supabase
        .from("organization_members")
        .select("workspaceId")
        .eq("userId", ctx.user.id);

      const orgIds = (memberships ?? []).map(
        (m: { workspaceId: string }) => m.workspaceId,
      );
      if (orgIds.length === 0) return emptyDashboard();

      let projectIds: string[];
      if (input?.projectId) {
        const ok = await hasProjectAccess(
          ctx.supabase,
          input.projectId,
          ctx.user.id,
        );
        projectIds = ok ? [input.projectId] : [];
      } else {
        const { data: projects } = await ctx.supabase
          .from("projects")
          .select("id")
          .in("organizationId", orgIds);
        const allProjIds = (projects ?? []).map((p: { id: string }) => p.id);
        projectIds = await filterAccessibleProjectIds(
          ctx.supabase,
          allProjIds,
          ctx.user.id,
        );
      }
      if (projectIds.length === 0) return emptyDashboard();

      const { data: interviews } = await ctx.supabase
        .from("interviews")
        .select("id, createdAt")
        .in("projectId", projectIds);
      const interviewIds = (interviews ?? []).map((i: { id: string }) => i.id);
      if (interviewIds.length === 0) return emptyDashboard();

      const { count: totalQuestions } = await ctx.supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .in("interviewId", interviewIds);

      const { data: sessions } = await ctx.supabase
        .from("sessions")
        .select(
          "id, interviewId, status, modeUsed, totalDurationSeconds, themes, createdAt, participantName, participantEmail, insights",
        )
        .in("interviewId", interviewIds);
      const allSessions = sessions ?? [];

      const { data: questionRows } = await ctx.supabase
        .from("questions")
        .select("id, type, createdAt")
        .in("interviewId", interviewIds);

      // Message counts per session (batch)
      let totalMessages = 0;
      const sessionMsgMap: Record<string, number> = {};
      if (allSessions.length > 0) {
        const sIds = allSessions.map((s) => s.id);
        const { data: msgs } = await ctx.supabase
          .from("messages")
          .select("sessionId")
          .in("sessionId", sIds);
        for (const m of msgs ?? []) {
          sessionMsgMap[m.sessionId] = (sessionMsgMap[m.sessionId] ?? 0) + 1;
          totalMessages++;
        }
      }

      // Summary numbers
      const totalSessions = allSessions.length;
      const completedSessions = allSessions.filter(
        (s) => s.status === "COMPLETED",
      ).length;
      const completionRate =
        totalSessions > 0
          ? Math.round((completedSessions / totalSessions) * 100)
          : 0;
      const totalDuration = allSessions.reduce(
        (sum, s) => sum + ((s.totalDurationSeconds as number) ?? 0),
        0,
      );
      const avgSessionDuration =
        totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;
      const avgMessagesPerSession =
        totalSessions > 0
          ? Math.round((totalMessages / totalSessions) * 10) / 10
          : 0;

      // Daily time series (last 30 days)
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
      const dateMap: Record<
        string,
        {
          sessions: number;
          sessionMinutes: number;
          messages: number;
          interviews: number;
          questions: number;
        }
      > = {};
      for (
        let d = new Date(thirtyDaysAgo);
        d <= now;
        d.setDate(d.getDate() + 1)
      ) {
        dateMap[d.toISOString().slice(0, 10)] = {
          sessions: 0,
          sessionMinutes: 0,
          messages: 0,
          interviews: 0,
          questions: 0,
        };
      }
      for (const s of allSessions) {
        const day = (s.createdAt as string).slice(0, 10);
        if (dateMap[day]) {
          dateMap[day].sessions++;
          dateMap[day].sessionMinutes += Math.round(
            ((s.totalDurationSeconds as number) ?? 0) / 60,
          );
          dateMap[day].messages += sessionMsgMap[s.id] ?? 0;
        }
      }
      for (const i of interviews ?? []) {
        const day = (i.createdAt as string).slice(0, 10);
        if (dateMap[day]) dateMap[day].interviews++;
      }
      for (const q of questionRows ?? []) {
        const day = (q.createdAt as string).slice(0, 10);
        if (dateMap[day]) dateMap[day].questions++;
      }
      const daily = Object.entries(dateMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v }));

      // Question type breakdown
      const questionTypeBreakdown = {
        OPEN_ENDED: 0,
        SINGLE_CHOICE: 0,
        MULTIPLE_CHOICE: 0,
        CODING: 0,
        WHITEBOARD: 0,
        RESEARCH: 0,
      };
      for (const q of questionRows ?? []) {
        const t = (q.type as string) ?? "OPEN_ENDED";
        if (t in questionTypeBreakdown)
          questionTypeBreakdown[t as keyof typeof questionTypeBreakdown]++;
      }

      // Status breakdown (NOT_STARTED = sessions with no startedAt or status still default)
      const statusBreakdown = { COMPLETED: 0, IN_PROGRESS: 0, NOT_STARTED: 0 };
      for (const s of allSessions) {
        const st = (s.status as string) ?? "IN_PROGRESS";
        if (st === "COMPLETED") statusBreakdown.COMPLETED++;
        else if (st === "IN_PROGRESS") statusBreakdown.IN_PROGRESS++;
        else statusBreakdown.NOT_STARTED++;
      }

      // Top themes
      const themeCounts: Record<string, number> = {};
      for (const s of allSessions) {
        const themes = (s.themes as string[]) ?? [];
        for (const t of themes) {
          if (t) themeCounts[t] = (themeCounts[t] ?? 0) + 1;
        }
      }
      const topThemes = Object.entries(themeCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([theme, count]) => ({ theme, count }));

      // Recent completed sessions
      const recentSessions = [...allSessions]
        .filter((s) => s.status === "COMPLETED")
        .sort((a, b) =>
          (b.createdAt as string).localeCompare(a.createdAt as string),
        )
        .slice(0, 5)
        .map((s) => {
          const score = getSessionOverallScore(
            s.insights as {
              questionEvaluations?: { score: number }[];
              criteriaEvaluations?: { score: number }[];
            } | null,
          );
          return {
            id: s.id,
            interviewId: s.interviewId as string,
            name:
              (s.participantName as string) ||
              (s.participantEmail as string) ||
              "Anonymous",
            status: s.status as string,
            duration: (s.totalDurationSeconds as number) ?? 0,
            messages: sessionMsgMap[s.id] ?? 0,
            date: s.createdAt as string,
            score,
          };
        });

      return {
        totalInterviews: interviewIds.length,
        totalSessions,
        totalQuestions: totalQuestions ?? 0,
        totalDuration,
        totalMessages,
        completionRate,
        avgSessionDuration,
        avgMessagesPerSession,
        daily,
        questionTypeBreakdown,
        statusBreakdown,
        topThemes,
        recentSessions,
      };
    }),
});
