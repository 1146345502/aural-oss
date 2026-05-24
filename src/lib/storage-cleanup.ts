import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";

const log = createLogger("storage-cleanup");

export { RETENTION_DAYS } from "@/lib/retention-days";

/**
 * Delete all storage objects under a session folder in the given bucket.
 * Uses the Supabase Storage API so both metadata and backing files are removed.
 */
export async function deleteSessionStorageFolder(
  bucket: string,
  sessionId: string,
): Promise<number> {
  const { data: files } = await supabaseAdmin.storage
    .from(bucket)
    .list(sessionId, { limit: 1000 });

  if (!files || files.length === 0) return 0;

  const paths = files.map((f) => `${sessionId}/${f.name}`);
  const { error } = await supabaseAdmin.storage.from(bucket).remove(paths);
  if (error) {
    log.error(`Failed to remove files from ${bucket}/${sessionId}:`, error);
    return 0;
  }
  return paths.length;
}

/**
 * Delete segment (flush) files for a session from the recordings bucket,
 * leaving the final recording intact.
 */
export async function deleteSessionSegmentFiles(
  sessionId: string,
): Promise<number> {
  const { data: files } = await supabaseAdmin.storage
    .from("recordings")
    .list(sessionId, { limit: 100 });

  if (!files) return 0;

  const segFiles = files
    .filter((f) => f.name.includes("-seg"))
    .map((f) => `${sessionId}/${f.name}`);

  if (segFiles.length === 0) return 0;

  const { error } = await supabaseAdmin.storage
    .from("recordings")
    .remove(segFiles);
  if (error) {
    log.error(`Failed to remove segment files for ${sessionId}:`, error);
    return 0;
  }
  return segFiles.length;
}

/**
 * Remove specific storage objects by path from a bucket.
 */
export async function removeStorageObjects(
  bucket: string,
  paths: string[],
): Promise<number> {
  if (paths.length === 0) return 0;

  const batchSize = 100;
  let removed = 0;
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);
    const { error } = await supabaseAdmin.storage.from(bucket).remove(batch);
    if (error) {
      log.error(`Failed to remove ${batch.length} objects from ${bucket}:`, error);
    } else {
      removed += batch.length;
    }
  }
  return removed;
}
