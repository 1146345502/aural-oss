import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { nanoid } from "@/lib/id";

export const webhookRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from("webhooks")
      .select("*")
      .eq("userId", ctx.user.id)
      .order("createdAt", { ascending: false });
    return data ?? [];
  }),

  create: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
        events: z.array(z.string()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: webhook, error } = await ctx.supabase
        .from("webhooks")
        .insert({
          userId: ctx.user.id,
          url: input.url,
          events: input.events,
          secret: nanoid(32),
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return webhook;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        url: z.string().url().optional(),
        events: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const { data: existing } = await ctx.supabase
        .from("webhooks")
        .select("id")
        .eq("id", id)
        .eq("userId", ctx.user.id)
        .single();

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { data: webhook } = await ctx.supabase
        .from("webhooks")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      return webhook;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.supabase
        .from("webhooks")
        .delete()
        .eq("id", input.id)
        .eq("userId", ctx.user.id);
      return { success: true };
    }),
});
