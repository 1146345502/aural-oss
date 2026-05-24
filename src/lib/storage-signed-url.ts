import { supabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;

/** Create a short-lived signed URL for a private storage object. */
export async function resolveStorageSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Resolve a stored value that may be a storage path or legacy signed URL. */
export async function resolveRecordingSignedUrl(
  stored: string,
  bucket = "recordings",
): Promise<string | null> {
  const pathMatch = stored.match(/\/recordings\/(.+?)(?:\?|$)/);
  const path = pathMatch?.[1] ?? stored;
  return resolveStorageSignedUrl(bucket, path);
}
