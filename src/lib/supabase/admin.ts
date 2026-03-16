import { createClient } from "@supabase/supabase-js";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

async function fetchWithRetry(
  url: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Admin Supabase client using the service_role key.
 * Bypasses RLS — use only in server-side code (tRPC routers, API routes).
 *
 * Note: The Database generic is intentionally omitted to avoid `never` types
 * on relation joins (our manual types don't define Relationships yet).
 * Regenerate types with `npm run db:types` after schema changes for full safety.
 */
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: fetchWithRetry,
    },
  },
);
