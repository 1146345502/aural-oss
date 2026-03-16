import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

/**
 * Server-side helper to get the authenticated user.
 * Use in Server Components, Route Handlers, and Server Actions.
 * Supports cookie-based auth (web) and Bearer token auth (mobile).
 */
export async function getAuthUser() {
  // 1. Try cookie-based auth (web)
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return user;
  } catch {
    // Cookie auth failed (expected for mobile requests)
  }

  // 2. Try Bearer token auth (mobile)
  try {
    const reqHeaders = headers();
    const authHeader = reqHeaders.get("authorization") ?? reqHeaders.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error) {
        console.error("[getAuthUser] Bearer token validation failed:", error.message);
      }
      if (data?.user) return data.user;
    }
  } catch (e) {
    console.error("[getAuthUser] Bearer auth error:", e);
  }

  return null;
}
