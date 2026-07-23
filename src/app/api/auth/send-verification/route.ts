import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Sends a reauthentication nonce to the current user's email.
 * Uses the server-side Supabase client (with session cookies) to avoid
 * client-side lock/session issues.
 *
 * Triggers the "Reauthentication" email template in Supabase.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { error } = await supabase.auth.reauthenticate();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
