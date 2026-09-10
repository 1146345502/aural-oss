import { z } from "zod";
import { validateApiKey, isAuthError, apiError } from "@/lib/api-key-auth";
import { apiCandidateDetailsSchema } from "@/lib/api-feature-schemas";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertInterviewProjectAccess } from "@/app/api/v1/_lib/interview-access";
import { getOrgMembership, getEffectiveProjectRole, hasMinRole } from "@/server/trpc";

const schema = apiCandidateDetailsSchema.extend({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, "No valid fields to update.");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; candidateId: string }> }) {
  const auth = await validateApiKey(request);
  if (isAuthError(auth)) return auth;
  const { id, candidateId } = await params;
  const access = await assertInterviewProjectAccess(id, auth.projectIds);
  if (access instanceof Response) return access;
  const membership = await getOrgMembership(supabaseAdmin, auth.organizationId, auth.userId);
  if (!membership || !hasMinRole(await getEffectiveProjectRole(supabaseAdmin, access.projectId, auth.userId, membership.role), "MEMBER")) {
    return apiError("FORBIDDEN", "MEMBER role or higher required.", 403);
  }
  let body: unknown;
  try { body = await request.json(); } catch { return apiError("BAD_REQUEST", "Invalid JSON body.", 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]!.message, 400);
  const { data, error } = await supabaseAdmin.from("candidates").update(parsed.data).eq("id", candidateId).eq("interviewId", id).select("*").maybeSingle();
  if (error) return apiError("INTERNAL_ERROR", error.message, 500);
  if (!data) return apiError("NOT_FOUND", "Candidate not found.", 404);
  return Response.json({ data });
}
