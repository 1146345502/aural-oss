import { validateApiKey, isAuthError, apiError } from "@/lib/api-key-auth";
import { bulkInterviewActionSchema } from "@/lib/api-feature-schemas";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sessionRouter } from "@/server/routers/session";
import { assertMinRole, getEffectiveProjectRole, getOrgMembership } from "@/server/trpc";
import { assertInterviewProjectAccess } from "./interview-access";
import { apiCallerContext, apiCallerError } from "./caller-context";

export async function bulkInterviewAction(request: Request, interviewId: string) {
  const auth = await validateApiKey(request);
  if (isAuthError(auth)) return auth;
  const access = await assertInterviewProjectAccess(interviewId, auth.projectIds);
  if (access instanceof Response) return access;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError("BAD_REQUEST", "Invalid JSON body.", 400); }
  const parsed = bulkInterviewActionSchema.safeParse(body);
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]!.message, 400);
  const { ids, dryRun } = parsed.data;
  try {
    const membership = await getOrgMembership(supabaseAdmin, auth.organizationId, auth.userId);
    if (!membership) return apiError("FORBIDDEN", "Organization membership required.", 403);
    assertMinRole(await getEffectiveProjectRole(supabaseAdmin, access.projectId, auth.userId, membership.role), "MEMBER");
    const ctx = await apiCallerContext(auth);
    const sessions = sessionRouter.createCaller(ctx);
    const results: { id: string; status: "eligible" | "skipped" | "succeeded" | "failed"; reason?: string }[] = [];
    // Re-read each row immediately before acting, including its interview scope.
    for (const id of ids) {
      try {
        const { data: row, error } = await supabaseAdmin.from("sessions")
          .select("id, status").eq("id", id).eq("interviewId", interviewId).maybeSingle();
        if (error) throw error;
        if (!row || row.status !== "IN_PROGRESS") {
          results.push({ id, status: "skipped", reason: "Session not found in interview or not in progress." }); continue;
        }
        if (!dryRun) await sessions.complete({ id });
        results.push({ id, status: dryRun ? "eligible" : "succeeded" });
      } catch (error) {
        results.push({ id, status: "failed", reason: error instanceof Error ? error.message : "Operation failed." });
      }
    }
    return Response.json({ data: { dryRun, results } });
  } catch (error) { return apiCallerError(error); }
}
