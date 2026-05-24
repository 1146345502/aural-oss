import { isAbortError } from "@/lib/abort-error";
import { createLogger } from "@/lib/logger";
import { prepareCoachTtsText, splitCoachTtsSegments } from "@/lib/prep/coach-tts-text";
import {
    synthesizeFull,
    type TtsAuthConfig,
    type TtsSynthesisOptions,
} from "../../../../../server/volcengine-tts";

const log = createLogger("api/voice/tts-s2s");

export type CoachTtsWireFormat = "pcm" | "mp3";

export type CoachTtsResult = {
  audio: Buffer;
  wireFormat: CoachTtsWireFormat;
};

export async function synthesizeCoachAudio(
  rawText: string,
  auth: TtsAuthConfig,
  buildOptions: (format: TtsSynthesisOptions["format"]) => TtsSynthesisOptions,
  signal?: AbortSignal,
): Promise<CoachTtsResult | null> {
  const text = prepareCoachTtsText(rawText);
  if (!text) return null;

  // Prefer MP3 — provider often returns MPEG even for pcm_* requests; browsers decode MP3 reliably.
  const formats: TtsSynthesisOptions["format"][] = ["mp3", "pcm_s16le", "pcm"];

  for (const format of formats) {
    if (signal?.aborted) return null;
    try {
      const audio = await synthesizeFull(text, auth, buildOptions(format), signal);
      if (audio.byteLength > 0) {
        return { audio, wireFormat: format === "mp3" ? "mp3" : "pcm" };
      }
      log.warn(`Seed TTS empty for format=${format} (${text.length} chars)`);
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) return null;
      throw err;
    }
  }

  const segments = splitCoachTtsSegments(text);
  if (segments.length > 1) {
    const parts: Buffer[] = [];
    for (const segment of segments) {
      if (signal?.aborted) break;
      try {
        const audio = await synthesizeFull(
          segment,
          auth,
          buildOptions("mp3"),
          signal,
        );
        if (audio.byteLength > 0) parts.push(audio);
      } catch (err) {
        if (signal?.aborted || isAbortError(err)) return null;
        throw err;
      }
    }
    if (parts.length > 0) {
      log.info(`Seed TTS recovered via ${parts.length} segmented pcm_s16le requests`);
      return { audio: Buffer.concat(parts), wireFormat: "pcm" };
    }
  }

  return null;
}
