/** Voice delivery metrics derived from recorded audio + transcript. */
export type VoiceDeliveryMetrics = {
  durationSeconds: number;
  wordsPerMinute: number;
  confidence: number;
  clarity: number;
  tone: number;
  tips: string[];
};

import type { PrepVoiceDeliveryFeedback } from "@/components/prep/prep-types";

function countWords(text: string): number {
  const cjk = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const latin = text.match(/[a-zA-Z]+/g)?.length ?? 0;
  return cjk + latin;
}

/** Analyze PCM samples (float -1..1) for volume dynamics. */
export function analyzeVolumeFromSamples(samples: Float32Array): {
  avgRms: number;
  variance: number;
} {
  if (samples.length === 0) return { avgRms: 0, variance: 0 };
  let sum = 0;
  const chunk = 1024;
  const rmsValues: number[] = [];
  for (let i = 0; i < samples.length; i += chunk) {
    let s = 0;
    const end = Math.min(i + chunk, samples.length);
    for (let j = i; j < end; j++) s += samples[j] * samples[j];
    const rms = Math.sqrt(s / (end - i));
    rmsValues.push(rms);
    sum += rms;
  }
  const avgRms = sum / rmsValues.length;
  const variance =
    rmsValues.reduce((acc, v) => acc + (v - avgRms) ** 2, 0) / rmsValues.length;
  return { avgRms, variance };
}

/** Decode audio blob to samples for volume analysis (best-effort). */
export async function decodeAudioBlobToSamples(
  blob: Blob,
): Promise<Float32Array | null> {
  if (typeof window === "undefined") return null;
  try {
    const ctx = new AudioContext();
    const buffer = await blob.arrayBuffer();
    const audio = await ctx.decodeAudioData(buffer.slice(0));
    await ctx.close();
    return audio.getChannelData(0);
  } catch {
    return null;
  }
}

export async function buildVoiceDeliveryMetrics(
  blob: Blob,
  transcript: string,
  durationMs: number,
  responseLanguage: string,
): Promise<VoiceDeliveryMetrics> {
  const isZh = responseLanguage === "zh";
  const durationSeconds = Math.max(0.5, durationMs / 1000);
  const words = countWords(transcript);
  const wordsPerMinute = Math.round((words / durationSeconds) * 60);

  const samples = await decodeAudioBlobToSamples(blob);
  const { avgRms, variance } = samples
    ? analyzeVolumeFromSamples(samples)
    : { avgRms: 0.05, variance: 0.001 };

  // Volume too low or flat → lower confidence
  let confidence = 7;
  if (avgRms < 0.02) confidence -= 3;
  else if (avgRms < 0.04) confidence -= 1;
  if (variance < 0.0003) confidence -= 2;
  else if (variance < 0.0008) confidence -= 1;
  confidence = Math.min(10, Math.max(1, confidence));

  // Pace: ideal ~110–170 wpm (zh counts characters loosely as words)
  let clarity = 7;
  if (wordsPerMinute > 0 && wordsPerMinute < 70) clarity -= 2;
  else if (wordsPerMinute > 200) clarity -= 2;
  else if (wordsPerMinute >= 90 && wordsPerMinute <= 170) clarity += 1;
  clarity = Math.min(10, Math.max(1, clarity));

  // Tone / energy from dynamics
  let tone = 6;
  if (variance >= 0.002) tone += 2;
  else if (variance >= 0.001) tone += 1;
  if (avgRms >= 0.06 && avgRms <= 0.25) tone += 1;
  tone = Math.min(10, Math.max(1, tone));

  const tips: string[] = [];
  if (avgRms < 0.03) {
    tips.push(
      isZh
        ? "声音偏小，靠近麦克风并提高一些音量，让教练听清重点。"
        : "Speak a bit louder and closer to the mic so key points come through.",
    );
  }
  if (variance < 0.0005) {
    tips.push(
      isZh
        ? "语调偏平，在关键句上加重语气，听起来会更有说服力。"
        : "Add more vocal emphasis on key phrases to sound more persuasive.",
    );
  }
  if (wordsPerMinute > 0 && wordsPerMinute < 80) {
    tips.push(
      isZh
        ? "语速偏慢，可稍微加快节奏，同时保持吐字清晰。"
        : "Pace is a bit slow — pick up slightly while staying clear.",
    );
  } else if (wordsPerMinute > 190) {
    tips.push(
      isZh
        ? "语速偏快，适当停顿，让听众跟上你的结构。"
        : "You're speaking fast — add brief pauses so the structure lands.",
    );
  }

  return {
    durationSeconds,
    wordsPerMinute,
    confidence,
    clarity,
    tone,
    tips,
  };
}

export function voiceMetricsToFeedback(
  metrics: VoiceDeliveryMetrics,
): PrepVoiceDeliveryFeedback {
  return {
    confidence: metrics.confidence,
    clarity: metrics.clarity,
    tone: metrics.tone,
    tips: metrics.tips,
  };
}
