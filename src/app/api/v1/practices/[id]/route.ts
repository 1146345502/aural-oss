import { validateApiKey, isAuthError, apiError } from "@/lib/api-key-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { prepRouter } from "@/server/routers/prep";
import { assertInterviewProjectAccess } from "@/app/api/v1/_lib/interview-access";
import { apiCallerContext, apiCallerError } from "@/app/api/v1/_lib/caller-context";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await validateApiKey(request);
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  const { data: row, error } = await supabaseAdmin.from("prep_sessions").select("interviewId").eq("id", id).eq("userId", auth.userId).maybeSingle();
  if (error) return apiError("INTERNAL_ERROR", error.message, 500);
  if (!row) return apiError("NOT_FOUND", "Practice not found.", 404);
  const access = await assertInterviewProjectAccess(row.interviewId, auth.projectIds);
  if (access instanceof Response) return access;
  try {
    const caller = prepRouter.createCaller(await apiCallerContext(auth));
    return Response.json({ data: await caller.getSessionReport({ sessionId: id }) });
  } catch (error) { return apiCallerError(error); }
}
