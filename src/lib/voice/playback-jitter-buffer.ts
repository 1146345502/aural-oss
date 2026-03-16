export const PLAYBACK_SAMPLE_RATE = 24_000;
export const JITTER_BUFFER_TARGET_MS = 120;
export const JITTER_BUFFER_LOW_WATER_MS = 60;
export const JITTER_BUFFER_MAX_WAIT_MS = 180;
export const JITTER_BUFFER_MAX_BATCH_MS = 260;

export interface PlaybackFlushDecision {
  queuedSamples: number;
  bufferedAheadMs: number;
  firstChunkQueuedAtMs: number | null;
  nowMs: number;
  sampleRate?: number;
}

export function samplesToDurationMs(
  sampleCount: number,
  sampleRate = PLAYBACK_SAMPLE_RATE,
): number {
  if (sampleCount <= 0 || sampleRate <= 0) return 0;
  return (sampleCount / sampleRate) * 1000;
}

export function shouldFlushPlaybackQueue({
  queuedSamples,
  bufferedAheadMs,
  firstChunkQueuedAtMs,
  nowMs,
  sampleRate = PLAYBACK_SAMPLE_RATE,
}: PlaybackFlushDecision): boolean {
  if (queuedSamples <= 0) return false;

  const queuedMs = samplesToDurationMs(queuedSamples, sampleRate);
  const waitMs =
    typeof firstChunkQueuedAtMs === "number"
      ? Math.max(0, nowMs - firstChunkQueuedAtMs)
      : 0;

  if (queuedMs >= JITTER_BUFFER_MAX_BATCH_MS) return true;
  if (bufferedAheadMs <= JITTER_BUFFER_LOW_WATER_MS && queuedMs >= JITTER_BUFFER_TARGET_MS) {
    return true;
  }
  if (waitMs >= JITTER_BUFFER_MAX_WAIT_MS) return true;

  return false;
}
