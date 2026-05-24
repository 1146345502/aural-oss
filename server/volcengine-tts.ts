/**
 * Volcengine TTS 2.0 (SeedTTS) streaming synthesis client.
 *
 * Uses the HTTP Chunked unidirectional API:
 *   POST https://openspeech.bytedance.com/api/v3/tts/unidirectional
 *
 * Streams decoded audio chunks back via an async generator so callers can
 * begin forwarding audio to the browser with minimal first-byte latency.
 *
 * Docs: https://www.volcengine.com/docs/6561/1598757
 *
 * HTTP chunked `pcm` payload is int16 LE mono in practice (fragment lengths are 2 mod 4).
 * Realtime/WebSocket docs sometimes describe `pcm` as float32; use env `DOUBAO_TTS_PCM_SAMPLE_LAYOUT=float32le`
 * if your stream is float. Concatenate fragments before decoding (carry buffer); flush tail at EOF.
 */
import { randomUUID } from "crypto";
import { isAbortError } from "../src/lib/abort-error";
import { createLogger } from "../src/lib/logger";

const log = createLogger("volcengine-tts");

export const TTS_API_URL =
  "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
const TTS_SPEECH_RATE_MULTIPLIER_MIN = 0.5;
const TTS_SPEECH_RATE_MULTIPLIER_MAX = 2;

export type TtsPcmSampleLayout = "int16le" | "float32le";

/** How provider bytes are encoded before we wrap them for the browser. */
export type TtsSourceEncoding = "mp3" | "pcm_s16le" | "wav";

/** Detect MP3 vs raw PCM. Seed HTTP often returns MP3 even when `format=pcm_s16le`. */
export function detectTtsSourceEncoding(buf: Buffer): TtsSourceEncoding {
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") {
    return "wav";
  }
  if (buf.length >= 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    return "mp3";
  }
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    return "mp3";
  }
  return "pcm_s16le";
}

export interface TtsSynthesisOptions {
  speaker: string;
  format?: "pcm_s16le" | "pcm" | "mp3" | "ogg_opus";
  /** Wire layout for `format: "pcm"` (ignored for `pcm_s16le`). Default int16 LE for HTTP chunked API. */
  pcmSampleLayout?: TtsPcmSampleLayout;
  sampleRate?: number;
  emotion?: string;
  speechRate?: number;
  loudnessRate?: number;
}

export interface TtsAuthConfig {
  appId: string;
  accessToken: string;
  resourceId: string;
  apiKey?: string;
}

/**
 * Prefer App ID + Access Token when both are set; same credential pair as BigModel ASR.
 * Use X-Api-Key only when that pair is incomplete, so a mistaken or stale DOUBAO_API_KEY
 * does not override working app/token auth (which otherwise yields "Invalid X-Api-Key").
 */
export function resolveTtsAuthConfig(input: {
  appId: string;
  accessToken: string;
  apiKey: string;
  resourceId: string;
}): TtsAuthConfig {
  const appId = input.appId.trim();
  const accessToken = input.accessToken.trim();
  const apiKey = input.apiKey.trim();
  const resourceId = input.resourceId.trim() || "seed-tts-2.0";
  const useAppPair = !!(appId && accessToken);
  return {
    appId,
    accessToken,
    resourceId,
    apiKey: useAppPair ? undefined : apiKey || undefined,
  };
}

export function isTtsAuthConfigured(input: {
  appId: string;
  accessToken: string;
  apiKey: string;
}): boolean {
  const appId = input.appId.trim();
  const accessToken = input.accessToken.trim();
  const apiKey = input.apiKey.trim();
  return !!(appId && accessToken) || !!apiKey;
}

export function resolveTtsSpeechRate(
  value: string | undefined = process.env.DOUBAO_TTS_SPEECH_RATE,
): number | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;

  const multiplier = Math.min(
    TTS_SPEECH_RATE_MULTIPLIER_MAX,
    Math.max(TTS_SPEECH_RATE_MULTIPLIER_MIN, parsed)
  );
  const providerRate = Math.round((multiplier - 1) * 100);
  return Object.is(providerRate, -0) ? 0 : providerRate;
}

export interface TtsChunkEvent {
  type: "audio" | "sentence_start" | "sentence_end" | "done" | "error";
  audio?: Buffer;
  text?: string;
  error?: string;
}

/** Float32-le PCM to int16 LE for Web Audio (optional path). */
export function float32lePcmToS16le(raw: Buffer): Buffer {
  if (raw.length === 0) return raw;
  const usable = raw.length - (raw.length % 4);
  if (usable <= 0) return raw;
  const nFloat = usable / 4;
  const out = Buffer.allocUnsafe(nFloat * 2);
  for (let i = 0; i < nFloat; i++) {
    const v = raw.readFloatLE(i * 4);
    const clamped = Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
    out.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }
  return out;
}

/** Bytes per complete PCM frame on the wire for carry alignment. */
function pcmCarryAlignBytes(format: string, pcmLayout: TtsPcmSampleLayout): number | null {
  const f = format.toLowerCase();
  if (f === "pcm_s16le") return 2;
  if (f === "pcm") return pcmLayout === "float32le" ? 4 : 2;
  return null;
}

function createPcmCarryPipeline(ttsFormat: string, pcmLayout: TtsPcmSampleLayout) {
  let carry = Buffer.alloc(0);
  const align = pcmCarryAlignBytes(ttsFormat, pcmLayout);

  return {
    push(raw: Buffer): Buffer | null {
      if (align == null) return raw.length > 0 ? raw : null;

      const merged = carry.length > 0 ? Buffer.concat([carry, raw]) : raw;
      const take = merged.length - (merged.length % align);
      const tail = merged.subarray(take);
      carry = tail.byteLength ? Buffer.from(tail) : Buffer.alloc(0);
      const aligned = merged.subarray(0, take);
      if (aligned.length === 0) return null;

      const f = ttsFormat.toLowerCase();
      if (f === "pcm" && pcmLayout === "float32le") {
        return float32lePcmToS16le(Buffer.from(aligned));
      }
      return Buffer.from(aligned);
    },

    /** Flush residue after last JSON line (e.g. final int16 sample still in carry). */
    takeRemaining(): Buffer | null {
      if (carry.length === 0) return null;

      const f = ttsFormat.toLowerCase();

      if (align === 4 && f === "pcm" && pcmLayout === "float32le") {
        const usable = carry.length - (carry.length % 4);
        if (usable > 0) {
          const aligned = Buffer.from(carry.subarray(0, usable));
          carry = Buffer.alloc(0);
          return float32lePcmToS16le(aligned);
        }
        if (carry.length > 0) {
          log.warn(`TTS pcm(float) dropped ${carry.length} trailing byte(s) at EOF`);
        }
        carry = Buffer.alloc(0);
        return null;
      }

      if (align === 2) {
        const usable = carry.length - (carry.length % 2);
        if (usable <= 0) {
          if (carry.length === 1) {
            log.warn("TTS pcm(int16) dropped 1 orphan trailing byte at EOF");
          }
          carry = Buffer.alloc(0);
          return null;
        }
        const out = Buffer.from(carry.subarray(0, usable));
        carry = Buffer.alloc(0);
        return out;
      }

      carry = Buffer.alloc(0);
      return null;
    },
  };
}

function resolvePcmLayout(options: TtsSynthesisOptions): TtsPcmSampleLayout {
  if (options.pcmSampleLayout) return options.pcmSampleLayout;
  const env = process.env.DOUBAO_TTS_PCM_SAMPLE_LAYOUT?.trim().toLowerCase();
  if (env === "float32le" || env === "float32") return "float32le";
  if (env === "int16le" || env === "int16" || env === "s16le") return "int16le";
  return "int16le";
}

function extractChunkAudioBase64(chunk: Record<string, unknown>): string | null {
  const data = chunk.data;
  if (typeof data === "string" && data.length > 0) return data;
  if (Array.isArray(data)) {
    const parts = data.filter((p): p is string => typeof p === "string" && p.length > 0);
    return parts.length > 0 ? parts.join("") : null;
  }
  if (data && typeof data === "object") {
    const nested = (data as { audio?: unknown; payload?: unknown }).audio
      ?? (data as { payload?: unknown }).payload;
    if (typeof nested === "string" && nested.length > 0) return nested;
  }
  return null;
}

function extractCompleteJsonObjects(input: string): { objects: string[]; rest: string } {
  const objects: string[] = [];
  let objectStart = -1;
  let completedUntil = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (objectStart === -1) {
      if (ch === "{") {
        objectStart = i;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        objects.push(input.slice(objectStart, i + 1));
        completedUntil = i + 1;
        objectStart = -1;
      }
    }
  }

  return {
    objects,
    rest: objectStart === -1 ? input.slice(completedUntil) : input.slice(objectStart),
  };
}

/**
 * Synthesize text to streaming audio via Volcengine TTS 2.0.
 *
 * Yields TtsChunkEvent objects as they arrive. The caller should forward
 * audio chunks to the browser and handle sentence_start/end for UI events.
 *
 * Pass an AbortSignal to cancel mid-stream (e.g. on user interruption).
 */
export async function* synthesizeSpeech(
  text: string,
  auth: TtsAuthConfig,
  options: TtsSynthesisOptions,
  signal?: AbortSignal,
): AsyncGenerator<TtsChunkEvent> {
  const ttsFormat = options.format ?? "pcm";
  const pcmLayout = resolvePcmLayout(options);
  const pcmPipeline = createPcmCarryPipeline(ttsFormat, pcmLayout);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Resource-Id": auth.resourceId,
    "X-Api-Request-Id": randomUUID(),
  };

  if (auth.apiKey) {
    headers["X-Api-Key"] = auth.apiKey;
  } else {
    headers["X-Api-App-Id"] = auth.appId;
    headers["X-Api-Access-Key"] = auth.accessToken;
  }

  const body = {
    user: { uid: "aural-relay" },
    req_params: {
      text,
      speaker: options.speaker,
      audio_params: {
        format: ttsFormat,
        sample_rate: options.sampleRate || 24000,
        ...(options.emotion ? { emotion: options.emotion } : {}),
        ...(options.speechRate != null ? { speech_rate: options.speechRate } : {}),
        ...(options.loudnessRate != null ? { loudness_rate: options.loudnessRate } : {}),
      },
    },
  };

  const startMs = Date.now();
  let loggedJsonMeta = false;
  let audioStarted = false;

  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;
  const fetchSignal = controller.signal;
  let inFlight = true;

  const clearAbortTimeout = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const onParentAbort = () => {
    clearAbortTimeout();
    if (inFlight) controller.abort();
  };

  if (signal) {
    signal.addEventListener("abort", onParentAbort, { once: true });
  }

  try {
    if (signal?.aborted) {
      return;
    }

    timeoutId = setTimeout(() => controller.abort(), 8000);

    let res: Response;
    try {
      res = await fetch(TTS_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: fetchSignal,
      });
    } catch (err) {
      if (signal?.aborted || fetchSignal.aborted || isAbortError(err)) return;
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "error", error: `TTS fetch failed: ${msg}` };
      return;
    }
    clearAbortTimeout();

    log.info(`TTS HTTP response: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      yield { type: "error", error: `TTS API ${res.status}: ${errBody.slice(0, 300)}` };
      return;
    }

    if (!res.body) {
      yield { type: "error", error: "TTS response has no body" };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamCompleted = false;

    try {
    const flushRemainingTailAudio = (): TtsChunkEvent[] => {
      const tail = pcmPipeline.takeRemaining();
      if (!tail || tail.length === 0) return [];
      if (!audioStarted) {
        audioStarted = true;
        log.info(`TTS TTFB: ${Date.now() - startMs}ms`);
      }
      return [{ type: "audio", audio: tail }];
    };

    const buildChunkEvents = (
      chunk: Record<string, unknown>
    ): { events: TtsChunkEvent[]; completed: boolean } => {
      const events: TtsChunkEvent[] = [];

      if (!loggedJsonMeta) {
        log.info(`TTS first chunk keys: ${Object.keys(chunk).join(", ")}, event=${chunk.event}, code=${chunk.code}`);
        loggedJsonMeta = true;
      }

      const code = chunk.code as number | undefined;
      const event = chunk.event as string | undefined;

      // Error response
      if (code != null && code !== 0 && code !== 20000000) {
        events.push({
          type: "error",
          error: `TTS error ${code}: ${chunk.message || "unknown"}`,
        });
        return { events, completed: true };
      }

      // Sentence events
      if (event === "TTSSentenceStart") {
        events.push({ type: "sentence_start", text: (chunk.sentence as Record<string, unknown>)?.text as string || "" });
      } else if (event === "TTSSentenceEnd") {
        events.push({ type: "sentence_end", text: (chunk.sentence as Record<string, unknown>)?.text as string || "" });
      }

      // Audio data (base64 encoded)
      const audioB64 = extractChunkAudioBase64(chunk);
      if (audioB64) {
        const raw = Buffer.from(audioB64, "base64");
        const audioBuf = pcmPipeline.push(raw);
        if (audioBuf && audioBuf.length > 0) {
          if (!audioStarted) {
            audioStarted = true;
            log.info(`TTS TTFB: ${Date.now() - startMs}ms`);
          }
          events.push({ type: "audio", audio: audioBuf });
        } else if (raw.length > 0) {
          log.warn(
            `TTS dropped ${raw.length}B audio after PCM align (format=${ttsFormat}, layout=${pcmLayout})`,
          );
        }
      }

      // Completion
      if (code === 20000000) {
        if (!audioStarted) {
          log.warn(
            `TTS complete without audio chunks (${Date.now() - startMs}ms, ${text.length} chars)`,
          );
        } else {
          log.info(`TTS complete: ${Date.now() - startMs}ms, text="${text.slice(0, 60)}..."`);
        }
        events.push(...flushRemainingTailAudio(), { type: "done" });
        return { events, completed: true };
      }

      return { events, completed: false };
    };

    while (true) {
      if (signal?.aborted || fetchSignal.aborted) return;

      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch (err) {
        if (signal?.aborted || fetchSignal.aborted || isAbortError(err)) return;
        throw err;
      }
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // HTTP chunk boundaries are not exposed by fetch, so parse complete JSON
      // objects from the stream instead of relying on newline delimiters.
      const extracted = extractCompleteJsonObjects(buffer);
      buffer = extracted.rest;

      for (const json of extracted.objects) {
        let chunk: Record<string, unknown>;
        try {
          chunk = JSON.parse(json);
        } catch {
          log.warn(`TTS non-JSON object: ${json.slice(0, 200)}`);
          continue;
        }

        if (signal?.aborted) return;
        const { events, completed } = buildChunkEvents(chunk);
        for (const outputEvent of events) yield outputEvent;
        if (completed) streamCompleted = true;
      }
    }

    // Process remaining buffer
    buffer += decoder.decode();
    const extracted = extractCompleteJsonObjects(buffer);
    buffer = extracted.rest;

    for (const json of extracted.objects) {
      try {
        const chunk = JSON.parse(json);
        const { events, completed } = buildChunkEvents(chunk);
        for (const outputEvent of events) yield outputEvent;
        if (completed) streamCompleted = true;
      } catch {
        log.warn(`TTS non-JSON object: ${json.slice(0, 200)}`);
      }
    }

    if (buffer.trim()) {
      log.warn(`TTS incomplete JSON tail: ${buffer.slice(0, 200)}`);
    }

    log.info(
      `TTS stream ended, audioStarted=${audioStarted}, completed=${streamCompleted}, elapsed=${Date.now() - startMs}ms`,
    );
    if (!streamCompleted) {
      for (const outputEvent of flushRemainingTailAudio()) yield outputEvent;
      yield { type: "done" };
    }
    } catch (err) {
      if (signal?.aborted || fetchSignal.aborted || isAbortError(err)) return;
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "error", error: `TTS stream error: ${msg}` };
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
    }
  } finally {
    inFlight = false;
    clearAbortTimeout();
  }
}

/**
 * One-shot synthesis helper: collects all audio into a single buffer.
 * Useful for short utterances or the tts-s2s API route.
 */
export async function synthesizeFull(
  text: string,
  auth: TtsAuthConfig,
  options: TtsSynthesisOptions,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (signal?.aborted) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  try {
    for await (const event of synthesizeSpeech(text, auth, options, signal)) {
      if (signal?.aborted) break;
      if (event.type === "audio" && event.audio) {
        chunks.push(event.audio);
      } else if (event.type === "error") {
        throw new Error(event.error);
      }
    }
  } catch (err) {
    if (signal?.aborted || isAbortError(err)) return Buffer.alloc(0);
    throw err;
  }
  return Buffer.concat(chunks);
}
