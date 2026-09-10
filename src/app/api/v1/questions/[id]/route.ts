import { apiQuestionDetailsSchema } from "@/lib/api-feature-schemas";
import {
  apiError,
  isAuthError,
  validateApiKey,
} from "@/lib/api-key-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const QUESTION_TYPES = new Set([
  "OPEN_ENDED",
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "CODING",
  "WHITEBOARD",
  "RESEARCH",
]);

type QuestionWithInterview = {
  id: string;
  interviewId: string;
  interview: { projectId: string | null };
};

async function loadQuestionWithAccess(
  questionId: string,
  projectIds: string[],
): Promise<{ row: QuestionWithInterview } | Response> {
  const { data: row, error } = await supabaseAdmin
    .from("questions")
    .select("*, interview:interviews!inner(projectId)")
    .eq("id", questionId)
    .maybeSingle();

  if (error) {
    return apiError("INTERNAL_ERROR", error.message, 500);
  }
  if (!row) {
    return apiError("NOT_FOUND", "Question not found", 404);
  }

  const interview = row.interview as unknown as { projectId: string | null };
  const projectId = interview?.projectId;
  if (!projectId || !projectIds.includes(projectId)) {
    return apiError("FORBIDDEN", "No access to this question", 403);
  }

  return { row: row as QuestionWithInterview };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(request);
  if (isAuthError(auth)) return auth;

  const { id: questionId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("BAD_REQUEST", "Invalid JSON body", 400);
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return apiError("BAD_REQUEST", "Expected JSON object", 400);
  }

  const raw = body as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  if ("text" in raw) {
    if (typeof raw.text !== "string" || !raw.text.trim()) {
      return apiError("BAD_REQUEST", "text must be a non-empty string", 400);
    }
    update.text = raw.text.trim();
  }

  if ("type" in raw) {
    if (raw.type === null || raw.type === undefined) {
      return apiError("BAD_REQUEST", "type cannot be null", 400);
    }
    const t = String(raw.type);
    if (!QUESTION_TYPES.has(t)) {
      return apiError("BAD_REQUEST", `Invalid question type: ${t}`, 400);
    }
    update.type = t;
  }

  if ("order" in raw) {
    if (raw.order === null || raw.order === undefined) {
      return apiError("BAD_REQUEST", "order cannot be null", 400);
    }
    const n = Number(raw.order);
    if (!Number.isInteger(n) || n < 0) {
      return apiError("BAD_REQUEST", "order must be a non-negative integer", 400);
    }
    update.order = n;
  }

  if ("required" in raw) {
    if (raw.required === null || raw.required === undefined) {
      return apiError("BAD_REQUEST", "required cannot be null", 400);
    }
    update.isRequired = Boolean(raw.required);
  }

  if ("options" in raw) {
    if (raw.options === null) {
      update.options = null;
    } else {
      if (!Array.isArray(raw.options)) {
        return apiError("BAD_REQUEST", "options must be an array of strings or null", 400);
      }
      for (const o of raw.options) {
        if (typeof o !== "string") {
          return apiError("BAD_REQUEST", "options must be an array of strings", 400);
        }
      }
      update.options = raw.options;
    }
  }

  if ("followUpEnabled" in raw) {
    if (raw.followUpEnabled === null || raw.followUpEnabled === undefined) {
      return apiError("BAD_REQUEST", "followUpEnabled cannot be null", 400);
    }
    update.probeOnShort = Boolean(raw.followUpEnabled);
  }

  const details = apiQuestionDetailsSchema.safeParse(raw);
  if (!details.success) return apiError("BAD_REQUEST", details.error.issues[0]!.message, 400);
  Object.assign(update, details.data);

  if (Object.keys(update).length === 0) {
    return apiError("BAD_REQUEST", "No valid fields to update", 400);
  }

  const loaded = await loadQuestionWithAccess(questionId, auth.projectIds);
  if (loaded instanceof Response) return loaded;

  const { data: updated, error } = await supabaseAdmin
    .from("questions")
    .update(update)
    .eq("id", questionId)
    .select("*")
    .single();

  if (error) {
    return apiError("INTERNAL_ERROR", error.message, 500);
  }

  return Response.json({ data: updated });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(request);
  if (isAuthError(auth)) return auth;

  const { id: questionId } = await params;

  const loaded = await loadQuestionWithAccess(questionId, auth.projectIds);
  if (loaded instanceof Response) return loaded;

  const { error } = await supabaseAdmin
    .from("questions")
    .delete()
    .eq("id", questionId);

  if (error) {
    return apiError("INTERNAL_ERROR", error.message, 500);
  }

  return Response.json({ data: { id: questionId, deleted: true } });
}
