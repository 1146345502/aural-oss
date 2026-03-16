import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { nanoid } from "@/lib/id";

export const workspaceRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { data: memberships } = await ctx.supabase
      .from("workspace_members")
      .select("role, workspace:workspaces(*, members:workspace_members(id), interviews(id))")
      .eq("userId", ctx.user.id);

    return (memberships ?? []).map((m) => {
      const ws = m.workspace as unknown as {
        id: string;
        name: string;
        slug: string;
        ownerId: string;
        createdAt: string;
        updatedAt: string;
        members: { id: string }[];
        interviews: { id: string }[];
      };
      return {
        ...ws,
        role: m.role,
        _count: {
          members: ws.members?.length ?? 0,
          interviews: ws.interviews?.length ?? 0,
        },
      };
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z
          .string()
          .min(3)
          .regex(/^[a-z0-9-]+$/)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slug = input.slug ?? nanoid(8);

      const { data: workspace, error } = await ctx.supabase
        .from("workspaces")
        .insert({
          name: input.name,
          slug,
          ownerId: ctx.user.id,
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      await ctx.supabase.from("workspace_members").insert({
        workspaceId: workspace.id,
        userId: ctx.user.id,
        role: "OWNER" as const,
      });

      return workspace;
    }),

  addMember: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        email: z.string().email(),
        role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: callerMembership } = await ctx.supabase
        .from("workspace_members")
        .select("role")
        .eq("workspaceId", input.workspaceId)
        .eq("userId", ctx.user.id)
        .single();

      if (!callerMembership || !["OWNER", "ADMIN"].includes(callerMembership.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { data: profile } = await ctx.supabase
        .from("profiles")
        .select("id")
        .eq("email", input.email)
        .single();

      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const { data: member, error } = await ctx.supabase
        .from("workspace_members")
        .insert({
          workspaceId: input.workspaceId,
          userId: profile.id,
          role: input.role,
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return member;
    }),

  removeMember: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: callerMembership } = await ctx.supabase
        .from("workspace_members")
        .select("role")
        .eq("workspaceId", input.workspaceId)
        .eq("userId", ctx.user.id)
        .single();

      if (!callerMembership || !["OWNER", "ADMIN"].includes(callerMembership.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await ctx.supabase
        .from("workspace_members")
        .delete()
        .eq("workspaceId", input.workspaceId)
        .eq("userId", input.userId);

      return { success: true };
    }),
});
