import { createLogger } from "@/lib/logger";
import { prepAnswerAudioStoragePath } from "@/lib/prep/answer-audio";
import { resolveStorageSignedUrl } from "@/lib/storage-signed-url";
import { supabaseAdmin } from "@/lib/supabase/admin";

const log = createLogger("prep/upload-answer-audio");

export const PREP_ANSWER_AUDIO_BUCKET = "recordings";

export { prepAnswerAudioStoragePath } from "@/lib/prep/answer-audio";

export async function uploadPrepAnswerAudio(
  sessionId: string,
  attemptId: string,
  audio: { mimeType: string; base64: string },
): Promise<string | null> {
  const storagePath = prepAnswerAudioStoragePath(
    sessionId,
    attemptId,
    audio.mimeType,
  );
  const buffer = Buffer.from(audio.base64, "base64");
  const contentType =
    audio.mimeType.trim() ||
    (storagePath.endsWith(".m4a") ? "audio/mp4" : "audio/webm");

  const { error: uploadError } = await supabaseAdmin.storage
    .from(PREP_ANSWER_AUDIO_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    log.error("Prep answer audio upload failed:", uploadError);
    return null;
  }

  return storagePath;
}

export async function resolvePrepAnswerAudioUrl(
  storedPath: string | null | undefined,
): Promise<string | null> {
  if (!storedPath?.trim()) return null;
  return resolveStorageSignedUrl(PREP_ANSWER_AUDIO_BUCKET, storedPath.trim());
}
