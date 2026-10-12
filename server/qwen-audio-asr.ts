/** Qwen Audio 3.0's task-based streaming protocol. Drafts replace a sentence by ID. */
import type { AsrResponse, AsrUtterance } from "./volcengine-asr";
import { filterQwenTranscript, resolveQwenAsrLanguage } from "./qwen-asr-controls";

export const QWEN_AUDIO_ASR_MODEL = "qwen-audio-3.0-asr-flash-streaming";
export const QWEN_AUDIO_ASR_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/inference";

export function buildQwenAudioTask(taskId: string, language?: string, silenceMs = 800, corpus?: Record<string, unknown>, noiseThreshold = 0.1) {
  const hint = resolveQwenAsrLanguage(language);
  // Reuse Seed's topic/question/recent-dialog hints in Qwen's documented context format.
  // Keep a bounded vocabulary/context hint, without inventing names or forcing hotwords.
  let contextText = "";
  if (typeof corpus?.context === "string") {
    try {
      const entries = JSON.parse(corpus.context).context_data;
      if (Array.isArray(entries)) {
        contextText = entries.filter((entry) => typeof entry?.text === "string")
          .map((entry) => entry.text).join("\n").slice(0, 400);
      }
    } catch { /* Invalid optional context must not block transcription. */ }
  }
  return {
    header: { action: "run-task", task_id: taskId, streaming: "duplex" },
    payload: {
      task_group: "audio", task: "asr", function: "recognition", model: QWEN_AUDIO_ASR_MODEL,
      parameters: {
        format: "pcm", sample_rate: 16000, semantic_punctuation_enabled: false, heartbeat: true,
        max_sentence_silence: Math.max(200, Math.min(6000, silenceMs)),
        speech_noise_threshold: noiseThreshold,
        ...(hint ? { language_hints: [hint] } : {}),
      },
      input: contextText ? { context: [{ role: "user", content: [{ type: "input_text", text: contextText }] }] } : {},
    },
  };
}

export function buildQwenAudioTaskFinish(taskId: string) {
  return { header: { action: "finish-task", task_id: taskId, streaming: "duplex" }, payload: { input: {} } };
}

export interface QwenAudioAsrState { sentences: Map<number, AsrUtterance>; language?: string }
export function createQwenAudioAsrState(language?: string): QwenAudioAsrState { return { sentences: new Map(), language }; }

interface QwenAudioEvent {
  header?: { event?: string; task_id?: string; error_message?: string; error_code?: string };
  payload?: { output?: { sentence?: {
    sentence_id?: number; begin_time?: number; text?: string; heartbeat?: boolean; sentence_end?: boolean;
  } } };
}

export function parseQwenAudioAsrResponse(state: QwenAudioAsrState, event: QwenAudioEvent, taskId: string): AsrResponse | null {
  if (event.header?.task_id !== taskId) return null;
  if (event.header.event === "task-failed") {
    return { messageType: 15, errorCode: -1, errorMessage: event.header.error_message || event.header.error_code || "Qwen Audio ASR failed" };
  }
  if (event.header.event !== "result-generated") return null;
  const sentence = event.payload?.output?.sentence;
  if (!sentence || sentence.heartbeat) return null;
  const id = sentence.sentence_id ?? sentence.begin_time;
  if (id == null || !Number.isFinite(id)) throw new Error("Qwen Audio ASR sentence is missing identity");
  if (state.sentences.get(id)?.definite && !sentence.sentence_end) return null;
  state.sentences.set(id, { text: filterQwenTranscript(sentence.text || "", state.language), definite: !!sentence.sentence_end });
  const utterances = [...state.sentences].sort(([a], [b]) => a - b).map(([, sentence]) => ({ ...sentence }));
  return { messageType: 9, text: utterances.map((sentence) => sentence.text.trim()).filter(Boolean).join(" "), utterances };
}
