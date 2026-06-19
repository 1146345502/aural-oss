import type { PrepVoiceTimelineSegment } from "@/components/prep/prep-types";

/** Aggregate delivery-timeline stats for one recorded answer. */
export type VoiceTimelineAnalysis = {
  segments: PrepVoiceTimelineSegment[];
  pauseCount: number;
  longestPauseSec: number;
  fillerCount: number;
};

const FRAME_SECONDS = 0.05;
const MIN_PAUSE_SECONDS = 0.6;
const MIN_SEGMENTS = 6;
const MAX_SEGMENTS = 16;
const TARGET_SEGMENT_SECONDS = 2.5;

const LATIN_FILLERS = new Set([
  "um",
  "uh",
  "uhm",
  "erm",
  "hmm",
  "like",
  "basically",
  "actually",
  "literally",
]);

const LATIN_FILLER_PHRASES = ["you know", "sort of", "kind of", "i mean"];

const CJK_FILLERS = ["那个", "这个", "就是说", "就是", "然后", "嗯", "呃", "啊这"];

type SpeakToken = {
  /** 0-based position among all speakable units. */
  index: number;
  filler: boolean;
};

/** Tokenize transcript into speakable units (Latin words + CJK chars), flagging fillers. */
export function tokenizeTranscript(transcript: string): SpeakToken[] {
  const tokens: SpeakToken[] = [];
  const lower = transcript.toLowerCase();

  // Mark filler ranges for multi-word Latin phrases and CJK phrases first.
  const fillerRanges: Array<[number, number]> = [];
  for (const phrase of [...LATIN_FILLER_PHRASES, ...CJK_FILLERS]) {
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(phrase, from);
      if (at === -1) break;
      fillerRanges.push([at, at + phrase.length]);
      from = at + phrase.length;
    }
  }
  const inFillerRange = (start: number, end: number) =>
    fillerRanges.some(([a, b]) => start >= a && end <= b);

  const unitPattern = /([a-zA-Z]+(?:'[a-zA-Z]+)*)|([\u4e00-\u9fff])/g;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = unitPattern.exec(transcript)) !== null) {
    const text = match[0];
    const start = match.index;
    const end = start + text.length;
    const isLatinFiller = Boolean(match[1]) && LATIN_FILLERS.has(text.toLowerCase());
    tokens.push({
      index,
      filler: isLatinFiller || inFillerRange(start, end),
    });
    index += 1;
  }
  return tokens;
}

function frameRms(samples: Float32Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, end - start));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1))),
  );
  return sorted[idx];
}

/**
 * Build a delivery timeline from decoded audio samples + the transcript.
 *
 * All metrics are heuristic: energy comes from per-frame RMS, pauses from
 * silence runs, pace/fillers from distributing transcript units across the
 * speech-active portions of the recording.
 */
export function buildVoiceTimeline(
  samples: Float32Array | null,
  durationSeconds: number,
  transcript: string,
): VoiceTimelineAnalysis {
  const tokens = tokenizeTranscript(transcript);
  const fillerCount = tokens.filter((token) => token.filler).length;

  if (!samples || samples.length === 0 || durationSeconds <= 0.5) {
    return { segments: [], pauseCount: 0, longestPauseSec: 0, fillerCount };
  }

  const frameSize = Math.max(
    16,
    Math.floor(samples.length * (FRAME_SECONDS / durationSeconds)),
  );
  const frameCount = Math.max(1, Math.floor(samples.length / frameSize));
  const frames: number[] = new Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    frames[i] = frameRms(samples, i * frameSize, (i + 1) * frameSize);
  }
  const frameSeconds = durationSeconds / frameCount;

  const sorted = [...frames].sort((a, b) => a - b);
  const noiseFloor = percentile(sorted, 0.2);
  const peak = percentile(sorted, 0.95) || Math.max(...frames, 0.0001);
  const speechThreshold = Math.max(0.008, noiseFloor + 0.15 * (peak - noiseFloor));

  const speechFlags = frames.map((rms) => rms >= speechThreshold);
  const firstSpeech = speechFlags.indexOf(true);
  const lastSpeech = speechFlags.lastIndexOf(true);

  // Pauses: silence runs between speech, long enough to be audible.
  let pauseCount = 0;
  let longestPauseSec = 0;
  if (firstSpeech !== -1) {
    let runStart: number | null = null;
    for (let i = firstSpeech; i <= lastSpeech; i++) {
      if (!speechFlags[i]) {
        if (runStart === null) runStart = i;
      } else if (runStart !== null) {
        const runSec = (i - runStart) * frameSeconds;
        if (runSec >= MIN_PAUSE_SECONDS) {
          pauseCount += 1;
          longestPauseSec = Math.max(longestPauseSec, runSec);
        }
        runStart = null;
      }
    }
  }

  // Map each transcript unit to an absolute time via cumulative speech time.
  const totalSpeechFrames = speechFlags.filter(Boolean).length;
  const tokenTimes: number[] = [];
  if (totalSpeechFrames > 0 && tokens.length > 0) {
    const speechFrameIndexes: number[] = [];
    speechFlags.forEach((flag, i) => {
      if (flag) speechFrameIndexes.push(i);
    });
    for (const token of tokens) {
      const fraction = (token.index + 0.5) / tokens.length;
      const speechFrame =
        speechFrameIndexes[
          Math.min(
            speechFrameIndexes.length - 1,
            Math.floor(fraction * speechFrameIndexes.length),
          )
        ];
      tokenTimes.push((speechFrame + 0.5) * frameSeconds);
    }
  }

  const segmentCount = Math.min(
    MAX_SEGMENTS,
    Math.max(MIN_SEGMENTS, Math.round(durationSeconds / TARGET_SEGMENT_SECONDS)),
  );
  const segmentSeconds = durationSeconds / segmentCount;

  const segments: PrepVoiceTimelineSegment[] = [];
  for (let s = 0; s < segmentCount; s++) {
    const startSec = s * segmentSeconds;
    const endSec = (s + 1) * segmentSeconds;
    const frameStart = Math.floor(startSec / frameSeconds);
    const frameEnd = Math.min(frameCount, Math.ceil(endSec / frameSeconds));

    let rmsSum = 0;
    let speechFrames = 0;
    for (let i = frameStart; i < frameEnd; i++) {
      rmsSum += frames[i] ?? 0;
      if (speechFlags[i]) speechFrames += 1;
    }
    const framesInSegment = Math.max(1, frameEnd - frameStart);
    const energy = Math.min(1, rmsSum / framesInSegment / (peak || 1));
    const speechRatio = speechFrames / framesInSegment;
    const speechSec = speechFrames * frameSeconds;

    let unitCount = 0;
    let fillers = 0;
    tokens.forEach((token, i) => {
      const at = tokenTimes[i];
      if (at == null) return;
      if (at >= startSec && at < endSec) {
        unitCount += 1;
        if (token.filler) fillers += 1;
      }
    });

    const pause = speechRatio < 0.3;
    const wpm =
      !pause && speechSec > 0.4 && unitCount > 0
        ? Math.round(unitCount / (speechSec / 60))
        : null;

    segments.push({
      startSec: Math.round(startSec * 10) / 10,
      endSec: Math.round(endSec * 10) / 10,
      energy: Math.round(energy * 100) / 100,
      wpm,
      pause,
      fillers,
      lowConfidence: false,
    });
  }

  // Flag confidence dips: speaking segments noticeably quieter than the rest.
  const speakingEnergies = segments
    .filter((segment) => !segment.pause)
    .map((segment) => segment.energy);
  if (speakingEnergies.length > 1) {
    const meanEnergy =
      speakingEnergies.reduce((sum, value) => sum + value, 0) /
      speakingEnergies.length;
    for (const segment of segments) {
      if (!segment.pause && segment.energy < meanEnergy * 0.55) {
        segment.lowConfidence = true;
      }
    }
  }

  return {
    segments,
    pauseCount,
    longestPauseSec: Math.round(longestPauseSec * 10) / 10,
    fillerCount,
  };
}
