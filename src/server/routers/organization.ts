import { nanoid } from "@/lib/id";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertMinRole, getOrgMembership, protectedProcedure, router } from "../trpc";

const MAX_ORGS_PER_ACCOUNT = 10;

export const organizationRouter = router({
  orgLimit: protectedProcedure.query(async () => {
    return { limit: MAX_ORGS_PER_ACCOUNT };
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const { data: memberships } = await ctx.supabase
      .from("organization_members")
      .select(
        "role, workspace:organizations(id, name, slug, ownerId, createdAt, updatedAt)",
      )
      .eq("userId", ctx.user.id);

    return (memberships ?? []).map((m) => {
      const org = m.workspace as unknown as {
        id: string;
        name: string;
        slug: string;
        ownerId: string;
        createdAt: string;
        updatedAt: string;
      };
      return { ...org, role: m.role as string };
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await getOrgMembership(
        ctx.supabase,
        input.id,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      const { data: org } = await ctx.supabase
        .from("organizations")
        .select("*")
        .eq("id", input.id)
        .single();

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { count: memberCount } = await ctx.supabase
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("workspaceId", input.id);

      const { count: projectCount } = await ctx.supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("organizationId", input.id);

      return {
        ...org,
        role: membership.role,
        _count: {
          members: memberCount ?? 0,
          projects: projectCount ?? 0,
        },
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        slug: z
          .string()
          .min(3)
          .max(50)
          .regex(/^[a-z0-9-]+$/)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { count: ownedCount } = await ctx.supabase
        .from("organizations")
        .select("*", { count: "exact", head: true })
        .eq("ownerId", ctx.user.id);

      if ((ownedCount ?? 0) >= MAX_ORGS_PER_ACCOUNT) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You have reached the maximum of ${MAX_ORGS_PER_ACCOUNT} organizations per account.`,
        });
      }

      const slug = input.slug ?? nanoid(8);

      const { data: org, error } = await ctx.supabase
        .from("organizations")
        .insert({
          name: input.name,
          slug,
          ownerId: ctx.user.id,
        })
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      await ctx.supabase.from("organization_members").insert({
        workspaceId: org.id,
        userId: ctx.user.id,
        role: "OWNER" as const,
      });

      // Auto-create default project
      await ctx.supabase.from("projects").insert({
        organizationId: org.id,
        name: "Default",
        createdBy: ctx.user.id,
      });

      return org;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await getOrgMembership(
        ctx.supabase,
        input.id,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      assertMinRole(membership.role, "ADMIN");

      const { id, ...data } = input;
      const { data: org, error } = await ctx.supabase
        .from("organizations")
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

      return org;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await getOrgMembership(
        ctx.supabase,
        input.id,
        ctx.user.id,
      );
      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      assertMinRole(membership.role, "OWNER");

      await ctx.supabase.from("organizations").delete().eq("id", input.id);

      return { success: true };
    }),
});
