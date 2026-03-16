import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { getOrgMembership, assertMinRole, filterAccessibleProjectIds } from "../trpc";

export const projectRouter = router({
  list: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await getOrgMembership(
        ctx.supabase,
        input.organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { data: allProjects } = await ctx.supabase
        .from("projects")
        .select("*, interviews(id, sessions(id))")
        .eq("organizationId", input.organizationId)
        .order("createdAt", { ascending: true });

      const allProjIds = (allProjects ?? []).map((p) => p.id as string);
      const accessibleIds = await filterAccessibleProjectIds(
        ctx.supabase,
        allProjIds,
        ctx.user.id,
      );
      const accessibleSet = new Set(accessibleIds);
      const projects = (allProjects ?? []).filter((p) => accessibleSet.has(p.id));

      return projects.map((p) => {
        const interviews = (p.interviews ?? []) as { id: string; sessions: { id: string }[] }[];
        const sessionCount = interviews.reduce(
          (sum, iv) => sum + (iv.sessions?.length ?? 0),
          0,
        );
        return {
          ...p,
          _count: {
            interviews: interviews.length,
            sessions: sessionCount,
          },
          interviews: undefined,
        };
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: project } = await ctx.supabase
        .from("projects")
        .select("*, interviews(id)")
        .eq("id", input.id)
        .single();

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const membership = await getOrgMembership(
        ctx.supabase,
        project.organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return {
        ...project,
        role: membership.role,
        _count: {
          interviews: (project.interviews as { id: string }[])?.length ?? 0,
        },
        interviews: undefined,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await getOrgMembership(
        ctx.supabase,
        input.organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      assertMinRole(membership.role, "ADMIN");

      const { data: project, error } = await ctx.supabase
        .from("projects")
        .insert({
          organizationId: input.organizationId,
          name: input.name,
          description: input.description,
          createdBy: ctx.user.id,
        })
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return project;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: project } = await ctx.supabase
        .from("projects")
        .select("organizationId")
        .eq("id", input.id)
        .single();

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const membership = await getOrgMembership(
        ctx.supabase,
        project.organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      assertMinRole(membership.role, "ADMIN");

      const { id, ...data } = input;
      const { data: updated, error } = await ctx.supabase
        .from("projects")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: project } = await ctx.supabase
        .from("projects")
        .select("organizationId")
        .eq("id", input.id)
        .single();

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const membership = await getOrgMembership(
        ctx.supabase,
        project.organizationId,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      assertMinRole(membership.role, "ADMIN");

      await ctx.supabase.from("projects").delete().eq("id", input.id);

      return { success: true };
    }),
});
