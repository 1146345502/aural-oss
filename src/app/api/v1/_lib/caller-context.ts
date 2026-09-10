import { apiError, type ApiKeyAuth } from "@/lib/api-key-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TRPCError } from "@trpc/server";

export async function apiCallerContext(auth: ApiKeyAuth) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(auth.userId);
  if (error || !data.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return { user: data.user, supabase: supabaseAdmin };
}

export function apiCallerError(error: unknown) {
  if (error instanceof TRPCError) {
    const status = { BAD_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409 }[error.code as string];
    return apiError(error.code, error.message, status ?? 500);
  }
  return apiError("INTERNAL_ERROR", "Unable to complete request.", 500);
}
