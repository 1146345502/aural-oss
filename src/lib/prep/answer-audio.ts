/** Max decoded audio bytes accepted by prep feedback API (~2 min webm at typical bitrate). */
export const PREP_ANSWER_AUDIO_MAX_BYTES = 4 * 1024 * 1024;

export function estimateBase64DecodedBytes(base64: string): number {
  const normalized = base64.replace(/\s/g, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

export function isPrepAnswerAudioWithinLimit(base64: string): boolean {
  return estimateBase64DecodedBytes(base64) <= PREP_ANSWER_AUDIO_MAX_BYTES;
}

export function prepAnswerAudioStoragePath(
  sessionId: string,
  attemptId: string,
  mimeType: string,
): string {
  const ext =
    mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : "webm";
  return `prep/${sessionId}/${attemptId}.${ext}`;
}

/** Format seconds as a compact label, e.g. 14s. */
export function formatPrepAudioDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${total}s`;
}

/** Read encoded duration from a blob (matches HTML audio element metadata). */
export function resolveBlobDuration(blob: Blob): Promise<number | undefined> {
  if (typeof window === "undefined") {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(undefined);
      }
    }, 5000);

    function cleanup() {
      clearTimeout(timeout);
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
    }

    function finish(duration: number) {
      if (resolved || !Number.isFinite(duration) || duration <= 0) return;
      resolved = true;
      cleanup();
      resolve(Math.floor(duration));
    }

    audio.addEventListener("durationchange", () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        finish(audio.duration);
      }
    });

    audio.addEventListener("loadedmetadata", () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        finish(audio.duration);
      } else {
        audio.currentTime = 1e10;
      }
    });

    audio.preload = "auto";
    audio.src = url;
  });
}

/** Browser-only: encode answer recording for prep feedback API. */
export async function prepAnswerBlobToBase64(
  blob: Blob,
): Promise<{ base64: string; mimeType: string } | null> {
  if (typeof window === "undefined" || !blob.size) return null;
  if (blob.size > PREP_ANSWER_AUDIO_MAX_BYTES) return null;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        resolve(null);
        return;
      }
      const comma = dataUrl.indexOf(",");
      if (comma < 0) {
        resolve(null);
        return;
      }
      const header = dataUrl.slice(0, comma);
      const base64 = dataUrl.slice(comma + 1);
      const mimeMatch = header.match(/^data:([^;]+);base64$/);
      resolve({
        base64,
        mimeType: mimeMatch?.[1] || blob.type || "audio/webm",
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
