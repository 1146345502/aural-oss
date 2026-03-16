import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { nanoid } from "@/lib/id";
import { TRPCError } from "@trpc/server";

export const apiKeyRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from("api_keys")
      .select("id, name, key, isActive, lastUsedAt, expiresAt, createdAt")
      .eq("userId", ctx.user.id)
      .order("createdAt", { ascending: false });
    return data ?? [];
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        expiresAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const key = `dlv_${nanoid(32)}`;

      const { data: apiKey, error } = await ctx.supabase
        .from("api_keys")
        .insert({
          userId: ctx.user.id,
          name: input.name,
          key,
          expiresAt: input.expiresAt ?? null,
        })
        .select("id, key")
        .single();

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return apiKey;
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: existing } = await ctx.supabase
        .from("api_keys")
        .select("id")
        .eq("id", input.id)
        .eq("userId", ctx.user.id)
        .single();

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await ctx.supabase
        .from("api_keys")
        .update({ isActive: false })
        .eq("id", input.id);

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.supabase
        .from("api_keys")
        .delete()
        .eq("id", input.id)
        .eq("userId", ctx.user.id);
      return { success: true };
    }),
});
