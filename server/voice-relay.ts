/**
 * WebSocket relay server using separate ASR 2.0 + TTS 2.0 services.
 *
 * Browser ←→ this relay ←→ Volcengine ASR 2.0 (speech recognition)
 *                         ←→ Volcengine TTS 2.0 (speech synthesis)
 *                         ←→ Gemini / Kimi / MiniMax LLM (response generation)
 *
 * Architecture (Phase 2 — cost-optimized):
 *   - ASR via Volcengine BigModel streaming ASR (volcengine-asr.ts)
 *   - TTS via Volcengine SeedTTS 2.0 HTTP streaming (volcengine-tts.ts)
 *   - Chat intelligence via external LLM (unchanged from Phase 1)
 *
 * Key features:
 * - Per-question interview flow with LLM-powered context summarization
 * - Transition triggers from both user (button/voice) and agent (keyword detection)
 * - Barge-in / interruption: ASR activity cancels in-flight TTS
 * - Accumulated context passed between questions
 *
 * Usage:  npx tsx server/voice-relay.ts
 */
import { randomUUID } from "crypto";
import { config } from "dotenv";
import { WebSocket, WebSocketServer } from "ws";
import { bt } from "../src/lib/i18n";
import { createLogger } from "../src/lib/logger";
import { callRelayLLM, logRelayLlmStartup } from "./relay-llm";
import {
    collapseInternalAsrRepetitions,
    finalizeTurnBudgetResponse,
    isUserEndRequest,
    isUserSkipRequest,
    mergeAsrSegments,
    mergePendingAsrInterim,
    responseInvitesUserReply,
    shouldHoldBargeInInterimForFinal,
    shouldSuppressAnsweredAsrFinal,
    shouldSuppressRecentAsrFinal,
    trimCrossTurnOverlap,
    type RecentAsrFinal,
} from "./voice-relay-helpers";
import { PROMPTS, SPOKEN } from "./voice-relay-prompts";
import {
    BIGMODEL_ASR_URL,
    buildBigModelAudioRequest,
    buildBigModelFullRequest,
    buildBigModelHeaders,
    parseAsrResponse,
    resolveBigModelAsrLanguage,
    type BigModelAsrConfig,
} from "./volcengine-asr";
import {
    resolveTtsAuthConfig,
    resolveTtsSpeechRate,
    synthesizeSpeech,
    type TtsAuthConfig,
    type TtsSynthesisOptions,
} from "./volcengine-tts";

const log = createLogger("voice-relay");

config({ path: ".env.local", override: true });
config({ path: ".env" });

// AbortController.abort() in Node.js can cause unhandled rejections from
// fetch internals — these are expected during TTS barge-in cancellation.
process.on("unhandledRejection", (reason) => {
  if (reason instanceof DOMException && reason.name === "AbortError") return;
  log.error("Unhandled rejection:", reason);
});

// ── Configuration ───────────────────────────────────────────────────

const RELAY_PORT = Number(process.env.VOICE_RELAY_PORT) || 8766;

// ASR config — X-Api-Key auth (new console) for ASR 2.0
const ASR_APP_ID = process.env.DOUBAO_APP_ID || process.env.DOUBAO_APP_KEY || "";
const ASR_ACCESS_TOKEN = process.env.DOUBAO_ACCESS_TOKEN || "";
const ASR_API_KEY = process.env.DOUBAO_API_KEY || "";
const ASR_RESOURCE_ID = process.env.DOUBAO_ASR_RESOURCE_ID || "volc.seedasr.sauc.duration";

/** Volc BigModel endpointing / speech timing bounds (ms). Docs: min 200ms for end window. */
const ASR_ENDPOINT_MIN_MS = 200;
const ASR_END_WINDOW_DEFAULT_MS = 2000;
const ASR_END_WINDOW_MAX_MS = 6_000;
const ASR_FORCE_SPEECH_DEFAULT_MS = 0;
const ASR_FORCE_SPEECH_MAX_MS = 60_000;

/**
 * Volc BigModel: silence longer than end_window_size (ms) forces definite=true and ends the turn.
 * Override: DOUBAO_ASR_END_WINDOW_MS
 */
const ASR_END_WINDOW_MS = Math.max(
  ASR_ENDPOINT_MIN_MS,
  Math.min(
    ASR_END_WINDOW_MAX_MS,
    Number(process.env.DOUBAO_ASR_END_WINDOW_MS) || ASR_END_WINDOW_DEFAULT_MS,
  ),
);
/**
 * Volc BigModel force_to_speech_time can force a definite result while speech is still ongoing.
 * Keep it disabled by default so candidate answers are ended by silence (end_window_size), not by
 * an arbitrary wall-clock chunk. Override with DOUBAO_ASR_FORCE_SPEECH_MS if a forced cap is needed.
 */
const parsedForceSpeechMs = Number(process.env.DOUBAO_ASR_FORCE_SPEECH_MS);
const ASR_FORCE_SPEECH_MS = Number.isFinite(parsedForceSpeechMs)
  ? Math.max(0, Math.min(ASR_FORCE_SPEECH_MAX_MS, parsedForceSpeechMs))
  : ASR_FORCE_SPEECH_DEFAULT_MS;
const ASR_FINAL_COALESCE_MS = Math.max(
  0,
  Math.min(
    5_000,
    Number(process.env.DOUBAO_ASR_FINAL_COALESCE_MS) || 2_200,
  ),
);
const ASR_LONG_FINAL_COALESCE_MS = Math.max(
  ASR_FINAL_COALESCE_MS,
  Math.min(
    8_000,
    Number(process.env.DOUBAO_ASR_LONG_FINAL_COALESCE_MS) || 5_000,
  ),
);
const ASR_SHORT_FINAL_COALESCE_MS = Math.max(
  0,
  Math.min(
    ASR_FINAL_COALESCE_MS,
    Number(process.env.DOUBAO_ASR_SHORT_FINAL_COALESCE_MS) || 500,
  ),
);
const ASR_ACTIVE_SPEECH_HOLD_MS = Math.max(
  0,
  Math.min(
    3_000,
    Number(process.env.DOUBAO_ASR_ACTIVE_SPEECH_HOLD_MS) || 1_200,
  ),
);
const ASR_PENDING_FINAL_QUIET_MS = Math.max(
  ASR_ACTIVE_SPEECH_HOLD_MS,
  Math.min(
    4_000,
    Number(process.env.DOUBAO_ASR_PENDING_FINAL_QUIET_MS) || 1_600,
  ),
);
const ASR_MAX_ACTIVE_SPEECH_HOLD_MS = Math.max(
  0,
  Math.min(
    120_000,
    Number(process.env.DOUBAO_ASR_MAX_ACTIVE_SPEECH_HOLD_MS) || 60_000,
  ),
);
const ASR_AUDIO_ACTIVITY_RMS_THRESHOLD = Math.max(
  0,
  Math.min(
    1,
    Number(process.env.DOUBAO_ASR_AUDIO_ACTIVITY_RMS_THRESHOLD) || 0.018,
  ),
);
const ASR_SESSION_MAX_CONTINUOUS_SPEECH_MS = Math.max(
  10_000,
  Math.min(
    120_000,
    Number(process.env.DOUBAO_ASR_SESSION_MAX_CONTINUOUS_SPEECH_MS) || 30_000,
  ),
);
const ASR_STUCK_TEXT_ROTATE_MS = Math.max(
  3_000,
  Math.min(
    15_000,
    Number(process.env.DOUBAO_ASR_STUCK_TEXT_ROTATE_MS) || 5_000,
  ),
);
const ASR_RECENT_FINAL_REPLAY_TTL_MS = 90_000;
const ASR_RECENT_FINAL_REPLAY_MIN_UNITS = 8;

/**
 * Volc split-noise finals often arrive soon after the assistant line is committed; after this much
 * wall time since that line, treat the user final as a real reply (no phrase-shape / keyword rules).
 */
const SPLIT_NOISE_MIN_PAUSE_AFTER_ASSISTANT_MS = 5500;

// TTS config
const TTS_APP_ID = process.env.DOUBAO_APP_ID || "";
const TTS_ACCESS_TOKEN = process.env.DOUBAO_ACCESS_TOKEN || "";
const TTS_API_KEY = process.env.DOUBAO_API_KEY || "";
const TTS_RESOURCE_ID = process.env.DOUBAO_TTS_RESOURCE_ID || "seed-tts-2.0";
const TTS_VOICE_ZH = process.env.DOUBAO_VOICE_ZH || "";
const TTS_VOICE_EN = process.env.DOUBAO_VOICE_EN || "";
const TTS_SPEECH_RATE = resolveTtsSpeechRate();

function getTtsAuth(): TtsAuthConfig {
  return resolveTtsAuthConfig({
    appId: TTS_APP_ID,
    accessToken: TTS_ACCESS_TOKEN,
    apiKey: TTS_API_KEY,
    resourceId: TTS_RESOURCE_ID,
  });
}

function getTtsOptions(language?: string): TtsSynthesisOptions {
  const isZh = language?.toLowerCase().startsWith("zh");
  const defaultVoice = isZh
    ? "zh_female_shuangkuaisisi_uranus_bigtts"
    : "en_female_dacey_uranus_bigtts";
  const voiceType = (isZh ? TTS_VOICE_ZH : TTS_VOICE_EN) || defaultVoice;
  return {
    speaker: voiceType,
    format: "pcm",
    sampleRate: 24000,
    ...(TTS_SPEECH_RATE != null ? { speechRate: TTS_SPEECH_RATE } : {}),
  };
}

if (!ASR_ACCESS_TOKEN && !ASR_API_KEY) {
  log.error("Missing DOUBAO_ACCESS_TOKEN or DOUBAO_API_KEY in .env.local");
  process.exit(1);
}

// ── Interview context type ──────────────────────────────────────────

interface InterviewContext {
  title: string;
  objective?: string | null;
  aiName: string;
  aiTone: string;
  language: string;
  followUpDepth: string;
  startQuestionIndex?: number;
  questions: Array<{
    text: string;
    type: string;
    description?: string | null;
    options?: { options: string[]; allowMultiple?: boolean } | null;
    order: number;
  }>;
}

interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
}

function normalizeUtteranceForEcho(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Volc often picks up played TTS; avoid treating that as a user line on suppression flush. */
function looksLikeAssistantPlaybackEcho(userText: string, transcript: TranscriptEntry[]): boolean {
  const u = normalizeUtteranceForEcho(userText);
  if (u.length < 10) return false;
  for (let i = transcript.length - 1; i >= Math.max(0, transcript.length - 4); i--) {
    const e = transcript[i];
    if (e?.role !== "assistant" || !e.text) continue;
    const a = normalizeUtteranceForEcho(e.text);
    if (!a) continue;
    if (a.includes(u)) return true;
    if (u.length >= 28 && u.includes(a.slice(0, Math.min(36, a.length)))) return true;
  }
  return false;
}

interface AgentContext {
  memory: string;
  codeContent?: string;
  codeLanguage?: string;
  whiteboardDescription?: string;
  whiteboardLoading?: boolean;
  correctionGuard?: string;
  antiRepetition?: string;
}

// ── Vision LLM for whiteboard description ────────────────────────────

const VISION_LLM_API_KEY = process.env.KIMI_API_KEY || "";
const VISION_LLM_BASE_URL = process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1";
const VISION_LLM_MODEL = process.env.VISION_LLM_MODEL || "kimi-k2.5";
/** Used when the primary model returns empty text after parsing (vision-specific, shorter path to answer). */
const VISION_LLM_RETRY_MODEL = process.env.VISION_LLM_RETRY_MODEL || "moonshot-v1-8k-vision-preview";
const VISION_LLM_MAX_TOKENS = 1024;
const WHITEBOARD_SNAPSHOT_REQUEST_TIMEOUT_MS = 2500;
const WHITEBOARD_VISION_INLINE_TIMEOUT_MS = 1200;
const WHITEBOARD_VISION_FOLLOW_UP_MAX_WAIT_MS = 20_000;

/** Kimi API rejects custom temperature for these models — omit the field (see kimi.ts / vision-compare). */
const VISION_MODELS_OMIT_TEMPERATURE = new Set(["kimi-k2.5"]);

/**
 * Strip Kimi-style redacted reasoning blocks (see scripts/vision-compare stripThinking).
 * Low max_tokens can leave the whole completion inside one — second replace clears that tail.
 */
function stripVisionReasoning(text: string): string {
  let result = text.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim();
  result = result.replace(/<think>[\s\S]*/gi, "").trim();
  return result;
}

function normalizeChatMessageContent(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push(part);
      continue;
    }
    if (part && typeof part === "object" && "type" in part) {
      const p = part as { type?: string; text?: string };
      if (p.type === "text" && typeof p.text === "string") parts.push(p.text);
    }
  }
  return parts.join("");
}

async function callWhiteboardVisionApi(
  imageDataUrl: string,
  userPrompt: string,
  model: string,
): Promise<{ text: string; finishReason?: string }> {
  const omitTemp = VISION_MODELS_OMIT_TEMPERATURE.has(model);
  const body: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageDataUrl } },
          { type: "text", text: userPrompt },
        ],
      },
    ],
    max_tokens: VISION_LLM_MAX_TOKENS,
  };
  if (!omitTemp) {
    body.temperature = 0.2;
  }

  const res = await fetch(`${VISION_LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VISION_LLM_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    log.error(`Vision LLM error (${model}): ${res.status} — ${errBody.slice(0, 200)}`);
    return { text: "" };
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
  };
  const choice = data?.choices?.[0];
  const raw = normalizeChatMessageContent(choice?.message?.content);
  const text = stripVisionReasoning(raw).trim();
  return { text, finishReason: choice?.finish_reason };
}

async function describeWhiteboard(imageDataUrl: string, isZh: boolean): Promise<string> {
  if (!VISION_LLM_API_KEY || !imageDataUrl) return "";

  const userPrompt = isZh
    ? "用1-2句话描述这个白板上画了什么。重点说明结构、组件和它们之间的关系。只输出描述本体，不要输出思考过程。"
    : "Describe what is drawn on this whiteboard in 1-2 sentences. Focus on the structure, components, and relationships shown. Output only the description itself, no reasoning or preamble.";

  const startMs = Date.now();
  try {
    let { text, finishReason } = await callWhiteboardVisionApi(
      imageDataUrl,
      userPrompt,
      VISION_LLM_MODEL,
    );

    if (
      !text &&
      VISION_LLM_RETRY_MODEL &&
      VISION_LLM_RETRY_MODEL !== VISION_LLM_MODEL
    ) {
      log.warn(
        `Vision LLM (${VISION_LLM_MODEL}) returned empty${finishReason ? ` (finish=${finishReason})` : ""} — retrying with ${VISION_LLM_RETRY_MODEL}`,
      );
      ({ text, finishReason } = await callWhiteboardVisionApi(
        imageDataUrl,
        userPrompt,
        VISION_LLM_RETRY_MODEL,
      ));
    }

    const elapsed = Date.now() - startMs;
    if (!text) {
      log.warn(
        `Vision LLM returned empty (${elapsed}ms)${finishReason ? ` finish=${finishReason}` : ""}`,
      );
      return "";
    }

    log.info(
      `Vision LLM (${elapsed}ms): "${text.length > 80 ? `${text.slice(0, 80)}…` : text}"`,
    );
    return text;
  } catch (err) {
    log.error("Vision LLM failed:", err);
    return "";
  }
}

// ── Correction detection ─────────────────────────────────────────────

const CORRECTION_PATTERNS_ZH = [
  /请重新/i, /请选择/i, /只能选一个/i, /请再想想/i,
  /需要选择/i, /请再考虑/i, /选择一个/i, /不太对/i,
];
const CORRECTION_PATTERNS_EN = [
  /please reconsider/i, /choose only one/i, /pick (?:only )?one/i,
  /need to (?:select|choose|pick)/i, /try again/i, /that'?s not quite/i,
  /please select/i, /must pick/i, /can only choose one/i,
];

function isCorrection(text: string, isZh: boolean): boolean {
  const patterns = isZh ? CORRECTION_PATTERNS_ZH : CORRECTION_PATTERNS_EN;
  return patterns.some((p) => p.test(text));
}

// ── Repetition detection ─────────────────────────────────────────────

function normalizeForComparison(s: string): string {
  return s.toLowerCase().replace(/[^\w\u4e00-\u9fff]/g, "");
}

function isSimilarResponse(a: string, b: string): boolean {
  const na = normalizeForComparison(a);
  const nb = normalizeForComparison(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  return longer.includes(shorter) || shorter.length / longer.length > 0.8;
}

// ── Transition detection ────────────────────────────────────────────

const FAST_NEXT_PATTERNS = [
  /^(?:下一个问题|下一题|跳过|next\s*question|skip)\.?$/i,
];

const FAST_PREV_PATTERNS = [
  /^(?:上一个问题|上一题|previous\s*question)\.?$/i,
];

const USER_PREV_PATTERNS = [
  /(?:go|move|get)\s+back\s+(?:to\s+)?(?:the\s+)?(?:previous|last|prior)/i,
  /(?:return|go)\s+to\s+(?:the\s+)?(?:previous|last|prior)\s+(?:question|one|problem)/i,
  /(?:can|could)\s+(?:we|you|i)\s+(?:go|move|get)\s+back/i,
  /(?:let'?s|please|i\s+(?:want|need)\s+to)\s+(?:go|move|get)\s+back/i,
  /(?:revisit|re-visit)\s+(?:the\s+)?(?:previous|last|prior)/i,
  /previous\s+question/i,
  /(?:回到|返回|回去)(?:上一(?:个问题|题)|之前(?:的问题|那题))/,
  /(?:我(?:想|要|需要)|请|可以)(?:回到|返回|回去)上一/,
];

const IMPLICIT_NEXT_PATTERNS = [
  /let'?s\s+(?:move|proceed|go)\s+(?:on|forward)\s+(?:to\s+)?(?:the\s+)?next/i,
  /(?:move|proceed|go)\s+to\s+the\s+next\s+question/i,
  /we(?:'ll|\s+will)\s+(?:move|proceed|go)\s+(?:on|to\s+the\s+next)/i,
  /我们(?:进入|开始|来看)下一(?:个问题|题)/,
  /(?:进入|开始)下一(?:个问题|题)/,
  /那我们(?:继续|进入)下一/,
];

function hasImplicitTransition(text: string): boolean {
  return IMPLICIT_NEXT_PATTERNS.some((p) => p.test(text));
}

const IMPLICIT_PREV_PATTERNS = [
  /(?:go|going)\s+back\s+to\s+(?:the\s+)?previous/i,
  /(?:return|returning)\s+to\s+(?:the\s+)?previous/i,
  /(?:revisit|re-visit)\s+(?:the\s+)?previous/i,
  /(?:let'?s|we(?:'ll|\s+can))\s+(?:go\s+back|return|revisit)/i,
  /(?:回到|返回|回去)(?:上一(?:个问题|题)|之前(?:的问题|那题))/,
  /我们(?:回到|返回)上一/,
];

function hasImplicitPrevTransition(text: string): boolean {
  return IMPLICIT_PREV_PATTERNS.some((p) => p.test(text));
}

function looksLikeQuestion(text: string): boolean {
  if (/[？?]/.test(text)) return true;
  if (/\b(?:could|can|would)\s+you\s+(?:share|explain|elaborate|describe|tell|walk|talk|give|provide)/i.test(text)) return true;
  if (/\bplease\s+(?:share|explain|elaborate|describe|tell|walk|talk|give|provide)/i.test(text)) return true;
  if (/\b(?:how|what|why|where|when)\s+(?:do|did|does|would|could|can|will|is|are|was|were)\s+(?:you|they|the|this|that|it)\b/i.test(text)) return true;
  if (/请.{0,4}(?:分享|描述|解释|说明|告诉|讲述?|谈谈?)/.test(text)) return true;
  if (/能否.{0,4}(?:分享|描述|解释|说明|告诉|讲述?|谈谈?)/.test(text)) return true;
  return false;
}

function replyKeepsConversationOpen(text: string, isZh: boolean): boolean {
  return looksLikeQuestion(text) || responseInvitesUserReply(text, isZh);
}

function isFastNextRequest(text: string): boolean {
  const t = text.trim();
  return FAST_NEXT_PATTERNS.some((p) => p.test(t));
}

function isFastPrevRequest(text: string): boolean {
  const t = text.trim();
  return FAST_PREV_PATTERNS.some((p) => p.test(t));
}

function isUserPrevRequest(text: string): boolean {
  return USER_PREV_PATTERNS.some((p) => p.test(text));
}

let lastContinuationFragmentLog: { text: string; at: number } | null = null;
function logContinuationFragmentIgnored(text: string): void {
  const t = text.trim();
  const now = Date.now();
  if (
    lastContinuationFragmentLog &&
    lastContinuationFragmentLog.text === t &&
    now - lastContinuationFragmentLog.at < 2_000
  ) {
    return;
  }
  lastContinuationFragmentLog = { text: t, at: now };
  log.info(
    `ASR split-noise: ignoring short follow-up final after long user turn: "${t.slice(0, 72)}..."`,
  );
}

/**
 * Volc often emits a second definite soon after the first — a tail fragment or noise — especially
 * after a short TTS segment. If the new final arrives soon after the latest *transcript* assistant
 * line, treat obvious mid-phrase tails as noise; after SPLIT_NOISE_MIN_PAUSE_AFTER_ASSISTANT_MS,
 * the same text is handled as a real user reply (pause-based, no keyword allowlist).
 */
function shouldIgnoreVolcContinuationFragment(
  text: string,
  transcript: TranscriptEntry[],
  lastAssistantMessageAtMs: number,
  isZhLocale: boolean,
): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if (
    isUserEndRequest(t) ||
    isUserSkipRequest(t) ||
    isFastNextRequest(t) ||
    isFastPrevRequest(t) ||
    isUserPrevRequest(t)
  ) {
    return false;
  }

  const now = Date.now();
  if (lastAssistantMessageAtMs <= 0) return false;
  const pauseAfterAssistant = now - lastAssistantMessageAtMs;
  if (pauseAfterAssistant >= SPLIT_NOISE_MIN_PAUSE_AFTER_ASSISTANT_MS) return false;

  let lastUserIdx = -1;
  for (let i = transcript.length - 1; i >= 0; i--) {
    if (transcript[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx < 0) return false;

  const lastUser = transcript[lastUserIdx].text.trim();
  const hadAssistantAfter = transcript
    .slice(lastUserIdx + 1)
    .some((e) => e.role === "assistant");
  if (!hadAssistantAfter) return false;

  if (isZhLocale) {
    const compactLast = lastUser.replace(/\s+/g, "");
    const compactT = t.replace(/\s+/g, "");
    if (compactLast.length < 40) return false;
    if (compactT.length < 8 || compactT.length > 36) return false;
  } else {
    if (lastUser.length < 70) return false;
    const wc = t.split(/\s+/).filter(Boolean).length;
    if (t.length > 52 || wc > 8) return false;

    const looksLikeMidPhraseTail =
      /^(?:and|or|but|if|for|to)\s+/i.test(t) ||
      /^(?:the|a|an)\s+\w+\s*\.?\s*$/i.test(t);

    if (!looksLikeMidPhraseTail) return false;
  }

  logContinuationFragmentIgnored(t);
  return true;
}

// ── Build prompts from interview context ─────────────────────────────

function isChineseInterview(ctx: InterviewContext): boolean {
  return (
    ctx.language === "zh" || ctx.language.toLowerCase().includes("chinese")
  );
}

function buildChoiceSuffix(
  type: string,
  opts: { options: string[]; allowMultiple?: boolean } | null | undefined,
  isZh: boolean,
): string {
  if (
    (type !== "SINGLE_CHOICE" && type !== "MULTIPLE_CHOICE") ||
    !opts?.options?.length
  ) {
    return "";
  }
  const labels = opts.options
    .map((o, i) => `${String.fromCharCode(65 + i)}, ${o}`)
    .join("; ");
  return bt(isZh, type === "MULTIPLE_CHOICE"
    ? SPOKEN.multipleChoiceSuffix(labels)
    : SPOKEN.singleChoiceSuffix(labels));
}

function buildGreeting(ctx: InterviewContext): string {
  const isZh = isChineseInterview(ctx);
  const firstQ = ctx.questions.sort((a, b) => a.order - b.order)[0];
  const q1Text = firstQ?.text || bt(isZh, SPOKEN.defaultQuestion);

  const opts = firstQ?.options as { options: string[]; allowMultiple?: boolean } | null | undefined;
  const isCodingOrWb = firstQ && (firstQ.type === "CODING" || firstQ.type === "WHITEBOARD");
  const spokenQuestion = isCodingOrWb
    ? bt(isZh, SPOKEN.codingWbIntro(firstQ.type))
    : `${q1Text}${buildChoiceSuffix(firstQ?.type ?? "", opts, isZh)}`;

  return bt(isZh, SPOKEN.greeting(ctx.aiName, ctx.title, ctx.questions.length, spokenQuestion));
}

function buildTransitionSayHello(
  questionIndex: number,
  nextQuestion: { text: string; type: string; options?: { options: string[]; allowMultiple?: boolean } | null },
  isZh: boolean
): string {
  const isCodingOrWb = nextQuestion.type === "CODING" || nextQuestion.type === "WHITEBOARD";
  const opts = nextQuestion.options as { options: string[]; allowMultiple?: boolean } | null | undefined;
  const qNum = questionIndex + 1;

  if (isCodingOrWb) {
    return bt(isZh, SPOKEN.transition.codingWb(qNum, bt(isZh, SPOKEN.codingWbIntro(nextQuestion.type))));
  }
  return bt(isZh, SPOKEN.transition.normal(qNum, nextQuestion.text, buildChoiceSuffix(nextQuestion.type, opts, isZh)));
}

function buildResumeGreeting(ctx: InterviewContext, questionIndex: number): string {
  const isZh = isChineseInterview(ctx);
  const sortedQs = ctx.questions.sort((a, b) => a.order - b.order);
  const q = sortedQs[questionIndex];
  const qNum = questionIndex + 1;

  const opts = q?.options as { options: string[]; allowMultiple?: boolean } | null | undefined;
  const isCodingOrWb = q && (q.type === "CODING" || q.type === "WHITEBOARD");

  if (isCodingOrWb) {
    return bt(isZh, SPOKEN.resume.codingWb(qNum, bt(isZh, SPOKEN.codingWbIntro(q.type))));
  }
  return bt(isZh, SPOKEN.resume.normal(qNum, q?.text || "", buildChoiceSuffix(q?.type ?? "", opts, isZh)));
}

function buildReturnSayHello(
  questionIndex: number,
  question: { text: string; type: string; options?: { options: string[]; allowMultiple?: boolean } | null },
  isZh: boolean
): string {
  const isCodingOrWb = question.type === "CODING" || question.type === "WHITEBOARD";
  const qNum = questionIndex + 1;

  if (isCodingOrWb) {
    return bt(isZh, SPOKEN.returnTo.codingWb(qNum, bt(isZh, SPOKEN.codingWbIntro(question.type, "continue"))));
  }

  const opts = question.options as { options: string[]; allowMultiple?: boolean } | null | undefined;
  let optionsSuffix = "";
  const isChoice = question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE";
  if (isChoice && opts?.options?.length) {
    const labels = opts.options.map((o, i) => `${String.fromCharCode(65 + i)}, ${o}`).join("; ");
    optionsSuffix = bt(isZh, SPOKEN.optionsList(labels));
  }
  return bt(isZh, SPOKEN.returnTo.normal(qNum, question.text, optionsSuffix));
}

function buildWrapUpSayHello(isZh: boolean): string {
  return bt(isZh, SPOKEN.wrapUp);
}

function buildFarewellSayHello(isZh: boolean): string {
  return bt(isZh, SPOKEN.farewell);
}

async function summarizeQuestion(
  questionText: string,
  transcript: TranscriptEntry[],
  isZh: boolean
): Promise<string> {
  if (transcript.length === 0) return "";

  const t = transcript
    .map((m) => `${m.role === "user" ? "Participant" : "Interviewer"}: ${m.text}`)
    .join("\n");

  try {
    const result = await callRelayLLM(bt(isZh, PROMPTS.summarize(questionText, t)));
    log.info(`Q summary: "${result.slice(0, 100)}..."`);
    return result;
  } catch (err) {
    log.error("LLM summarization failed:", err);
    return bt(isZh, PROMPTS.summaryError);
  }
}

// ── Relay server ────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: RELAY_PORT });
log.info(`ASR: resource=${ASR_RESOURCE_ID}, auth=${ASR_API_KEY ? `X-Api-Key(${ASR_API_KEY.slice(0, 8)}...)` : "AppKey+AccessKey"}`);
log.info(`ASR VAD: end_window_size=${ASR_END_WINDOW_MS}ms, force_to_speech=${ASR_FORCE_SPEECH_MS}ms`);
log.info(`ASR final coalescing: normal=${ASR_FINAL_COALESCE_MS}ms, long=${ASR_LONG_FINAL_COALESCE_MS}ms, quiet=${ASR_PENDING_FINAL_QUIET_MS}ms, active_speech_hold=${ASR_ACTIVE_SPEECH_HOLD_MS}ms, max_active_hold=${ASR_MAX_ACTIVE_SPEECH_HOLD_MS}ms, session_max_speech=${ASR_SESSION_MAX_CONTINUOUS_SPEECH_MS}ms, stuck_rotate=${ASR_STUCK_TEXT_ROTATE_MS}ms`);
const ttsAuthResolved = getTtsAuth();
log.info(`TTS: resource=${ttsAuthResolved.resourceId}, auth=${ttsAuthResolved.apiKey ? `X-Api-Key(${ttsAuthResolved.apiKey.slice(0, 8)}...)` : "AppId+AccessKey"}`);
if (VISION_LLM_API_KEY) {
  log.info(
    `Vision LLM: ${VISION_LLM_MODEL}${VISION_LLM_RETRY_MODEL !== VISION_LLM_MODEL ? ` (retry: ${VISION_LLM_RETRY_MODEL})` : ""}, max_tokens=${VISION_LLM_MAX_TOKENS}`,
  );
}
logRelayLlmStartup();
log.info(`Listening on ws://localhost:${RELAY_PORT}`);

wss.on("connection", (browserWs) => {
  log.info("Browser connected, waiting for init...");

  const timeout = setTimeout(() => {
    log.error("No init message received within 10s");
    browserWs.close();
  }, 10000);

  const handler = (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "mic_test") {
        clearTimeout(timeout);
        browserWs.removeListener("message", handler);
        handleMicTestConnection(browserWs);
      } else if (msg.type === "init" && msg.context) {
        clearTimeout(timeout);
        browserWs.removeListener("message", handler);
        handleBrowserConnection(browserWs, msg.context as InterviewContext);
      }
    } catch {
      // Not JSON, ignore
    }
  };
  browserWs.on("message", handler);
});

// ── Mic test handler (ASR-only, no LLM/TTS) ────────────────────────

async function handleMicTestConnection(browserWs: WebSocket) {
  log.info("Mic test mode");

  let asrWs: WebSocket | null = null;
  let asrAlive = false;
  let asrAudioSeq = 1;
  let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  let asrAccumulator = "";
  let intentionalClose = false;
  let asrReconnecting = false;

  const autoTimeout = setTimeout(() => {
    log.info("Mic test auto-timeout");
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ type: "timeout" }));
    }
    cleanup();
  }, 10 * 60 * 1000);

  function cleanup() {
    intentionalClose = true;
    clearTimeout(autoTimeout);
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
    if (asrAlive && asrWs && asrWs.readyState === WebSocket.OPEN) {
      try {
        asrAudioSeq++;
        asrWs.send(buildBigModelAudioRequest(Buffer.alloc(0), asrAudioSeq, true));
      } catch { /* ignore */ }
    }
    asrWs?.removeAllListeners();
    asrWs?.close();
    asrWs = null;
    asrAlive = false;
  }

  function bindAsrMessageHandlers(ws: WebSocket) {
    ws.on("message", (data: Buffer) => {
      try {
        const resp = parseAsrResponse(Buffer.from(data));

        if (resp.errorCode != null) {
          log.error(`Mic test ASR error: ${resp.errorCode} ${resp.errorMessage}`);
          return;
        }

        if (resp.utterances) {
          for (const utt of resp.utterances) {
            if (utt.text) {
              asrAccumulator = utt.text;
              if (browserWs.readyState === WebSocket.OPEN) {
                browserWs.send(JSON.stringify({
                  type: "asr",
                  data: { results: [{ text: utt.text, definite: utt.definite }] },
                }));
              }
              if (utt.definite) {
                if (browserWs.readyState === WebSocket.OPEN) {
                  browserWs.send(JSON.stringify({ type: "asr_ended", text: asrAccumulator.trim() }));
                }
                asrAccumulator = "";
              }
            }
          }
        } else if (resp.text) {
          asrAccumulator = resp.text;
          if (browserWs.readyState === WebSocket.OPEN) {
            browserWs.send(JSON.stringify({
              type: "asr",
              data: { results: [{ text: resp.text, definite: resp.isLastPackage }] },
            }));
          }
          if (resp.isLastPackage) {
            if (browserWs.readyState === WebSocket.OPEN) {
              browserWs.send(JSON.stringify({ type: "asr_ended", text: asrAccumulator.trim() }));
            }
            asrAccumulator = "";
          }
        }
      } catch (err) {
        log.error("Mic test ASR parse error:", err);
      }
    });

    ws.on("error", (err: Error) => {
      log.error("Mic test ASR error:", err.message);
    });

    ws.on("close", () => {
      asrAlive = false;
      asrWs = null;
      if (intentionalClose || browserWs.readyState !== WebSocket.OPEN || asrReconnecting) {
        return;
      }
      asrReconnecting = true;
      log.info("Mic test ASR closed — reconnecting for continuous transcription");
      void connectMicTestAsr(false)
        .catch((err) => {
          log.error("Mic test ASR reconnect failed:", err);
          if (browserWs.readyState === WebSocket.OPEN) {
            browserWs.send(JSON.stringify({ type: "disconnected" }));
          }
        })
        .finally(() => {
          asrReconnecting = false;
        });
    });
  }

  async function connectMicTestAsr(isInitial: boolean): Promise<void> {
    if (asrWs) {
      asrWs.removeAllListeners();
      try {
        asrWs.close();
      } catch { /* ignore */ }
      asrWs = null;
      asrAlive = false;
    }

    const reqid = randomUUID().replace(/-/g, "");
    const asrConfig: BigModelAsrConfig = {
      format: "pcm", rate: 16000, bits: 16, channels: 1, codec: "raw",
      showUtterance: true, resultType: "full", enablePunc: true,
      endWindowSize: ASR_END_WINDOW_MS,
      forceToSpeechTime: ASR_FORCE_SPEECH_MS,
    };

    const wsHeaders = buildBigModelHeaders(
      ASR_APP_ID, ASR_ACCESS_TOKEN, reqid, ASR_RESOURCE_ID,
      ASR_API_KEY || undefined,
    );
    const nextWs = new WebSocket(BIGMODEL_ASR_URL, { headers: wsHeaders });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("ASR connect timeout")), 10000);
      nextWs.on("open", () => { clearTimeout(t); resolve(); });
      nextWs.on("error", (e) => { clearTimeout(t); reject(e); });
      nextWs.on("unexpected-response", (_req, res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => {
          clearTimeout(t);
          log.error(`Mic test ASR rejected: HTTP ${res.statusCode} — ${body}`);
          reject(new Error(`ASR server responded ${res.statusCode}: ${body}`));
        });
      });
    });

    asrWs = nextWs;
    asrWs.send(buildBigModelFullRequest(asrConfig, reqid));
    asrAlive = true;
    bindAsrMessageHandlers(asrWs);
    log.info(`Mic test ASR connected${isInitial ? "" : " (reconnected)"}`);

    if (isInitial && browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ type: "ready" }));
    }
  }

  browserWs.on("message", (data) => {
    if (!asrWs || asrWs.readyState !== WebSocket.OPEN || !asrAlive) return;
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "audio" && msg.data) {
        asrAudioSeq++;
        asrWs.send(buildBigModelAudioRequest(Buffer.from(msg.data, "hex"), asrAudioSeq));
      }
    } catch { /* ignore */ }
  });

  browserWs.on("close", () => {
    log.info("Mic test: browser disconnected");
    cleanup();
  });

  try {
    await connectMicTestAsr(true);

    keepAliveInterval = setInterval(() => {
      if (!asrAlive || !asrWs || asrWs.readyState !== WebSocket.OPEN) {
        return;
      }
      asrAudioSeq++;
      asrWs.send(buildBigModelAudioRequest(Buffer.alloc(3200), asrAudioSeq));
    }, 5000);
  } catch (err) {
    log.error("Mic test connection failed:", err);
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({
        type: "error",
        message: `Mic test failed: ${err instanceof Error ? err.message : String(err)}`,
      }));
    }
    browserWs.close();
    cleanup();
  }
}

// ── Interview handler ───────────────────────────────────────────────

async function handleBrowserConnection(browserWs: WebSocket, ctx: InterviewContext) {
  // ── ASR state ──────────────────────────────────────────────────
  let asrWs: WebSocket | null = null;
  let asrAlive = false;
  let asrAudioSeq = 1;
  let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

  // ── TTS state ──────────────────────────────────────────────────
  let ttsAbortController: AbortController | null = null;
  let ttsSpeaking = false;

  // When true, definite ASR results are dropped (only used for barge-in).
  // Set during LLM generation + TTS playback to prevent echo loops.
  // Cleared after barge-in or when the response cycle finishes.
  let suppressAsrResults = false;
  /** Definite user text captured while suppressAsrResults (flushed after reopenAsr). */
  let pendingUserUtteranceWhileSuppressed = "";
  /** User final arrived while handleUserUtterance was already running (asr_ended already sent to client). */
  let queuedUserUtteranceWhileGenerating = "";

  // ── Per-question state ──────────────────────────────────────────
  let currentQuestionIndex = 0;
  const questionSummaries: string[] = [];
  let questionTranscript: TranscriptEntry[] = [];
  let asrAccumulator = "";
  let pendingAsrFinalText = "";
  let pendingAsrFinalTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingAsrFinalStartedAt = 0;
  let pendingAsrFinalLastChangedAt = 0;
  let lastUserAudioActivityAt = 0;
  let asrSessionFirstSpeechAt = 0;
  let lastAsrStuckRotationAt = 0;
  let consecutiveDuplicateSkips = 0;
  let heldBargeInInterimText = "";
  let heldBargeInInterimTimer: ReturnType<typeof setTimeout> | null = null;
  let isTransitioning = false;
  let transitionGeneration = 0;
  let pendingManualTransitionDirection: "next" | "previous" | null = null;
  let interviewDone = false;
  /** True as soon as we start farewell shutdown; blocks duplicate ASR finals until interviewDone. */
  let endingInterview = false;

  // ── Agent context state ────────────────────────────────────────
  let currentCodeContent = "";
  let currentCodeLanguage = "plaintext";
  let latestWhiteboardImage = "";
  let whiteboardDirty = false;
  let cachedWhiteboardDescription = "";
  let lastResponseWasCorrection = false;
  const recentAgentResponses: string[] = [];
  let pendingWhiteboardVision = false;
  const pendingWhiteboardSnapshotRequests = new Map<string, (hasImage: boolean) => void>();

  // ── Final-response state ──────────────────────────────────────
  let awaitingFinalResponse = false;
  let finalResponseTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingLastQuestionTimeout: ReturnType<typeof setTimeout> | null = null;

  // ── LLM-controlled response state ─────────────────────────────
  let generatingResponse = false;
  let userTurnsOnCurrentQ = 0;
  /** Wall time when the latest assistant line was appended to questionTranscript (split-noise heuristic). */
  let lastAssistantMessageWallClockMs = 0;
  const recentAcceptedUserFinals: RecentAsrFinal[] = [];

  function rememberAcceptedUserFinal(text: string) {
    const finalText = text.replace(/\s+/g, " ").trim();
    if (!finalText) return;

    const last = recentAcceptedUserFinals[recentAcceptedUserFinals.length - 1];
    if (last && shouldSuppressAnsweredAsrFinal(last.text, finalText)) {
      last.text = mergeAsrSegments(last.text, finalText);
      last.at = Date.now();
      return;
    }

    recentAcceptedUserFinals.push({ text: finalText, at: Date.now() });
    while (recentAcceptedUserFinals.length > 8) recentAcceptedUserFinals.shift();
  }

  function shouldSuppressRecentUserFinalReplay(text: string): boolean {
    const currentQuestionAlreadyHasUser = questionTranscript.some((entry) => entry.role === "user");
    if (currentQuestionAlreadyHasUser && !generatingResponse && !suppressAsrResults && !isTransitioning) {
      return false;
    }

    return shouldSuppressRecentAsrFinal(
      text,
      recentAcceptedUserFinals,
      Date.now(),
      {
        ttlMs: ASR_RECENT_FINAL_REPLAY_TTL_MS,
        minComparisonUnits: ASR_RECENT_FINAL_REPLAY_MIN_UNITS,
      },
    );
  }

  function settleWhiteboardSnapshotRequest(requestId: string, hasImage: boolean) {
    const resolve = pendingWhiteboardSnapshotRequests.get(requestId);
    if (!resolve) return;
    pendingWhiteboardSnapshotRequests.delete(requestId);
    resolve(hasImage);
  }

  function settleAllWhiteboardSnapshotRequests(hasImage: boolean) {
    for (const [requestId, resolve] of Array.from(pendingWhiteboardSnapshotRequests.entries())) {
      pendingWhiteboardSnapshotRequests.delete(requestId);
      resolve(hasImage);
    }
  }

  async function requestFreshWhiteboardSnapshot(reason: string): Promise<boolean> {
    if (browserWs.readyState !== WebSocket.OPEN) return false;

    const requestId = randomUUID();
    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        pendingWhiteboardSnapshotRequests.delete(requestId);
        log.warn(`Whiteboard snapshot request timed out (${reason})`);
        resolve(false);
      }, WHITEBOARD_SNAPSHOT_REQUEST_TIMEOUT_MS);

      pendingWhiteboardSnapshotRequests.set(requestId, (hasImage) => {
        clearTimeout(timer);
        resolve(hasImage);
      });

      browserWs.send(JSON.stringify({
        type: "whiteboard_snapshot_request",
        requestId,
        reason,
      }));
    });
  }

  const sortedQuestions = ctx.questions.sort((a, b) => a.order - b.order);
  const configIsZh = isChineseInterview(ctx);
  let isZh = configIsZh;

  const userLangSamples: string[] = [];
  function updateUserLanguage(text: string) {
    if (!text || text.length < 3) return;
    userLangSamples.push(text);
    if (userLangSamples.length > 5) userLangSamples.shift();

    const combined = userLangSamples.join(" ");
    const cjkChars = (combined.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const totalChars = combined.replace(/\s+/g, "").length;
    if (totalChars === 0) return;

    const cjkRatio = cjkChars / totalChars;
    const detectedZh = cjkRatio > 0.3;
    if (detectedZh !== isZh) {
      isZh = detectedZh;
      log.info(`User language detected: ${detectedZh ? "zh" : "en"} (CJK ratio: ${(cjkRatio * 100).toFixed(0)}%, overriding config=${configIsZh ? "zh" : "en"})`);
    }
  }

  const startIdx = ctx.startQuestionIndex ?? 0;
  if (startIdx > 0 && startIdx < sortedQuestions.length) {
    currentQuestionIndex = startIdx;
  }

  let maxFollowUps: number;
  switch (ctx.followUpDepth) {
    case "LIGHT":   maxFollowUps = 2; break;
    case "MODERATE": maxFollowUps = 7; break;
    case "DEEP":    maxFollowUps = 8; break;
    default:        maxFollowUps = 2;
  }

  log.info(
    `Interview: "${ctx.title}" (${sortedQuestions.length} questions, lang=${ctx.language}, startQ=${currentQuestionIndex})`
  );

  const NEXT_TOKEN = "[NEXT]";
  const PREV_TOKEN = "[PREV]";

  function clearPendingAsrFinal() {
    if (pendingAsrFinalTimer) {
      clearTimeout(pendingAsrFinalTimer);
      pendingAsrFinalTimer = null;
    }
    pendingAsrFinalText = "";
    pendingAsrFinalStartedAt = 0;
    pendingAsrFinalLastChangedAt = 0;
  }

  function clearHeldBargeInInterim() {
    if (heldBargeInInterimTimer) {
      clearTimeout(heldBargeInInterimTimer);
      heldBargeInInterimTimer = null;
    }
    heldBargeInInterimText = "";
  }

  function getAsrFinalCoalesceDelay(text: string): number {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const terminalPunctuation = /[.?!。？！]\s*$/.test(text);
    const looksShortAndComplete =
      wordCount <= 9 &&
      terminalPunctuation &&
      (/[?？]\s*$/.test(text) || /\b(?:yes|yeah|yep|no|okay|ok|hello|hi)\b/i.test(text));

    if (looksShortAndComplete) return ASR_SHORT_FINAL_COALESCE_MS;
    if (wordCount >= 18 || text.length >= 120) return ASR_LONG_FINAL_COALESCE_MS;
    return ASR_FINAL_COALESCE_MS;
  }

  function noteIncomingAudioActivity(pcm: Buffer) {
    if (pcm.length < 2) return;

    let sumSq = 0;
    let samples = 0;
    for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
      const sample = pcm.readInt16LE(offset) / 32768;
      sumSq += sample * sample;
      samples++;
    }
    if (samples === 0) return;

    const rms = Math.sqrt(sumSq / samples);
    if (rms >= ASR_AUDIO_ACTIVITY_RMS_THRESHOLD) {
      lastUserAudioActivityAt = Date.now();
    }
  }

  function shouldHoldPendingAsrFinalForActiveSpeech(finalText: string): boolean {
    if (!finalText || ASR_ACTIVE_SPEECH_HOLD_MS <= 0) return false;
    const wordCount = finalText.split(/\s+/).filter(Boolean).length;
    if (wordCount < 12 && finalText.length < 80) return false;
    const heldForMs = pendingAsrFinalStartedAt ? Date.now() - pendingAsrFinalStartedAt : 0;
    const recentlyChanged =
      pendingAsrFinalLastChangedAt > 0 &&
      Date.now() - pendingAsrFinalLastChangedAt < ASR_PENDING_FINAL_QUIET_MS;
    if (recentlyChanged) return true;

    const micStillActive = Date.now() - lastUserAudioActivityAt < ASR_ACTIVE_SPEECH_HOLD_MS;
    if (!micStillActive) return false;

    if (ASR_MAX_ACTIVE_SPEECH_HOLD_MS > 0 && heldForMs > ASR_MAX_ACTIVE_SPEECH_HOLD_MS) {
      log.warn(
        `ASR active-speech hold exceeded ${ASR_MAX_ACTIVE_SPEECH_HOLD_MS}ms; committing pending final`,
      );
      return false;
    }

    const textStuckMs =
      pendingAsrFinalLastChangedAt > 0
        ? Date.now() - pendingAsrFinalLastChangedAt
        : 0;
    const sinceLastStuckRotation = lastAsrStuckRotationAt > 0
      ? Date.now() - lastAsrStuckRotationAt
      : Infinity;
    if (
      ASR_STUCK_TEXT_ROTATE_MS > 0 &&
      textStuckMs >= ASR_STUCK_TEXT_ROTATE_MS &&
      sinceLastStuckRotation >= ASR_STUCK_TEXT_ROTATE_MS
    ) {
      log.warn(
        `ASR text stuck for ${textStuckMs}ms while mic active; rotating ASR session to recover`,
      );
      lastAsrStuckRotationAt = Date.now();
      rotateAsrSession();
      return true;
    }

    if (
      ASR_SESSION_MAX_CONTINUOUS_SPEECH_MS > 0 &&
      asrSessionFirstSpeechAt > 0 &&
      Date.now() - asrSessionFirstSpeechAt > ASR_SESSION_MAX_CONTINUOUS_SPEECH_MS
    ) {
      log.warn(
        `ASR session continuous speech exceeded ${ASR_SESSION_MAX_CONTINUOUS_SPEECH_MS}ms; rotating ASR session (keeping pending text)`,
      );
      rotateAsrSession();
      return true;
    }

    return true;
  }

  /**
   * Disconnect and reconnect the ASR engine WITHOUT clearing pendingAsrFinalText.
   * Prevents mid-sentence cutoff while refreshing a degraded ASR session.
   */
  function rotateAsrSession() {
    asrIntentionalClose = true;
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
    if (asrWs && asrWs.readyState === WebSocket.OPEN && asrAlive) {
      try {
        asrAudioSeq++;
        asrWs.send(buildBigModelAudioRequest(Buffer.alloc(0), asrAudioSeq, true));
      } catch { /* ignore */ }
    }
    if (asrWs) {
      asrWs.removeAllListeners();
      try { asrWs.close(); } catch { /* ignore */ }
    }
    asrWs = null;
    asrAlive = false;
    asrAccumulator = "";
    asrSessionFirstSpeechAt = 0;
    connectAsr().catch(log.error);
  }

  function flushHeldBargeInInterim(reason: string) {
    const rawText = heldBargeInInterimText.trim();
    clearHeldBargeInInterim();

    if (!rawText || rawText.length < 2 || interviewDone || endingInterview || isTransitioning) return;

    let finalText = collapseInternalAsrRepetitions(rawText);

    const lastUserTurn = [...questionTranscript].reverse().find((e) => e.role === "user");
    if (lastUserTurn) {
      finalText = trimCrossTurnOverlap(lastUserTurn.text, finalText);
      if (!finalText.trim()) return;
    }

    log.info(`ASR barge-in interim promoted (${reason}): "${finalText.slice(0, 80)}"`);
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ type: "asr_ended", text: finalText }));
    }
    handleUserUtterance(finalText, { allowRecentReplay: true }).catch(log.error);
  }

  function holdBargeInInterim(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 2) return;

    heldBargeInInterimText = heldBargeInInterimText
      ? mergeAsrSegments(heldBargeInInterimText, trimmed)
      : trimmed;

    if (heldBargeInInterimTimer) {
      clearTimeout(heldBargeInInterimTimer);
    }
    heldBargeInInterimTimer = setTimeout(() => {
      flushHeldBargeInInterim("no-final-after-barge-in");
    }, ASR_FINAL_COALESCE_MS);
  }

  function sendAsrInterim(text: string) {
    if (browserWs.readyState !== WebSocket.OPEN) return;
    browserWs.send(JSON.stringify({
      type: "asr",
      data: { results: [{ text, definite: false }] },
    }));
  }

  function sendAsrPending(text: string, delayMs: number) {
    if (browserWs.readyState !== WebSocket.OPEN) return;
    browserWs.send(JSON.stringify({
      type: "asr_pending",
      text,
      delayMs,
    }));
  }

  function flushPendingAsrFinal(reason: string) {
    const rawText = pendingAsrFinalText.trim();
    if (!rawText || rawText.length < 2 || interviewDone || endingInterview || isTransitioning) {
      clearPendingAsrFinal();
      return;
    }

    if (shouldHoldPendingAsrFinalForActiveSpeech(rawText)) {
      if (pendingAsrFinalTimer) {
        clearTimeout(pendingAsrFinalTimer);
      }
      pendingAsrFinalTimer = setTimeout(() => {
        flushPendingAsrFinal(`${reason}, active speech guard`);
      }, ASR_ACTIVE_SPEECH_HOLD_MS);
      log.info(
        `ASR final held (${reason}, speech not settled): "${rawText.slice(0, 80)}"`,
      );
      return;
    }

    clearPendingAsrFinal();

    let finalText = collapseInternalAsrRepetitions(rawText);

    const lastUserTurn = [...questionTranscript].reverse().find((e) => e.role === "user");
    if (lastUserTurn) {
      finalText = trimCrossTurnOverlap(lastUserTurn.text, finalText);
      if (!finalText.trim()) return;
    }

    if (
      shouldIgnoreVolcContinuationFragment(
        finalText,
        questionTranscript,
        lastAssistantMessageWallClockMs,
        isZh,
      )
    ) {
      return;
    }

    if (isDuplicateUserFinal(finalText)) {
      consecutiveDuplicateSkips++;
      log.info(`ASR FINAL (${reason}) skipped — duplicate of answered turn: "${finalText.slice(0, 72)}..."`);
      if (consecutiveDuplicateSkips >= 2) {
        log.warn(`ASR stuck: ${consecutiveDuplicateSkips} consecutive duplicate skips — forcing reconnection`);
        consecutiveDuplicateSkips = 0;
        disconnectAsr();
        connectAsr().catch(log.error);
      }
      return;
    }

    consecutiveDuplicateSkips = 0;
    log.info(`ASR FINAL (${reason}): "${finalText.slice(0, 80)}"`);

    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ type: "asr_ended", text: finalText }));
    }

    handleUserUtterance(finalText).catch(log.error);
  }

  function schedulePendingAsrFinal(text: string, reason: string) {
    const prev = pendingAsrFinalText;
    const merged = mergeAsrSegments(pendingAsrFinalText, text);
    const unchanged =
      !!prev &&
      normalizeUserUtteranceKey(prev) === normalizeUserUtteranceKey(merged);

    if (unchanged && pendingAsrFinalTimer) {
      log.debug(`ASR duplicate definite while pending: "${merged.slice(0, 80)}"`);
      return;
    }

    pendingAsrFinalText = merged;
    pendingAsrFinalLastChangedAt = Date.now();
    if (!pendingAsrFinalStartedAt) {
      pendingAsrFinalStartedAt = pendingAsrFinalLastChangedAt;
    }
    sendAsrInterim(merged);

    if (pendingAsrFinalTimer) {
      clearTimeout(pendingAsrFinalTimer);
    }
    const targetDelay = getAsrFinalCoalesceDelay(merged);
    const elapsed = Date.now() - pendingAsrFinalStartedAt;
    const quietElapsed = Date.now() - pendingAsrFinalLastChangedAt;
    const delay = Math.max(
      0,
      targetDelay - elapsed,
      ASR_PENDING_FINAL_QUIET_MS - quietElapsed,
    );
    pendingAsrFinalTimer = setTimeout(() => {
      flushPendingAsrFinal("coalesced");
    }, delay);
    sendAsrPending(merged, delay);

    log.info(
      `ASR final pending (${reason}, ${delay}ms): "${merged.slice(0, 80)}"`,
    );
  }

  // ── TTS helpers ────────────────────────────────────────────────

  function cancelTts() {
    if (ttsAbortController) {
      ttsAbortController.abort();
      ttsAbortController = null;
    }
    ttsSpeaking = false;
  }

  /**
   * Speak text via TTS 2.0 API, streaming audio chunks to the browser.
   * Returns true if TTS completed without cancellation.
   */
  async function speakText(text: string): Promise<boolean> {
    cancelTts();

    const abortController = new AbortController();
    ttsAbortController = abortController;
    ttsSpeaking = true;

    const ttsOpts = getTtsOptions(ctx.language);
    const auth = getTtsAuth();

    // Interrupt any residual browser-side playback and notify TTS starting
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ type: "interrupt" }));
    }

    let completed = false;
    let totalAudioBytes = 0;
    const streamStartMs = Date.now();
    let sentTranscriptText = false;
    const sendTranscriptTextOnce = () => {
      if (sentTranscriptText || browserWs.readyState !== WebSocket.OPEN) return;
      sentTranscriptText = true;
      browserWs.send(JSON.stringify({ type: "tts_text", data: { text } }));
    };
    try {
      for await (const event of synthesizeSpeech(text, auth, ttsOpts, abortController.signal)) {
        if (abortController.signal.aborted) break;
        if (browserWs.readyState !== WebSocket.OPEN) break;

        if (event.type === "audio" && event.audio) {
          sendTranscriptTextOnce();
          browserWs.send(event.audio, { binary: true });
          totalAudioBytes += event.audio.length;
        } else if (event.type === "sentence_start") {
          // The full response text is sent once the first audio chunk is ready.
        } else if (event.type === "sentence_end") {
          browserWs.send(JSON.stringify({ type: "tts_sentence_end", data: { text: event.text } }));
        } else if (event.type === "error") {
          log.error(`TTS error: ${event.error}`);
          break;
        } else if (event.type === "done") {
          completed = true;
        }
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        log.error("TTS streaming error:", err);
      }
    }

    // Wait for client-side playback to finish before declaring TTS done.
    // Audio is PCM int16 @ 24kHz = 48000 bytes/sec.
    if (completed && !abortController.signal.aborted) {
      const playbackDurationMs = (totalAudioBytes / 48000) * 1000;
      const elapsedMs = Date.now() - streamStartMs;
      const remainingMs = playbackDurationMs - elapsedMs + 300; // +300ms buffer for jitter
      if (remainingMs > 0) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, remainingMs);
          const onAbort = () => { clearTimeout(timer); resolve(); };
          abortController.signal.addEventListener("abort", onAbort, { once: true });
        });
      }
    }

    ttsSpeaking = false;
    if (ttsAbortController === abortController) {
      ttsAbortController = null;
    }

    if (completed && !abortController.signal.aborted && browserWs.readyState === WebSocket.OPEN) {
      sendTranscriptTextOnce();
      browserWs.send(JSON.stringify({ type: "tts_ended" }));
    }

    return completed && !abortController.signal.aborted;
  }

  /**
   * Speak text and handle post-TTS actions (transitions, farewell, etc).
   * This replaces the old S2S SayHello + TTS_ENDED event handling.
   */
  async function speakAndHandle(text: string, options?: {
    trackInTranscript?: boolean;
    pendingTransition?: boolean;
    pendingPrevTransition?: boolean;
    pendingFarewell?: boolean;
    pendingFinalTimeout?: boolean;
  }): Promise<void> {
    const completed = await speakText(text);
    if (!completed) return;

    if (options?.trackInTranscript !== false) {
      questionTranscript.push({ role: "assistant", text });
      lastAssistantMessageWallClockMs = Date.now();
    }

    // Post-TTS actions
    if (options?.pendingFarewell) {
      endInterview();
      return;
    }

    if (options?.pendingFinalTimeout) {
      finalResponseTimeout = setTimeout(() => {
        if (!interviewDone && !awaitingFinalResponse) return;
        awaitingFinalResponse = false;
        if (finalResponseTimeout) {
          clearTimeout(finalResponseTimeout);
          finalResponseTimeout = null;
        }
        const farewell = buildFarewellSayHello(isZh);
        log.info("No final response after timeout, sending farewell");
        speakAndHandle(farewell, { pendingFarewell: true }).catch(log.error);
      }, 15_000);
    }

    if (options?.pendingTransition && !isTransitioning && !interviewDone) {
      const isLastQuestion = currentQuestionIndex >= sortedQuestions.length - 1;
      if (isLastQuestion) {
        log.info("TTS ended on last Q — waiting 15s for user response before wrap-up");
        pendingLastQuestionTimeout = setTimeout(() => {
          pendingLastQuestionTimeout = null;
          if (!isTransitioning && !interviewDone && !generatingResponse) {
            log.info("No user response on last Q — auto-wrapping up");
            handleTransition(true).catch(log.error);
          }
        }, 15_000);
      } else {
        log.info("TTS ended — triggering queued transition");
        handleTransition(true).catch(log.error);
      }
    }

    if (options?.pendingPrevTransition && !isTransitioning && !interviewDone && currentQuestionIndex > 0) {
      log.info("TTS ended — queuing PREV transition after audio flush delay");
      setTimeout(() => {
        handlePreviousTransition(true).catch(log.error);
      }, 1500);
    }
  }

  // ── Interview lifecycle ────────────────────────────────────────

  function endInterview() {
    if (interviewDone) return;
    interviewDone = true;
    clearPendingAsrFinal();
    awaitingFinalResponse = false;
    cancelTts();
    if (finalResponseTimeout) {
      clearTimeout(finalResponseTimeout);
      finalResponseTimeout = null;
    }
    if (pendingLastQuestionTimeout) {
      clearTimeout(pendingLastQuestionTimeout);
      pendingLastQuestionTimeout = null;
    }
    browserWs.send(JSON.stringify({ type: "interview_complete" }));
    log.info("Interview complete signal sent");
  }

  function queueFarewellAndEnd(reason: string) {
    if (interviewDone || endingInterview) return;
    endingInterview = true;

    awaitingFinalResponse = false;
    generatingResponse = false;
    clearPendingAsrFinal();
    cancelTts();

    if (finalResponseTimeout) {
      clearTimeout(finalResponseTimeout);
      finalResponseTimeout = null;
    }
    if (pendingLastQuestionTimeout) {
      clearTimeout(pendingLastQuestionTimeout);
      pendingLastQuestionTimeout = null;
    }

    const currentQ = sortedQuestions[currentQuestionIndex];
    const transcriptSnapshot = [...questionTranscript];
    if (transcriptSnapshot.length > 0) {
      summarizeQuestion(currentQ.text, transcriptSnapshot, isZh)
        .then((summary) => questionSummaries.push(summary))
        .catch(log.error);
    }

    const farewell = buildFarewellSayHello(isZh);
    log.info(reason);

    speakAndHandle(farewell, { pendingFarewell: true }).catch((err) => {
      log.error("Farewell TTS failed:", err);
      endInterview();
    });

    // Safety net
    setTimeout(() => {
      if (!interviewDone) {
        log.warn("Farewell TTS timed out after 10s — forcing interview end");
        endInterview();
      }
    }, 10_000);
  }

  // ── LLM-controlled response generator ─────────────────────────

  async function buildAgentContext(): Promise<AgentContext> {
    const previousContext = questionSummaries
      .map((s, i) => `Q${i + 1} (${sortedQuestions[i]?.text.slice(0, 50)}): ${s}`)
      .join("\n");

    const currentQ = sortedQuestions[currentQuestionIndex];
    const agentCtx: AgentContext = { memory: previousContext };

    if (currentQ.type === "CODING" && currentCodeContent) {
      agentCtx.codeContent = currentCodeContent;
      agentCtx.codeLanguage = currentCodeLanguage;
    }

    if (currentQ.type === "WHITEBOARD") {
      await requestFreshWhiteboardSnapshot("agent_context");

      if (whiteboardDirty && latestWhiteboardImage) {
        log.info(`Whiteboard vision: calling vision LLM (inline wait ${WHITEBOARD_VISION_INLINE_TIMEOUT_MS}ms)`);
        const visionPromise = describeWhiteboard(latestWhiteboardImage, isZh);
        const result = await Promise.race([
          visionPromise.then((desc) => ({ desc, timedOut: false })),
          new Promise<{ desc: string; timedOut: boolean }>((resolve) =>
            setTimeout(() => resolve({ desc: "", timedOut: true }), WHITEBOARD_VISION_INLINE_TIMEOUT_MS)
          ),
        ]);
        if (!result.timedOut && result.desc) {
          cachedWhiteboardDescription = result.desc;
          whiteboardDirty = false;
          log.info(`Whiteboard vision: description ready (${result.desc.length} chars)`);
        } else if (result.timedOut) {
          agentCtx.whiteboardLoading = true;
          pendingWhiteboardVision = true;
          log.info("Whiteboard vision: still running; deferring to two-phase follow-up");
          visionPromise.then((desc) => {
            if (desc) {
              cachedWhiteboardDescription = desc;
              whiteboardDirty = false;
              log.info(`Whiteboard vision: background description ready (${desc.length} chars)`);
            }
            pendingWhiteboardVision = false;
          }).catch(() => { pendingWhiteboardVision = false; });
        } else if (!result.timedOut && !result.desc) {
          agentCtx.whiteboardLoading = true;
          log.info("Whiteboard vision: returned empty (likely API error), treating as loading");
        }
      } else if (!latestWhiteboardImage) {
        log.info("Whiteboard: no image received from frontend yet");
      }

      if (cachedWhiteboardDescription) {
        agentCtx.whiteboardDescription = cachedWhiteboardDescription;
      }
    }

    if (lastResponseWasCorrection) {
      agentCtx.correctionGuard = isZh
        ? "\n**重要：你上一条回复要求受访者重新考虑或修改答案。他们还没有回应你的纠正。等待他们的回答，绝对不要加 [NEXT]。**\n"
        : "\n**IMPORTANT: Your last response asked the participant to reconsider or revise their answer. They have NOT yet responded to your correction. Wait for their answer. Do NOT add [NEXT] under any circumstances.**\n";
    }

    if (recentAgentResponses.length >= 2) {
      const last = recentAgentResponses[recentAgentResponses.length - 1];
      const prev = recentAgentResponses[recentAgentResponses.length - 2];
      if (last && prev && isSimilarResponse(last, prev)) {
        agentCtx.antiRepetition = isZh
          ? `\n**重要：你上面的回复已经重复了（"${last.slice(0, 40)}..."）。你必须用完全不同的方式回应。仔细阅读受访者最后一句话，如果他们在问你问题，请直接回答。不要再说类似的话。不要像结束整场访谈那样告别（除非当前已是最后一题且流程要求收尾）。**\n`
          : `\n**IMPORTANT: Your previous responses have been repetitive ("${last.slice(0, 40)}..."). You MUST respond differently. Read the participant's last message carefully — if they are asking you a question, answer it directly. Do NOT repeat similar phrasing. Do NOT speak as if the entire interview is ending (unless this is truly the final wrap-up for the last question).**\n`;
        log.info("Anti-repetition guard activated");
      }
    }

    return agentCtx;
  }

  function getMaxTokensForQuestion(type: string): number {
    switch (type) {
      case "CODING":
      case "WHITEBOARD":
      case "RESEARCH":
        return 250;
      case "SINGLE_CHOICE":
      case "MULTIPLE_CHOICE":
        return 200;
      default:
        return 150;
    }
  }

  async function generateControlledResponse(opts?: { forceSkip?: boolean }): Promise<string> {
    const forceSkip = opts?.forceSkip ?? false;
    const currentQ = sortedQuestions[currentQuestionIndex];
    const history = PROMPTS.formatHistory(questionTranscript, isZh);
    const agentCtx = await buildAgentContext();
    const latestAnsweredExchange = getLatestAnsweredExchange();

    const qOpts = currentQ.options as { options: string[]; allowMultiple?: boolean } | null | undefined;
    let choiceInstruction = "";
    if (currentQ.type === "SINGLE_CHOICE" && qOpts?.options?.length) {
      const labels = qOpts.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join(", ");
      choiceInstruction = bt(isZh, PROMPTS.choiceInstruction.singleChoice(labels));
    } else if (currentQ.type === "MULTIPLE_CHOICE" && qOpts?.options?.length) {
      const labels = qOpts.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join(", ");
      choiceInstruction = bt(isZh, PROMPTS.choiceInstruction.multipleChoice(labels));
    } else if (currentQ.type === "CODING") {
      choiceInstruction = bt(isZh, PROMPTS.choiceInstruction.coding(NEXT_TOKEN, PREV_TOKEN));
    } else if (currentQ.type === "WHITEBOARD") {
      choiceInstruction = bt(isZh, PROMPTS.choiceInstruction.whiteboard(NEXT_TOKEN, PREV_TOKEN));
    } else if (currentQ.type === "RESEARCH") {
      choiceInstruction = bt(isZh, PROMPTS.choiceInstruction.research(NEXT_TOKEN, PREV_TOKEN));
    }

    const effectiveMaxFollowUps = currentQ.type === "RESEARCH"
      ? Math.max(maxFollowUps, 7)
      : maxFollowUps;
    const followUpsDone = Math.max(0, userTurnsOnCurrentQ - 1);
    const turnsLeft = effectiveMaxFollowUps - followUpsDone;
    let followUpInstruction: string;
    const isCodingOrWhiteboard = currentQ.type === "CODING" || currentQ.type === "WHITEBOARD";

    const followBudgetCtx = {
      isLastQuestion: currentQuestionIndex >= sortedQuestions.length - 1,
    };

    if (forceSkip) {
      const skipOverride = isZh
        ? `⚠️ 受访者已明确要求跳过/进入下一题。你必须简短回应（如"好的，没问题"），然后在回复末尾加上 ${NEXT_TOKEN}。不要试图继续提问或鼓励。`
        : `⚠️ The participant has EXPLICITLY asked to skip / move on to the next question. You MUST briefly acknowledge (e.g. "Sure, no problem") and append ${NEXT_TOKEN} at the end. Do NOT try to help further or ask more questions.`;
      followUpInstruction = skipOverride;
      choiceInstruction = "";
    } else if (lastResponseWasCorrection) {
      followUpInstruction = isZh
        ? `等待受访者回应你的纠正。不要加 ${NEXT_TOKEN}。`
        : `Wait for the participant to respond to your correction. Do NOT add ${NEXT_TOKEN}.`;
    } else if (isCodingOrWhiteboard) {
      followUpInstruction = bt(isZh, PROMPTS.followUp.codingWb(NEXT_TOKEN));
    } else if (turnsLeft <= -1) {
      followUpInstruction = bt(isZh, PROMPTS.followUp.pastLimit(NEXT_TOKEN, followBudgetCtx));
    } else if (turnsLeft <= 0) {
      followUpInstruction = bt(isZh, PROMPTS.followUp.atLimit(NEXT_TOKEN, followBudgetCtx));
    } else if (turnsLeft === 1) {
      followUpInstruction = bt(isZh, PROMPTS.followUp.oneLeft(NEXT_TOKEN));
    } else {
      followUpInstruction = bt(isZh, PROMPTS.followUp.remaining(turnsLeft, NEXT_TOKEN));
    }
    const mustAdvanceForFollowUpLimit =
      !forceSkip &&
      !lastResponseWasCorrection &&
      !isCodingOrWhiteboard &&
      turnsLeft <= 0;

    const promptParams = {
      aiName: ctx.aiName,
      title: ctx.title,
      qNum: currentQuestionIndex + 1,
      totalQs: sortedQuestions.length,
      qText: currentQ.text,
      qDescription: currentQ.description,
      qType: currentQ.type,
      choiceInstruction,
      history,
      followUpInstruction,
      nextToken: NEXT_TOKEN,
      prevToken: PREV_TOKEN,
      userTurns: userTurnsOnCurrentQ,
      previousContext: agentCtx.memory || undefined,
      codeContent: agentCtx.codeContent,
      codeLanguage: agentCtx.codeLanguage,
      whiteboardDescription: agentCtx.whiteboardDescription,
      whiteboardLoading: agentCtx.whiteboardLoading,
      correctionGuard: agentCtx.correctionGuard,
      antiRepetition: agentCtx.antiRepetition,
      recentInterviewerResponses: recentAgentResponses.slice(-3),
      latestInterviewerPrompt: latestAnsweredExchange?.interviewer,
      latestParticipantAnswer: latestAnsweredExchange?.participant,
      forceLanguage: userLangSamples.length > 0 ? (isZh ? "zh" : "en") : undefined,
    };

    const prompt = bt(isZh, isCodingOrWhiteboard
      ? PROMPTS.response.codingWb(promptParams)
      : PROMPTS.response.normal(promptParams));

    const maxTokens = getMaxTokensForQuestion(currentQ.type);
    const startMs = Date.now();
    let response = await callRelayLLM(prompt, maxTokens);

    response = response.replace(/^(追问型|结束型|FOLLOW[- ]?UP|WRAP[- ]?UP)\s*[:：]\s*/i, "").trim();

    const turnBudgetFinalized = finalizeTurnBudgetResponse({
      response,
      nextToken: NEXT_TOKEN,
      mustAdvance: mustAdvanceForFollowUpLimit,
      keepsConversationOpen: replyKeepsConversationOpen(
        response.replace(NEXT_TOKEN, "").replace(PREV_TOKEN, "").trim(),
        isZh,
      ),
      transitionResponse: isZh ? "好的，谢谢你的分享。" : "Thanks for sharing.",
    });
    if (turnBudgetFinalized.changed) {
      log.info("Forced [NEXT] — follow-up limit reached");
      response = turnBudgetFinalized.response;
    }

    if (!forceSkip) {
      if (
        !mustAdvanceForFollowUpLimit &&
        response.includes(NEXT_TOKEN) &&
        replyKeepsConversationOpen(response.replace(NEXT_TOKEN, ""), isZh)
      ) {
        log.info("Stripped [NEXT] — response still invites a participant reply");
        response = response.replace(NEXT_TOKEN, "").trim();
      }

      if (response.includes(NEXT_TOKEN) && userTurnsOnCurrentQ === 0) {
        log.info("Stripped [NEXT] — no user response on this question yet");
        response = response.replace(NEXT_TOKEN, "").trim();
      }

      if (response.includes(NEXT_TOKEN) && lastResponseWasCorrection) {
        log.info("Stripped [NEXT] — awaiting response to correction");
        response = response.replace(NEXT_TOKEN, "").trim();
      }
    }

    if (forceSkip && !response.includes(NEXT_TOKEN)) {
      log.info("Force-adding [NEXT] — user explicitly asked to skip");
      response = response.trimEnd() + " " + NEXT_TOKEN;
    }

    lastResponseWasCorrection = isCorrection(response, isZh);
    if (lastResponseWasCorrection) {
      log.info("Response detected as correction — will guard next turn");
    }

    const spokenResponse = response.replace(NEXT_TOKEN, "").replace(PREV_TOKEN, "").trim();
    if (spokenResponse) {
      recentAgentResponses.push(spokenResponse);
      if (recentAgentResponses.length > 5) recentAgentResponses.shift();
    }

    log.info(`Response LLM (${Date.now() - startMs}ms, ${maxTokens}tok, turn ${userTurnsOnCurrentQ}): "${response.slice(0, 100)}..."`);
    return response;
  }

  // ── Two-phase whiteboard follow-up ─────────────────────────────

  function scheduleWhiteboardFollowUp() {
    const pollInterval = 300;
    const maxWait = WHITEBOARD_VISION_FOLLOW_UP_MAX_WAIT_MS;
    let waited = 0;

    const poll = () => {
      if (isTransitioning || interviewDone || browserWs.readyState !== WebSocket.OPEN) return;

      if (!pendingWhiteboardVision && cachedWhiteboardDescription) {
        log.info("Whiteboard vision ready — sending follow-up response");
        generatingResponse = true;
        generateControlledResponse()
          .then((followUp) => {
            generatingResponse = false;
            if (!followUp || browserWs.readyState !== WebSocket.OPEN) return;
            const spokenFollowUp = followUp.replace(NEXT_TOKEN, "").replace(PREV_TOKEN, "").trim();
            if (spokenFollowUp) {
              log.info("Sent whiteboard follow-up via TTS");
              speakAndHandle(spokenFollowUp).catch(log.error);
            }
          })
          .catch((err) => {
            log.error("Whiteboard follow-up failed:", err);
            generatingResponse = false;
          });
        return;
      }

      waited += pollInterval;
      if (waited < maxWait) {
        setTimeout(poll, pollInterval);
      } else {
        log.info("Whiteboard vision timed out — no follow-up sent");
      }
    };

    setTimeout(poll, pollInterval);
  }

  // ── Transition handler ──────────────────────────────────────────

  function sendTransitionCancelled(direction: "next" | "previous") {
    if (browserWs.readyState !== WebSocket.OPEN) return;
    browserWs.send(JSON.stringify({
      type: "transition_cancelled",
      direction,
      questionIndex: currentQuestionIndex,
      totalQuestions: sortedQuestions.length,
    }));
  }

  function queueManualTransition(direction: "next" | "previous") {
    pendingManualTransitionDirection = direction;
    cancelTts();
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ type: "transitioning", auto: false, direction }));
    }
    log.info(`Manual ${direction} requested during active transition — queued`);
  }

  function runQueuedManualTransition(): boolean {
    const direction = pendingManualTransitionDirection;
    if (!direction || interviewDone) return false;

    pendingManualTransitionDirection = null;
    isTransitioning = false;

    if (direction === "previous") {
      handlePreviousTransition(false).catch(log.error);
    } else {
      handleTransition(false).catch(log.error);
    }
    return true;
  }

  async function handleTransition(auto = false) {
    if (interviewDone) return;
    if (isTransitioning) {
      if (!auto) queueManualTransition("next");
      return;
    }
    const transitionId = ++transitionGeneration;
    isTransitioning = true;
    clearPendingAsrFinal();

    suppressAsrResults = true;
    disconnectAsr();
    cancelTts();
    generatingResponse = false;

    try {
      browserWs.send(JSON.stringify({ type: "transitioning", auto, direction: "next" }));

      const currentQ = sortedQuestions[currentQuestionIndex];
      const transcriptSnapshot = [...questionTranscript];
      questionTranscript = [];
      asrAccumulator = "";
      userTurnsOnCurrentQ = 0;
      lastResponseWasCorrection = false;
      cachedWhiteboardDescription = "";
      whiteboardDirty = !!latestWhiteboardImage;
      recentAgentResponses.length = 0;
      if (pendingLastQuestionTimeout) {
        clearTimeout(pendingLastQuestionTimeout);
        pendingLastQuestionTimeout = null;
      }

      currentQuestionIndex++;

      if (currentQuestionIndex < sortedQuestions.length) {
        const summary = transcriptSnapshot.length > 0
          ? await summarizeQuestion(currentQ.text, transcriptSnapshot, isZh)
          : "";
        questionSummaries.push(summary);

        const nextQ = sortedQuestions[currentQuestionIndex];
        const transition = buildTransitionSayHello(currentQuestionIndex, nextQ, isZh);

        browserWs.send(
          JSON.stringify({
            type: "question_change",
            questionIndex: currentQuestionIndex,
            totalQuestions: sortedQuestions.length,
            auto,
          })
        );

        log.info(`→ Q${currentQuestionIndex + 1}/${sortedQuestions.length}: ${nextQ.text.slice(0, 60)}...`);

        await speakAndHandle(transition, { trackInTranscript: false });
      } else {
        if (transcriptSnapshot.length > 0) {
          const lastSummary = await summarizeQuestion(currentQ.text, transcriptSnapshot, isZh);
          questionSummaries.push(lastSummary);
        }

        if (auto) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          if (interviewDone) return;
        }

        awaitingFinalResponse = true;
        const wrapUp = buildWrapUpSayHello(isZh);

        log.info("All questions covered, awaiting final response");
        await speakAndHandle(wrapUp, { pendingFinalTimeout: true });
      }
    } catch (err) {
      log.error("Transition error:", err);
    } finally {
      if (transitionGeneration !== transitionId) return;
      if (runQueuedManualTransition()) return;
      isTransitioning = false;
      if (!interviewDone && browserWs.readyState === WebSocket.OPEN) {
        reopenAsr().catch(log.error);
      }
    }
  }

  // ── Previous-question transition handler ───────────────────────

  async function handlePreviousTransition(auto = false) {
    if (interviewDone) return;
    if (currentQuestionIndex <= 0) {
      if (!auto) sendTransitionCancelled("previous");
      return;
    }
    if (isTransitioning) {
      if (!auto) queueManualTransition("previous");
      return;
    }
    const transitionId = ++transitionGeneration;
    isTransitioning = true;
    clearPendingAsrFinal();

    suppressAsrResults = true;
    disconnectAsr();
    cancelTts();
    generatingResponse = false;

    try {
      browserWs.send(JSON.stringify({ type: "transitioning", auto, direction: "previous" }));

      const transcriptSnapshot = [...questionTranscript];
      questionTranscript = [];
      asrAccumulator = "";
      userTurnsOnCurrentQ = 0;
      lastResponseWasCorrection = false;
      cachedWhiteboardDescription = "";
      whiteboardDirty = !!latestWhiteboardImage;
      recentAgentResponses.length = 0;
      if (pendingLastQuestionTimeout) {
        clearTimeout(pendingLastQuestionTimeout);
        pendingLastQuestionTimeout = null;
      }

      const currentQ = sortedQuestions[currentQuestionIndex];
      if (transcriptSnapshot.length > 0) {
        const summary = await summarizeQuestion(currentQ.text, transcriptSnapshot, isZh);
        questionSummaries.push(summary);
      }

      currentQuestionIndex--;

      const prevQ = sortedQuestions[currentQuestionIndex];
      const transition = buildReturnSayHello(currentQuestionIndex, prevQ, isZh);

      browserWs.send(
        JSON.stringify({
          type: "question_change",
          questionIndex: currentQuestionIndex,
          totalQuestions: sortedQuestions.length,
          auto: false,
        })
      );

      log.info(`← Q${currentQuestionIndex + 1}/${sortedQuestions.length} (back): ${prevQ.text.slice(0, 60)}...`);

      await speakAndHandle(transition, { trackInTranscript: false });
    } catch (err) {
      log.error("Previous transition error:", err);
    } finally {
      if (transitionGeneration !== transitionId) return;
      if (runQueuedManualTransition()) return;
      isTransitioning = false;
      if (!interviewDone && browserWs.readyState === WebSocket.OPEN) {
        reopenAsr().catch(log.error);
      }
    }
  }

  // ── Handle completed user utterance ────────────────────────────

  function normalizeUserUtteranceKey(text: string): string {
    return text.replace(/\s+/g, " ").trim().toLowerCase();
  }

  /**
   * Volcengine sometimes emits a second definite for the same utterance while ASR results are
   * suppressed (or two finals race before generatingResponse is set). If we already stored this
   * user line and an assistant reply followed, skip — otherwise the flush/queue paths call
   * handleUserUtterance again and the agent speaks twice.
   */
  function isDuplicateUserFinal(userText: string): boolean {
    const key = normalizeUserUtteranceKey(userText);
    if (!key) return false;

    let lastUserIdx = -1;
    for (let i = questionTranscript.length - 1; i >= 0; i--) {
      if (questionTranscript[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx >= 0 && lastUserIdx !== questionTranscript.length - 1) {
      const hasAssistantAfter = questionTranscript.slice(lastUserIdx + 1).some(e => e.role === "assistant");

      if (hasAssistantAfter) {
        const lastUserText = questionTranscript[lastUserIdx].text;
        if (shouldSuppressAnsweredAsrFinal(lastUserText, userText)) {
          const merged = mergeAsrSegments(lastUserText, userText);
          if (normalizeUserUtteranceKey(merged).length > normalizeUserUtteranceKey(lastUserText).length) {
            questionTranscript[lastUserIdx] = { role: "user", text: merged };
            rememberAcceptedUserFinal(merged);
          }
          return true;
        }
      }
    }

    return shouldSuppressRecentUserFinalReplay(userText);
  }

  function isReplayOfPendingUserTurn(userText: string): boolean {
    const lastEntry = questionTranscript[questionTranscript.length - 1];
    if (lastEntry?.role !== "user") return false;
    if (!shouldSuppressAnsweredAsrFinal(lastEntry.text, userText)) return false;

    const merged = mergeAsrSegments(lastEntry.text, userText);
    if (normalizeUserUtteranceKey(merged).length > normalizeUserUtteranceKey(lastEntry.text).length) {
      questionTranscript[questionTranscript.length - 1] = { role: "user", text: merged };
      rememberAcceptedUserFinal(merged);
    }
    return true;
  }

  function isSameAsPendingUserTurn(userText: string): boolean {
    const lastEntry = questionTranscript[questionTranscript.length - 1];
    return (
      lastEntry?.role === "user" &&
      normalizeUserUtteranceKey(lastEntry.text) === normalizeUserUtteranceKey(userText)
    );
  }

  function shouldIgnoreAsrInterimReplay(userText: string): boolean {
    return isDuplicateUserFinal(userText);
  }

  function getLatestAnsweredExchange(): { interviewer: string; participant: string } | null {
    const lastEntry = questionTranscript[questionTranscript.length - 1];
    if (lastEntry?.role !== "user") return null;

    for (let i = questionTranscript.length - 2; i >= 0; i--) {
      const entry = questionTranscript[i];
      if (entry.role === "assistant" && entry.text.trim()) {
        return {
          interviewer: entry.text.trim(),
          participant: lastEntry.text.trim(),
        };
      }
    }

    return null;
  }

  async function handleUserUtterance(
    userText: string,
    options?: { allowRecentReplay?: boolean },
  ) {
    if (!userText || isTransitioning || interviewDone) return;

    // Fast-path commands work even during TTS/response generation
    if (isUserEndRequest(userText)) {
      queueFarewellAndEnd(`Explicit interview end request: "${userText.slice(0, 80)}"`);
      return;
    }
    if (isFastPrevRequest(userText) || isUserPrevRequest(userText)) {
      log.info("Fast-path: previous question request");
      handlePreviousTransition().catch(log.error);
      return;
    }
    if (isFastNextRequest(userText)) {
      log.info("Fast-path: next question request");
      handleTransition().catch(log.error);
      return;
    }

    const retryingPendingUserTurnCandidate = isSameAsPendingUserTurn(userText);
    if (
      !options?.allowRecentReplay &&
      !retryingPendingUserTurnCandidate &&
      isDuplicateUserFinal(userText)
    ) {
      log.info(
        `Skipping duplicate USER final (reply already recorded): "${userText.slice(0, 72)}..."`,
      );
      return;
    }

    // A second final can arrive while we're still in handleUserUtterance (LLM/TTS).
    // The client has already received asr_ended — queue and run after this cycle finishes.
    if (generatingResponse) {
      const duplicateWhileGenerating =
        isReplayOfPendingUserTurn(userText) ||
        (!options?.allowRecentReplay && isDuplicateUserFinal(userText));
      if (duplicateWhileGenerating) {
        log.info(
          `Skipping duplicate USER final while response is generating: "${userText.slice(0, 72)}..."`,
        );
        return;
      }
      queuedUserUtteranceWhileGenerating = userText;
      log.info(`Queueing user utterance until current response cycle completes: "${userText.slice(0, 60)}"`);
      return;
    }

    generatingResponse = true;
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ type: "response_started" }));
    }
    try {
      // User often finishes a phrase right as greeting/answer TTS is still
      // flagged active (barge-in + ASR final ordering). Dropping here leaves
      // the client stuck in isProcessing with no reply — cancel TTS and process.
      if (ttsSpeaking) {
        log.info(`User utterance during TTS — cancelling playback and processing: "${userText.slice(0, 60)}"`);
        cancelTts();
        if (browserWs.readyState === WebSocket.OPEN) {
          browserWs.send(JSON.stringify({ type: "interrupt" }));
        }
      }

      updateUserLanguage(userText);
      const retryingPendingUserTurn = retryingPendingUserTurnCandidate;
      if (retryingPendingUserTurn) {
        log.info(`Retrying response for pending USER final: "${userText.slice(0, 72)}..."`);
      } else {
        rememberAcceptedUserFinal(userText);
        questionTranscript.push({ role: "user", text: userText });
        userTurnsOnCurrentQ++;
      }
      lastResponseWasCorrection = false;

      if (pendingLastQuestionTimeout) {
        clearTimeout(pendingLastQuestionTimeout);
        pendingLastQuestionTimeout = null;
        log.info("User spoke — cancelled pending last-Q transition");
      }

      if (awaitingFinalResponse) {
        awaitingFinalResponse = false;
        if (finalResponseTimeout) {
          clearTimeout(finalResponseTimeout);
          finalResponseTimeout = null;
        }
        const farewell = buildFarewellSayHello(isZh);
        log.info("Final response received, sending farewell");
        await speakAndHandle(farewell, { pendingFarewell: true });
        return;
      }

      const userWantsSkip = isUserSkipRequest(userText);
      if (userWantsSkip) log.info(`User skip intent detected: "${userText.slice(0, 80)}"`);

      // Suppress ASR result processing during the response cycle.
      // ASR stays alive for barge-in detection; reconnected in finally block.
      suppressAsrResults = true;

      cancelTts();
      if (browserWs.readyState === WebSocket.OPEN) {
        browserWs.send(JSON.stringify({ type: "interrupt" }));
      }

      try {
        const response = await generateControlledResponse({ forceSkip: userWantsSkip });

        if (!response || browserWs.readyState !== WebSocket.OPEN) return;

        let shouldTransition = response.includes(NEXT_TOKEN);
        let shouldGoPrev = response.includes(PREV_TOKEN);
        const spokenText = response.replace(NEXT_TOKEN, "").replace(PREV_TOKEN, "").trim();

        if (!shouldTransition && !shouldGoPrev && userTurnsOnCurrentQ > 0
            && hasImplicitTransition(spokenText) && !replyKeepsConversationOpen(spokenText, isZh)) {
          shouldTransition = true;
          log.info("Implicit transition detected in response text");
        }

        if (!shouldGoPrev && !shouldTransition && hasImplicitPrevTransition(spokenText)) {
          shouldGoPrev = true;
          log.info("Implicit PREV transition detected in response text");
        }

        if (
          shouldTransition &&
          !userWantsSkip &&
          replyKeepsConversationOpen(spokenText, isZh)
        ) {
          shouldTransition = false;
          log.info("Stripped transition — spoken response still invites a reply");
        }

        const currentType = sortedQuestions[currentQuestionIndex]?.type;
        if (shouldTransition && !userWantsSkip && (currentType === "CODING" || currentType === "WHITEBOARD")) {
          if (spokenText.length > 80) {
            shouldTransition = false;
            log.info(`Stripped transition — coding/wb response too long (${spokenText.length} chars)`);
          }
        }

        if (spokenText) {
          log.info("Sent controlled response via TTS");
          await speakAndHandle(spokenText, {
            pendingTransition: shouldTransition,
            pendingPrevTransition: shouldGoPrev && currentQuestionIndex > 0,
          });
        } else if (shouldGoPrev && currentQuestionIndex > 0) {
          handlePreviousTransition().catch(log.error);
        } else if (shouldTransition) {
          handleTransition(true).catch(log.error);
        }

        if (pendingWhiteboardVision && !shouldTransition && !shouldGoPrev) {
          scheduleWhiteboardFollowUp();
        }
      } catch (err) {
        log.error("Response generation failed:", err);
      } finally {
        generatingResponse = false;
        if (!interviewDone && browserWs.readyState === WebSocket.OPEN) {
          try {
            await reopenAsr();
            const followUp = queuedUserUtteranceWhileGenerating.trim();
            queuedUserUtteranceWhileGenerating = "";
            if (followUp && !isDuplicateUserFinal(followUp)) {
              await handleUserUtterance(followUp);
            } else if (followUp) {
              log.info(
                `Skipping queued user utterance — duplicate of answered turn: "${followUp.slice(0, 60)}..."`,
              );
            }
          } catch (err) {
            log.error("Post-response reopen/drain failed:", err);
          }
        }
      }
    } finally {
      generatingResponse = false;
    }
  }

  // ── Connect ASR ────────────────────────────────────────────────

  let asrIntentionalClose = false;

  /** Gracefully close the current ASR session (send end-of-stream). */
  function disconnectAsr() {
    asrIntentionalClose = true;
    clearPendingAsrFinal();
    clearHeldBargeInInterim();
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
    if (asrWs && asrWs.readyState === WebSocket.OPEN && asrAlive) {
      try {
        asrAudioSeq++;
        asrWs.send(buildBigModelAudioRequest(Buffer.alloc(0), asrAudioSeq, true));
      } catch { /* ignore */ }
    }
    if (asrWs) {
      asrWs.removeAllListeners();
      try { asrWs.close(); } catch { /* ignore */ }
    }
    asrWs = null;
    asrAlive = false;
    asrAccumulator = "";
    asrSessionFirstSpeechAt = 0;
    log.info("ASR disconnected (intentional)");
  }

  /** Reconnect ASR after response cycle so accumulated echo text is cleared. */
  async function reopenAsr() {
    try {
      await connectAsr();
      if (!keepAliveInterval) {
        keepAliveInterval = setInterval(() => {
          if (!asrAlive || !asrWs || asrWs.readyState !== WebSocket.OPEN) return;
          asrAudioSeq++;
          asrWs.send(buildBigModelAudioRequest(Buffer.alloc(3200), asrAudioSeq));
        }, 5000);
      }
      // Only clear suppression if no new response cycle is running
      if (!generatingResponse) {
        suppressAsrResults = false;
      }

      const flushed = pendingUserUtteranceWhileSuppressed.trim();
      pendingUserUtteranceWhileSuppressed = "";
      if (
        flushed &&
        !interviewDone &&
        browserWs.readyState === WebSocket.OPEN &&
        !looksLikeAssistantPlaybackEcho(flushed, questionTranscript) &&
        !isDuplicateUserFinal(flushed) &&
        !shouldIgnoreVolcContinuationFragment(
          flushed,
          questionTranscript,
          lastAssistantMessageWallClockMs,
          isZh,
        )
      ) {
        log.info(`ASR suppression flush — deferred user: "${flushed.slice(0, 72)}..."`);
        browserWs.send(JSON.stringify({
          type: "asr",
          data: { results: [{ text: flushed, definite: true }] },
        }));
        browserWs.send(JSON.stringify({ type: "asr_ended", text: flushed }));
        await handleUserUtterance(flushed);
      } else if (flushed && isDuplicateUserFinal(flushed)) {
        log.info(
          `ASR suppression flush skipped — duplicate USER final (already answered): "${flushed.slice(0, 72)}..."`,
        );
      } else if (
        flushed &&
        shouldIgnoreVolcContinuationFragment(
          flushed,
          questionTranscript,
          lastAssistantMessageWallClockMs,
          isZh,
        )
      ) {
        log.info(
          `ASR suppression flush skipped — split-noise fragment: "${flushed.slice(0, 72)}..."`,
        );
      }

      log.info("ASR reconnected — ready for user input");
    } catch (err) {
      log.error("ASR reopen failed:", err instanceof Error ? err.message : err);
      autoReconnectAsr().catch((reconnectErr) => {
        log.error("All ASR reconnect attempts failed:", reconnectErr instanceof Error ? reconnectErr.message : reconnectErr);
        if (browserWs.readyState === WebSocket.OPEN) {
          browserWs.send(JSON.stringify({ type: "disconnected" }));
          browserWs.close();
        }
      });
    }
  }

  function buildAsrContext(): Record<string, unknown> | undefined {
    const contextData: { text: string }[] = [];

    const currentQ = sortedQuestions[currentQuestionIndex];
    if (currentQ) {
      contextData.push({ text: `Interview topic: ${ctx.title}` });
      contextData.push({ text: `Current question: ${currentQ.text}` });
    }

    const recentTranscript = questionTranscript.slice(-6);
    for (const entry of recentTranscript) {
      contextData.push({ text: `${entry.role}: ${entry.text}` });
    }

    if (contextData.length === 0) return undefined;
    return {
      context: JSON.stringify({
        context_type: "dialog_ctx",
        context_data: contextData,
      }),
    };
  }

  async function connectAsr() {
    asrIntentionalClose = false;
    const reqid = randomUUID().replace(/-/g, "");
    asrAudioSeq = 1;

    const asrConfig: BigModelAsrConfig = {
      language: resolveBigModelAsrLanguage(ctx.language),
      format: "pcm",
      rate: 16000,
      bits: 16,
      channels: 1,
      codec: "raw",
      showUtterance: true,
      resultType: "full",
      enablePunc: true,
      enableDdc: true,
      endWindowSize: ASR_END_WINDOW_MS,
      forceToSpeechTime: ASR_FORCE_SPEECH_MS,
      enableNonstream: true,
      ssdVersion: "200",
      corpus: buildAsrContext(),
    };

    if (asrWs) {
      asrWs.removeAllListeners();
      try { asrWs.close(); } catch { /* ignore */ }
    }

    const wsHeaders = buildBigModelHeaders(
      ASR_APP_ID, ASR_ACCESS_TOKEN, reqid, ASR_RESOURCE_ID,
      ASR_API_KEY || undefined,
    );
    asrWs = new WebSocket(BIGMODEL_ASR_URL, { headers: wsHeaders });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("ASR connect timeout")), 10000);
      asrWs!.on("open", () => { clearTimeout(t); resolve(); });
      asrWs!.on("error", (e) => { clearTimeout(t); reject(e); });
      asrWs!.on("unexpected-response", (_req, res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => {
          clearTimeout(t);
          log.error(`ASR WebSocket rejected: HTTP ${res.statusCode} — ${body}`);
          reject(new Error(`ASR server responded ${res.statusCode}: ${body}`));
        });
      });
    });
    log.info(`ASR connected: resource=${ASR_RESOURCE_ID}`);

    asrWs.send(buildBigModelFullRequest(asrConfig, reqid));
    asrAlive = true;

    asrWs.on("message", (data: Buffer) => {
      try {
        const resp = parseAsrResponse(Buffer.from(data));

        if (resp.errorCode != null) {
          log.error(`ASR error: ${resp.errorCode} ${resp.errorMessage}`);
          return;
        }

        if (interviewDone) return;

        // Unified handler for both utterance-based and text-based ASR results
        const results: { text: string; definite: boolean }[] = [];
        if (resp.utterances) {
          for (const utt of resp.utterances) {
            if (utt.text) results.push({ text: utt.text, definite: !!utt.definite });
          }
        } else if (resp.text) {
          results.push({ text: resp.text, definite: !!resp.isLastPackage });
        }

        if (results.length === 0 && resp.messageType !== 1 && resp.messageType !== 9) {
          log.info(`ASR non-text msg: type=${resp.messageType}, code=${resp.code}, seq=${resp.sequence}`);
        }

        for (const r of results) {
          // Server-side barge-in: interim speech during TTS → cancel TTS immediately
          if (shouldHoldBargeInInterimForFinal({
            text: r.text,
            definite: r.definite,
            ttsSpeaking,
            endingInterview,
          })) {
            log.info(`Barge-in detected via ASR (interim: "${r.text.slice(0, 40)}") — cancelling TTS`);
            holdBargeInInterim(r.text);
            cancelTts();
            suppressAsrResults = false;
            generatingResponse = false;
            if (browserWs.readyState === WebSocket.OPEN) {
              browserWs.send(JSON.stringify({ type: "interrupt" }));
            }
            continue;
          }

          if (heldBargeInInterimText && r.text.trim()) {
            r.text = mergeAsrSegments(heldBargeInInterimText, r.text);
            clearHeldBargeInInterim();
          }

          // During suppression, defer user finals for flush after reopenAsr.
          // Echo of TTS is mostly definite; we guard on flush. Forward interims
          // only when not playing TTS so live captions work during LLM wait.
          if (suppressAsrResults) {
            const suppressedText = r.text.trim();
            if (
              suppressedText.length >= 2 &&
              !r.definite &&
              !ttsSpeaking &&
              browserWs.readyState === WebSocket.OPEN &&
              !isDuplicateUserFinal(suppressedText) &&
              !shouldIgnoreVolcContinuationFragment(
                suppressedText,
                questionTranscript,
                lastAssistantMessageWallClockMs,
                isZh,
              )
            ) {
              browserWs.send(JSON.stringify({
                type: "asr",
                data: { results: [{ text: suppressedText, definite: r.definite }] },
              }));
            }
            if (r.definite) {
              const suppressedFinal = suppressedText;
              asrAccumulator = "";
              if (suppressedFinal.length >= 2) {
                if (
                  shouldIgnoreVolcContinuationFragment(
                    suppressedFinal,
                    questionTranscript,
                    lastAssistantMessageWallClockMs,
                    isZh,
                  )
                ) {
                  continue;
                }
                const prevPending = pendingUserUtteranceWhileSuppressed.trim();
                const incomingDup = isDuplicateUserFinal(suppressedFinal);
                const sameAsPending =
                  normalizeUserUtteranceKey(suppressedFinal)
                  === normalizeUserUtteranceKey(prevPending);

                // Volc can emit a late duplicate definite for an old turn after a newer utterance
                // was deferred here — blindly overwriting would drop the real follow-up on flush.
                if (
                  prevPending &&
                  incomingDup &&
                  !sameAsPending
                ) {
                  log.info(
                    `Keeping deferred utterance — ignoring stale duplicate: "${suppressedFinal.slice(0, 72)}..."`,
                  );
                } else if (!incomingDup || sameAsPending) {
                  pendingUserUtteranceWhileSuppressed = suppressedFinal;
                } else if (!prevPending) {
                  log.info(
                    `Suppressed ASR final skipped (already answered, nothing deferred): "${suppressedFinal.slice(0, 72)}..."`,
                  );
                }
              }
            }
            continue;
          }

          if (endingInterview) {
            if (r.definite) asrAccumulator = "";
            continue;
          }

          if (!asrSessionFirstSpeechAt && r.text.trim()) {
            asrSessionFirstSpeechAt = Date.now();
          }

          if (pendingAsrFinalText && !r.definite) {
            const { text: merged, changed } = mergePendingAsrInterim(pendingAsrFinalText, r.text);
            if (!changed) {
              log.debug(`ASR duplicate interim while pending: "${merged.slice(0, 80)}"`);
              continue;
            }
            pendingAsrFinalText = merged;
            pendingAsrFinalLastChangedAt = Date.now();
            asrAccumulator = merged;
            sendAsrInterim(merged);
            if (pendingAsrFinalTimer) {
              clearTimeout(pendingAsrFinalTimer);
            }
            const targetDelay = getAsrFinalCoalesceDelay(merged);
            const elapsed = pendingAsrFinalStartedAt
              ? Date.now() - pendingAsrFinalStartedAt
              : 0;
            const quietElapsed = pendingAsrFinalLastChangedAt
              ? Date.now() - pendingAsrFinalLastChangedAt
              : 0;
            const delay = Math.max(0, targetDelay - elapsed, ASR_PENDING_FINAL_QUIET_MS - quietElapsed);
            pendingAsrFinalTimer = setTimeout(() => {
              flushPendingAsrFinal("coalesced");
            }, delay);
            sendAsrPending(merged, delay);
            log.info(`ASR continuation merged: "${merged.slice(0, 80)}"`);
            continue;
          }

          asrAccumulator = pendingAsrFinalText
            ? mergeAsrSegments(pendingAsrFinalText, r.text)
            : r.text;

          if (!r.definite) {
            sendAsrInterim(asrAccumulator);
          }

          if (r.definite) {
            const finalText = asrAccumulator.trim();
            asrAccumulator = "";
            if (finalText && finalText.length >= 2) {
              schedulePendingAsrFinal(finalText, "definite");
            } else {
              clearPendingAsrFinal();
            }
          }
        }
      } catch (err) {
        log.error("ASR parse error:", err);
      }
    });

    asrWs.on("close", (code: number, reason: Buffer) => {
      const reasonStr = reason?.toString() || "";
      log.warn(`ASR WS closed (code=${code}, reason="${reasonStr}")`);
      asrAlive = false;

      // Don't auto-reconnect if we intentionally closed (will reopen later)
      if (asrIntentionalClose) return;
      if (isTransitioning || interviewDone) return;
      if (browserWs.readyState !== WebSocket.OPEN) return;

      autoReconnectAsr().catch((err) => {
        log.error("All ASR reconnect attempts failed:", err instanceof Error ? err.message : err);
        if (browserWs.readyState === WebSocket.OPEN) {
          browserWs.send(JSON.stringify({ type: "disconnected" }));
          browserWs.close();
        }
      });
    });

    asrWs.on("error", (err: Error) => {
      log.error(`ASR WS error: ${err.message}`);
    });

    log.info("ASR 2.0 connected");
  }

  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_DELAY_MS = 1000;

  async function autoReconnectAsr(): Promise<void> {
    browserWs.send(JSON.stringify({ type: "session_reconnecting" }));

    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      if (interviewDone || browserWs.readyState !== WebSocket.OPEN) return;

      const delay = RECONNECT_DELAY_MS * attempt;
      log.info(`ASR auto-reconnect attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS} (waiting ${delay}ms)...`);
      await new Promise((r) => setTimeout(r, delay));

      if (interviewDone || browserWs.readyState !== WebSocket.OPEN) return;

      try {
        await connectAsr();

        if (!keepAliveInterval) {
          keepAliveInterval = setInterval(() => {
            if (!asrAlive || !asrWs || asrWs.readyState !== WebSocket.OPEN) return;
            asrAudioSeq++;
            asrWs.send(buildBigModelAudioRequest(Buffer.alloc(3200), asrAudioSeq));
          }, 5000);
        }

        browserWs.send(JSON.stringify({ type: "session_reconnected" }));
        log.info(`ASR auto-reconnect succeeded on attempt ${attempt}`);
        return;
      } catch (err) {
        log.warn(`ASR auto-reconnect attempt ${attempt} failed:`, err instanceof Error ? err.message : err);
      }
    }

    throw new Error("Exhausted all reconnect attempts");
  }

  // ── Initialize ─────────────────────────────────────────────────

  const greeting = currentQuestionIndex > 0
    ? buildResumeGreeting(ctx, currentQuestionIndex)
    : buildGreeting(ctx);

  log.info("Greeting:", greeting.slice(0, 200) + "...");

  try {
    await connectAsr();

    browserWs.send(JSON.stringify({ type: "ready", sessionId: randomUUID() }));

    browserWs.send(
      JSON.stringify({
        type: "question_change",
        questionIndex: currentQuestionIndex,
        totalQuestions: sortedQuestions.length,
      })
    );

    suppressAsrResults = true;
    log.info(`Starting greeting TTS for Q${currentQuestionIndex + 1}`);
    speakAndHandle(greeting, { trackInTranscript: false })
      .then(() => {
        if (!interviewDone && browserWs.readyState === WebSocket.OPEN) {
          // Reconnect ASR to clear echo accumulated during greeting TTS
          reopenAsr().catch(log.error);
        }
      })
      .catch(log.error);
  } catch (err) {
    log.error("Failed to initialize:", err);
    browserWs.send(
      JSON.stringify({
        type: "error",
        message: `Connection failed: ${err instanceof Error ? err.message : err}`,
      })
    );
    browserWs.close();
    return;
  }

  // ── Browser message handling ────────────────────────────────────

  browserWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "audio" && msg.data) {
        const pcm = Buffer.from(msg.data, "hex");
        noteIncomingAudioActivity(pcm);
        if (!asrAlive || isTransitioning || !asrWs || asrWs.readyState !== WebSocket.OPEN) return;
        asrAudioSeq++;
        asrWs.send(buildBigModelAudioRequest(pcm, asrAudioSeq));
      } else if (msg.type === "barge_in") {
        if (ttsSpeaking || generatingResponse) {
          log.info("Client barge-in signal received — cancelling TTS");
          cancelTts();
          suppressAsrResults = false;
          generatingResponse = false;
          if (browserWs.readyState === WebSocket.OPEN) {
            browserWs.send(JSON.stringify({ type: "interrupt" }));
          }
        }
      } else if (msg.type === "text_input" && msg.content) {
        const userText = (msg.content as string).trim();
        if (userText && !isTransitioning && !interviewDone) {
          const source = typeof msg.source === "string" ? msg.source : "";
          if (source === "asr_interim_watchdog" && shouldIgnoreAsrInterimReplay(userText)) {
            log.info(`ASR interim replay skipped — stale tail fragment: "${userText.slice(0, 72)}..."`);
            if (browserWs.readyState === WebSocket.OPEN) {
              browserWs.send(JSON.stringify({ type: "interrupt" }));
            }
            return;
          }

          cancelTts();
          browserWs.send(JSON.stringify({ type: "interrupt" }));
          browserWs.send(JSON.stringify({
            type: "asr_ended",
            text: userText,
            ...(source === "chat" ? { source: "chat" } : {}),
          }));
          handleUserUtterance(userText).catch(log.error);
          log.info(`Text input${source ? ` (${source})` : ""}: "${userText.slice(0, 60)}..."`);
        }
      } else if (msg.type === "next_question") {
        log.info("Browser requested next question");
        handleTransition().catch(log.error);
      } else if (msg.type === "prev_question") {
        log.info("Browser requested previous question");
        handlePreviousTransition().catch(log.error);
      } else if (msg.type === "text" && msg.content) {
        speakText(msg.content).catch(log.error);
      } else if (msg.type === "code_update") {
        currentCodeContent = (msg.content as string) || "";
        currentCodeLanguage = (msg.language as string) || "plaintext";
      } else if (msg.type === "whiteboard_update") {
        const img = (msg.imageDataUrl as string) || "";
        const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
        if (img && img !== latestWhiteboardImage) {
          latestWhiteboardImage = img;
          whiteboardDirty = true;
          log.info(`Whiteboard update received (${Math.round(img.length / 1024)}KB, dirty=true)`);
        }
        if (requestId) {
          settleWhiteboardSnapshotRequest(requestId, Boolean(img));
        } else if (img) {
          settleAllWhiteboardSnapshotRequests(true);
        }
      } else if (msg.type === "whiteboard_snapshot_unavailable") {
        const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
        if (requestId) {
          settleWhiteboardSnapshotRequest(requestId, false);
        }
      } else if (msg.type === "ping") {
        browserWs.send(JSON.stringify({ type: "pong" }));
      }
    } catch (err) {
      log.error("Error handling browser message:", err);
    }
  });

  browserWs.on("close", () => {
    log.info("Browser disconnected");
    interviewDone = true;
    clearPendingAsrFinal();
    settleAllWhiteboardSnapshotRequests(false);
    cancelTts();
    if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
    if (finalResponseTimeout) clearTimeout(finalResponseTimeout);
    if (pendingLastQuestionTimeout) clearTimeout(pendingLastQuestionTimeout);
    if (asrAlive && asrWs && asrWs.readyState === WebSocket.OPEN) {
      try {
        asrAudioSeq++;
        asrWs.send(buildBigModelAudioRequest(Buffer.alloc(0), asrAudioSeq, true));
      } catch { /* ignore */ }
    }
    asrWs?.removeAllListeners();
    asrWs?.close();
  });

  browserWs.on("error", (err) => {
    log.error("Browser WS error:", err.message);
  });

  // ── Keep-alive: send silence periodically for ASR ──────────────

  keepAliveInterval = setInterval(() => {
    if (!asrAlive || !asrWs || asrWs.readyState !== WebSocket.OPEN) return;
    asrAudioSeq++;
    asrWs.send(buildBigModelAudioRequest(Buffer.alloc(3200), asrAudioSeq));
  }, 5000);
}
