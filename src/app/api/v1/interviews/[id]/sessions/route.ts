import { assertInterviewProjectAccess } from "@/app/api/v1/_lib/interview-access";
import {
  apiError,
  isAuthError,
  validateApiKey,
} from "@/lib/api-key-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

function parseLimit(raw: string | null): number {
  if (raw === null || raw === "") return 20;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 20;
  return Math.min(100, n);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(request);
  if (isAuthError(auth)) return auth;

  const { id: interviewId } = await params;

  const access = await assertInterviewProjectAccess(interviewId, auth.projectIds);
  if (access instanceof Response) return access;

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const cursor = searchParams.get("cursor");

  let createdAtBefore: string | undefined;
  let idBefore: string | undefined;

  if (cursor) {
    const { data: cur, error: curErr } = await supabaseAdmin
      .from("sessions")
      .select("id, createdAt")
      .eq("id", cursor)
      .eq("interviewId", interviewId)
      .maybeSingle();

    if (curErr || !cur) {
      return apiError("BAD_REQUEST", "Invalid cursor", 400);
    }
    createdAtBefore = cur.createdAt as string;
    idBefore = cur.id as string;
  }

  let query = supabaseAdmin
    .from("sessions")
    .select(
      "id, status, participantName, participantEmail, summary, insights, themes, sentiment, totalDurationSeconds, createdAt, updatedAt, messages(id)",
    )
    .eq("interviewId", interviewId)
    .order("createdAt", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (createdAtBefore && idBefore) {
    query = query.or(
      `createdAt.lt."${createdAtBefore}",and(createdAt.eq."${createdAtBefore}",id.lt."${idBefore}")`,
    );
  }

  const { data: rows, error } = await query;

  if (error) {
    return apiError("INTERNAL_ERROR", error.message, 500);
  }

  const list = rows ?? [];
  const hasMore = list.length > limit;
  const page = hasMore ? list.slice(0, limit) : list;

  const data = page.map((row) => {
    const { messages, ...rest } = row;
    const msgs = messages as { id: string }[] | null;
    return {
      ...rest,
      _count: { messages: msgs?.length ?? 0 },
    };
  });

  const nextCursor =
    hasMore && page.length > 0 ? (page[page.length - 1]!.id as string) : null;

  return Response.json({ data, cursor: nextCursor });
}
