import { isAbortError } from "@/lib/abort-error";
import { createLogger } from "@/lib/logger";
import { NextResponse } from "next/server";
import {
    detectTtsSourceEncoding,
    isTtsAuthConfigured,
    resolveTtsAuthConfig,
    resolveTtsSpeechRate,
    type TtsSynthesisOptions,
} from "../../../../../server/volcengine-tts";
import { synthesizeCoachAudio } from "./synthesize";

const log = createLogger("api/voice/tts-s2s");

const TTS_APP_ID = process.env.DOUBAO_APP_ID || "";
const TTS_ACCESS_TOKEN = process.env.DOUBAO_ACCESS_TOKEN || "";
const TTS_API_KEY = process.env.DOUBAO_API_KEY || "";
const TTS_RESOURCE_ID = process.env.DOUBAO_TTS_RESOURCE_ID || "seed-tts-2.0";
const TTS_VOICE_ZH = process.env.DOUBAO_VOICE_ZH || "";
const TTS_VOICE_EN = process.env.DOUBAO_VOICE_EN || "";
const TTS_SPEECH_RATE = resolveTtsSpeechRate();

// Fallback TTS when Doubao isn't configured. Uses the same key/voice as the
// OpenAI realtime relay; the model is multilingual, so it speaks whatever
// language `text` is written in without needing a per-language voice id.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const OPENAI_TTS_VOICE =
  process.env.OPENAI_REALTIME_VOICE || process.env.AZURE_OPENAI_VOICE || "ash";

async function synthesizeWithOpenAi(
  text: string,
  signal: AbortSignal,
  responseFormat: "wav" | "mp3" | "pcm"
): Promise<Uint8Array> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE,
      input: text,
      response_format: responseFormat,
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI TTS failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  return new Uint8Array(await res.arrayBuffer());
}

type TtsClientFormat = "wav" | "mp3" | "pcm_f32le";

function resolveClientFormat(req: Request): TtsClientFormat {
  const url = new URL(req.url);
  const queryFormat = url.searchParams.get("format")?.toLowerCase();
  const format = req.headers.get("x-aural-tts-format")?.toLowerCase();
  const accept = req.headers.get("accept")?.toLowerCase() || "";

  /** Raw float32 LE — only for callers that decode PCM manually (not HTMLAudioElement). */
  if (queryFormat === "pcm_f32le" || format === "pcm_f32le") {
    return "pcm_f32le";
  }

  if (queryFormat === "mp3" || format === "mp3" || accept.includes("audio/mpeg")) {
    return "mp3";
  }

  if (
    queryFormat === "wav" ||
    format === "wav" ||
    accept.includes("audio/wav") ||
    accept.includes("audio/x-wav") ||
    accept.includes("audio/wave")
  ) {
    return "wav";
  }

  // Default WAV so HTMLAudioElement / browser playback always receives a decodeable container.
  // Defaulting to pcm_f32le caused garbage noise when any client omitted format hints (e.g. first load / dev).
  return "wav";
}

function getTtsAuth() {
  return resolveTtsAuthConfig({
    appId: TTS_APP_ID,
    accessToken: TTS_ACCESS_TOKEN,
    apiKey: TTS_API_KEY,
    resourceId: TTS_RESOURCE_ID,
  });
}

function getTtsOptions(
  language: string | undefined,
  format: TtsSynthesisOptions["format"]
): TtsSynthesisOptions {
  const isZh = language?.toLowerCase().startsWith("zh");
  const configuredSpeaker = (isZh ? TTS_VOICE_ZH : TTS_VOICE_EN).trim();
  const defaultSpeaker = isZh
    ? "zh_female_shuangkuaisisi_uranus_bigtts"
    : "en_female_dacey_uranus_bigtts";
  const speaker =
    configuredSpeaker && (isZh || configuredSpeaker.startsWith("en_"))
      ? configuredSpeaker
      : defaultSpeaker;

  return {
    speaker,
    format,
    sampleRate: 24000,
    ...(TTS_SPEECH_RATE != null ? { speechRate: TTS_SPEECH_RATE } : {}),
  };
}

function s16leToF32le(input: Buffer): Uint8Array {
  const sampleCount = Math.floor(input.byteLength / 2);
  const out = new ArrayBuffer(sampleCount * 4);
  const view = new DataView(out);

  for (let i = 0; i < sampleCount; i++) {
    view.setFloat32(i * 4, input.readInt16LE(i * 2) / 32768, true);
  }

  return new Uint8Array(out);
}

function s16leToWav(input: Buffer, sampleRate = 24000): Uint8Array {
  const dataBytes = input.byteLength - (input.byteLength % 2);
  const out = Buffer.allocUnsafe(44 + dataBytes);

  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(dataBytes, 40);
  input.copy(out, 44, 0, dataBytes);

  return new Uint8Array(out);
}

function toArrayBuffer(input: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(input.byteLength);
  new Uint8Array(out).set(input);
  return out;
}

/**
 * POST /api/voice/tts-s2s
 *
 * Seed TTS 2.0 mic-test synthesis. Returns WAV by default (browser-safe). Use
 * `?format=pcm_f32le` only if the client decodes raw PCM itself.
 */
export async function POST(req: Request) {
  let body: { text?: unknown; language?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawText = typeof body.text === "string" ? body.text.trim() : "";
  const language = typeof body.language === "string" ? body.language : undefined;

  if (!rawText) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const doubaoConfigured = isTtsAuthConfigured({
    appId: TTS_APP_ID,
    accessToken: TTS_ACCESS_TOKEN,
    apiKey: TTS_API_KEY,
  });

  if (!doubaoConfigured && !OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "No TTS credentials configured (Doubao or OpenAI)" },
      { status: 503 }
    );
  }

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });

  if (!doubaoConfigured) {
    try {
      const clientFormat = resolveClientFormat(req);
      // OpenAI's API doesn't have a "pcm_f32le" format; request raw s16le PCM
      // ("pcm") and convert, mirroring the Doubao path below. For wav/mp3
      // requests, OpenAI can produce those containers directly.
      const openAiFormat = clientFormat === "pcm_f32le" ? "pcm" : clientFormat;
      const raw = await synthesizeWithOpenAi(rawText, abort.signal, openAiFormat);
      const responseBody = clientFormat === "pcm_f32le"
        ? s16leToF32le(Buffer.from(raw))
        : raw;
      const contentType = clientFormat === "mp3"
        ? "audio/mpeg"
        : clientFormat === "pcm_f32le"
          ? "application/octet-stream"
          : "audio/wav";
      log.info(`OpenAI TTS synthesized ${clientFormat}: ${responseBody.byteLength}B`);
      return new Response(toArrayBuffer(responseBody), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
          "X-Aural-TTS-Format": clientFormat,
          "X-Aural-TTS-Provider": OPENAI_TTS_MODEL,
        },
      });
    } catch (err) {
      if (abort.signal.aborted || isAbortError(err)) {
        return new Response(null, { status: 499 });
      }
      const message = err instanceof Error ? err.message : String(err);
      log.error("OpenAI TTS synthesis failed:", message);
      return NextResponse.json(
        { error: "OpenAI TTS synthesis failed" },
        { status: 502 }
      );
    }
  }

  try {
    const clientFormat = resolveClientFormat(req);
    const startedAt = Date.now();
    const result = await synthesizeCoachAudio(
      rawText,
      getTtsAuth(),
      (format) => getTtsOptions(language, format),
      abort.signal,
    );

    if (!result) {
      log.warn(`Seed TTS returned no audio (${rawText.length} chars in)`);
      return NextResponse.json(
        { error: "Seed TTS returned no audio", fallback: "browser" },
        { status: 502 },
      );
    }

    const { audio, wireFormat } = result;
    const sourceEncoding =
      wireFormat === "mp3" ? "mp3" : detectTtsSourceEncoding(audio);

    if (sourceEncoding === "mp3" && wireFormat !== "mp3") {
      log.warn(
        `Seed TTS wire=${wireFormat} but payload is MP3 (${audio.byteLength}B); returning audio/mpeg`,
      );
    }

    let responseBody: Uint8Array;
    let contentType: string;
    let responseFormat: string;

    if (sourceEncoding === "mp3") {
      responseBody = new Uint8Array(audio);
      contentType = "audio/mpeg";
      responseFormat = "mp3";
    } else if (sourceEncoding === "wav") {
      responseBody = new Uint8Array(audio);
      contentType = "audio/wav";
      responseFormat = "wav";
    } else if (clientFormat === "wav") {
      responseBody = s16leToWav(audio);
      contentType = "audio/wav";
      responseFormat = "wav";
    } else if (clientFormat === "mp3") {
      responseBody = new Uint8Array(audio);
      contentType = "audio/mpeg";
      responseFormat = "mp3";
    } else {
      responseBody = s16leToF32le(audio);
      contentType = "application/octet-stream";
      responseFormat = clientFormat;
    }

    log.info(
      `Seed TTS synthesized ${responseFormat} (wire=${wireFormat}, source=${sourceEncoding}): source=${audio.byteLength}B, response=${responseBody.byteLength}B, head=${Buffer.from(responseBody.subarray(0, 12)).toString("hex")}, ${Date.now() - startedAt}ms`,
    );

    return new Response(toArrayBuffer(responseBody), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Aural-TTS-Format": responseFormat,
        "X-Aural-TTS-Provider": "seed-tts-2.0",
      },
    });
  } catch (err) {
    if (abort.signal.aborted || isAbortError(err)) {
      return new Response(null, { status: 499 });
    }
    const message = err instanceof Error ? err.message : String(err);
    log.error("Seed TTS synthesis failed:", message);
    return NextResponse.json(
      { error: "Seed TTS synthesis failed" },
      { status: 502 }
    );
  }
}
