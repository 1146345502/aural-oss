import { apiQuestionDetailsSchema } from "@/lib/api-feature-schemas";
import {
  apiError,
  isAuthError,
  validateApiKey,
  type ApiKeyAuth,
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

async function interviewAccessError(
  auth: ApiKeyAuth,
  interviewId: string,
): Promise<Response | null> {
  const { data: row } = await supabaseAdmin
    .from("interviews")
    .select("projectId")
    .eq("id", interviewId)
    .maybeSingle();

  if (!row) {
    return apiError("NOT_FOUND", "Interview not found", 404);
  }
  if (!row.projectId || !auth.projectIds.includes(row.projectId)) {
    return apiError("FORBIDDEN", "No access to this interview", 403);
  }
  return null;
}

type RawQuestionInput = {
  text?: unknown;
  type?: unknown;
  order?: unknown;
  required?: unknown;
  options?: unknown;
  followUpEnabled?: unknown;
};

function parseQuestionInputs(body: unknown): RawQuestionInput[] | Response {
  if (body === null || typeof body !== "object") {
    return apiError("BAD_REQUEST", "Expected JSON object or array", 400);
  }
  const items = Array.isArray(body) ? body : [body];
  if (items.length === 0) {
    return apiError("BAD_REQUEST", "At least one question is required", 400);
  }
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return apiError("BAD_REQUEST", "Each question must be an object", 400);
    }
  }
  return items as RawQuestionInput[];
}

function normalizeOne(
  raw: RawQuestionInput,
  resolvedOrder: number,
):
  | {
      order: number;
      text: string;
      type: string;
      isRequired: boolean;
      options: string[] | null;
      probeOnShort: boolean;
    }
  | Response {
  const text =
    typeof raw.text === "string" ? raw.text.trim() : String(raw.text ?? "");
  if (!text) {
    return apiError("BAD_REQUEST", "Each question must have non-empty text", 400);
  }

  const typeRaw = raw.type;
  const type =
    typeRaw === undefined || typeRaw === null
      ? "OPEN_ENDED"
      : String(typeRaw);
  if (!QUESTION_TYPES.has(type)) {
    return apiError("BAD_REQUEST", `Invalid question type: ${type}`, 400);
  }

  let order = resolvedOrder;
  if (raw.order !== undefined && raw.order !== null) {
    const n = Number(raw.order);
    if (!Number.isInteger(n) || n < 0) {
      return apiError("BAD_REQUEST", "order must be a non-negative integer", 400);
    }
    order = n;
  }

  const isRequired =
    raw.required === undefined || raw.required === null
      ? true
      : Boolean(raw.required);

  let options: string[] | null = null;
  if (raw.options !== undefined && raw.options !== null) {
    if (!Array.isArray(raw.options)) {
      return apiError("BAD_REQUEST", "options must be an array of strings", 400);
    }
    for (const o of raw.options) {
      if (typeof o !== "string") {
        return apiError("BAD_REQUEST", "options must be an array of strings", 400);
      }
    }
    options = raw.options as string[];
  }

  const probeOnShort =
    raw.followUpEnabled === undefined || raw.followUpEnabled === null
      ? true
      : Boolean(raw.followUpEnabled);

  const details = apiQuestionDetailsSchema.safeParse(raw);
  if (!details.success) return apiError("BAD_REQUEST", details.error.issues[0]!.message, 400);
  return { ...details.data, order, text, type, isRequired, options, probeOnShort };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(request);
  if (isAuthError(auth)) return auth;

  const { id: interviewId } = await params;

  const denied = await interviewAccessError(auth, interviewId);
  if (denied) return denied;

  const { data, error } = await supabaseAdmin
    .from("questions")
    .select("*")
    .eq("interviewId", interviewId)
    .order("order", { ascending: true });

  if (error) {
    return apiError("INTERNAL_ERROR", error.message, 500);
  }

  return Response.json({ data: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(request);
  if (isAuthError(auth)) return auth;

  const { id: interviewId } = await params;

  const denied = await interviewAccessError(auth, interviewId);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("BAD_REQUEST", "Invalid JSON body", 400);
  }

  const parsed = parseQuestionInputs(body);
  if (parsed instanceof Response) return parsed;

  const { data: maxRow } = await supabaseAdmin
    .from("questions")
    .select("order")
    .eq("interviewId", interviewId)
    .order("order", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextOrder = (maxRow?.order ?? -1) + 1;
  const rows: Array<{
    interviewId: string;
    order: number;
    text: string;
    type: string;
    isRequired: boolean;
    options: string[] | null;
    probeOnShort: boolean;
  }> = [];

  for (const raw of parsed) {
    const normalized = normalizeOne(raw, nextOrder);
    if (normalized instanceof Response) return normalized;
    rows.push({ ...normalized, interviewId });
    if (raw.order === undefined || raw.order === null) {
      nextOrder = normalized.order + 1;
    } else {
      nextOrder = Math.max(nextOrder, normalized.order + 1);
    }
  }

  const { data: created, error } = await supabaseAdmin
    .from("questions")
    .insert(rows)
    .select("*");

  if (error) {
    return apiError("INTERNAL_ERROR", error.message, 500);
  }

  return Response.json({ data: created ?? [] });
}
