/** Native Bailian realtime ASR protocol, normalized to the relay's cumulative packets. */
import { randomUUID } from "crypto";
import type { AsrResponse, AsrUtterance } from "./volcengine-asr";
import { filterQwenTranscript, resolveQwenAsrLanguage } from "./qwen-asr-controls";

// Use the supported rolling model; the February 2026 snapshot retires October 10.
export const QWEN_ASR_MODEL = "qwen3-asr-flash-realtime";
export const QWEN_ASR_URL = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${QWEN_ASR_MODEL}`;

export function buildQwenSessionUpdate(language?: string, silenceMs = 800, noiseThreshold = 0.3) {
  const hint = resolveQwenAsrLanguage(language);
  return {
    event_id: randomUUID(),
    type: "session.update",
    session: {
      modalities: ["text"],
      input_audio_format: "pcm",
      sample_rate: 16000,
      ...(hint ? { input_audio_transcription: { language: hint } } : {}),
      turn_detection: {
        type: "server_vad",
        threshold: noiseThreshold,
        silence_duration_ms: Math.max(200, Math.min(6000, silenceMs)),
      },
    },
  };
}

export function buildQwenAudioAppend(audio: Buffer) {
  return { event_id: randomUUID(), type: "input_audio_buffer.append", audio: audio.toString("base64") };
}

export function buildQwenSessionFinish() {
  return { event_id: randomUUID(), type: "session.finish" };
}

export interface QwenAsrState {
  /** Item order is captured at speech_started, before transcription can finish out of order. */
  items: Map<string, AsrUtterance>;
  language?: string;
}

export function createQwenAsrState(language?: string): QwenAsrState {
  return { items: new Map(), language };
}

interface QwenEvent {
  type?: string;
  item_id?: string;
  text?: string;
  stash?: string;
  transcript?: string;
  error?: { code?: string; message?: string };
}

export function parseQwenAsrResponse(state: QwenAsrState, event: QwenEvent): AsrResponse | null {
  if (event.type === "error" || event.type === "conversation.item.input_audio_transcription.failed") {
    return {
      messageType: 15,
      errorCode: -1,
      errorMessage: event.error?.message || event.error?.code || "Qwen ASR failed",
    };
  }
  if (event.type === "input_audio_buffer.speech_started") {
    if (event.item_id && !state.items.has(event.item_id)) {
      state.items.set(event.item_id, { text: "", definite: false });
    }
    return null;
  }
  const completed = event.type === "conversation.item.input_audio_transcription.completed";
  const partial = event.type === "conversation.item.input_audio_transcription.text";
  if (!completed && !partial) return null;
  if (!event.item_id) throw new Error("Qwen ASR transcript is missing item_id");

  const previous = state.items.get(event.item_id);
  // A late draft must never replace an authoritative final or reopen a committed turn.
  if (previous?.definite && partial) return null;
  state.items.set(event.item_id, {
    // text is a stable prefix and stash is its draft suffix, not a delta to append repeatedly.
    text: filterQwenTranscript(completed ? event.transcript || "" : (event.text || "") + (event.stash || ""), state.language),
    definite: completed,
  });
  const utterances = [...state.items.values()].map((item) => ({ ...item }));
  return {
    messageType: 9,
    text: utterances.map((item) => item.text.trim()).filter(Boolean).join(" "),
    utterances,
  };
}
