import { getAuthUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const log = createLogger("api/prep/leave");

/**
 * POST /api/prep/leave
 * Marks the user as having left an in-progress practice session so duration
 * stops accumulating. Works with fetch keepalive and sendBeacon.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const sessionId = body?.sessionId;
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const { data: session } = await supabaseAdmin
      .from("prep_sessions")
      .select("id, status, userId")
      .eq("id", sessionId)
      .single();

    if (!session || session.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (session.status !== "IN_PROGRESS") {
      return NextResponse.json({ ok: true, alreadyEnded: true });
    }

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("prep_sessions")
      .update({ lastActivityAt: now })
      .eq("id", sessionId);

    log.info(`Prep session ${sessionId} leave recorded`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
