import { validateApiKey, isAuthError, apiError } from "@/lib/api-key-auth";
import { prepRouter } from "@/server/routers/prep";
import { assertInterviewProjectAccess } from "@/app/api/v1/_lib/interview-access";
import { apiCallerContext, apiCallerError } from "@/app/api/v1/_lib/caller-context";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await validateApiKey(request);
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  const access = await assertInterviewProjectAccess(id, auth.projectIds);
  if (access instanceof Response) return access;
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return apiError("BAD_REQUEST", "limit must be between 1 and 500.", 400);
  try {
    const caller = prepRouter.createCaller(await apiCallerContext(auth));
    const result = await caller.listSessions({ interviewId: id, limit });
    return Response.json({ data: result.sessions });
  } catch (error) { return apiCallerError(error); }
}
