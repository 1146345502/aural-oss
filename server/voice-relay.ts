/**
 * WebSocket relay server for Volcengine S2S (Speech-to-Speech).
 *
 * Browser ←→ this relay ←→ Volcengine S2S API
 *
 * The relay is needed because browsers cannot set custom headers
 * on WebSocket connections, which Volcengine requires for auth.
 *
 * Key features:
 * - Per-question interview flow with LLM-powered context summarization
 * - Transition triggers from both user (button/voice) and agent (keyword detection)
 * - Accumulated context passed between questions via SayHello prompts
 *
 * Usage:  npx tsx server/voice-relay.ts
 */
import { randomUUID } from "crypto";
import { config } from "dotenv";
import { IncomingMessage } from "http";
import { WebSocket, WebSocketServer } from "ws";
import {
  buildFinishConnection,
  buildFinishSession,
  buildSayHello,
  buildSendAudio,
  buildStartConnection,
  buildStartSession,
  parseResponse,
  SERVER_ERROR_RESPONSE,
  ServerEvent,
  type TTSOptions,
} from "./volcengine-protocol";
import {
  isUserEndRequest,
  isUserSkipRequest,
  responseInvitesUserReply,
} from "./voice-relay-helpers";
import { bt } from "../src/lib/i18n";
import { createLogger } from "../src/lib/logger";
import { SPOKEN, PROMPTS } from "./voice-relay-prompts";

const log = createLogger("voice-relay");

config({ path: ".env.local" });
config({ path: ".env" });

// ── Configuration ───────────────────────────────────────────────────

const RELAY_PORT = Number(process.env.VOICE_RELAY_PORT) || 8766;
const VOLCENGINE_WS_URL =
  process.env.DOUBAO_WS_URL ||
  "wss://openspeech.bytedance.com/api/v3/realtime/dialogue";
const APP_ID = process.env.DOUBAO_APP_ID || "";
const ACCESS_TOKEN = process.env.DOUBAO_ACCESS_TOKEN || "";
const APP_KEY = process.env.DOUBAO_APP_KEY || "";
const RESOURCE_ID = process.env.DOUBAO_RESOURCE_ID || "";
const TTS_VOICE_ZH = process.env.DOUBAO_VOICE_ZH || "";
const TTS_VOICE_EN = process.env.DOUBAO_VOICE_EN || "";

function buildTTSOptions(language?: string): TTSOptions | undefined {
  const isZh = language?.toLowerCase().startsWith("zh");
  const voiceType = isZh ? TTS_VOICE_ZH : TTS_VOICE_EN;
  if (!voiceType) return undefined;
  return { voice_type: voiceType };
}

if (!APP_ID || !ACCESS_TOKEN) {
  log.error("Missing DOUBAO_APP_ID or DOUBAO_ACCESS_TOKEN in .env.local");
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

interface AgentContext {
  memory: string;
  codeContent?: string;
  codeLanguage?: string;
  whiteboardDescription?: string;
  whiteboardLoading?: boolean;
  correctionGuard?: string;
  antiRepetition?: string;
}

// ── LLM helper for on-the-fly summarization ─────────────────────────
//
// Uses a small/fast model by default for low-latency transition summaries.
// Override via RELAY_LLM_MODEL env var if needed.

const RELAY_LLM_API_KEY = process.env.RELAY_LLM_API_KEY || process.env.KIMI_API_KEY || process.env.MINIMAX_API_KEY || "";
const RELAY_LLM_BASE_URL = process.env.RELAY_LLM_BASE_URL
  || (process.env.KIMI_API_KEY
    ? (process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1")
    : (process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/v1"));
// Default to lightweight models: moonshot-v1-8k (Kimi) or abab6.5s-chat (MiniMax)
const RELAY_LLM_MODEL = process.env.RELAY_LLM_MODEL
  || (process.env.KIMI_API_KEY ? "moonshot-v1-8k" : "abab6.5s-chat");

if (RELAY_LLM_API_KEY) {
  log.info(`Summarization LLM: ${RELAY_LLM_MODEL} @ ${RELAY_LLM_BASE_URL}`);
}

async function callLLM(prompt: string, maxTokens = 150): Promise<string> {
  if (!RELAY_LLM_API_KEY) {
    log.warn("No LLM API key for summarization");
    return "";
  }

  const startMs = Date.now();
  const res = await fetch(`${RELAY_LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RELAY_LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: RELAY_LLM_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`LLM API ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const elapsed = Date.now() - startMs;
  log.info(`LLM summarization took ${elapsed}ms`);
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ── Vision LLM for whiteboard description ────────────────────────────

const VISION_LLM_API_KEY = process.env.KIMI_API_KEY || "";
const VISION_LLM_BASE_URL = process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1";
const VISION_LLM_MODEL = "moonshot-v1-128k-vision-preview";

async function describeWhiteboard(imageDataUrl: string, isZh: boolean): Promise<string> {
  if (!VISION_LLM_API_KEY || !imageDataUrl) return "";

  const startMs = Date.now();
  try {
    const res = await fetch(`${VISION_LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VISION_LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: VISION_LLM_MODEL,
        messages: [{
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageDataUrl },
            },
            {
              type: "text",
              text: isZh
                ? "用1-2句话描述这个白板上画了什么。重点说明结构、组件和它们之间的关系。只输出描述。"
                : "Describe what is drawn on this whiteboard in 1-2 sentences. Focus on the structure, components, and relationships shown. Output only the description.",
            },
          ],
        }],
        temperature: 0.2,
        max_tokens: 100,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      log.error(`Vision LLM error: ${res.status} — ${errBody.slice(0, 200)}`);
      return "";
    }

    const data = await res.json();
    const desc = data.choices?.[0]?.message?.content?.trim() || "";
    log.info(`Vision LLM (${Date.now() - startMs}ms): "${desc.slice(0, 80)}..."`);
    return desc;
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

// ── Text extraction helpers ─────────────────────────────────────────

function extractText(data: Record<string, unknown>): string {
  for (const key of ["text", "content", "sentence", "delta"]) {
    if (typeof data[key] === "string" && data[key]) return data[key] as string;
  }
  return "";
}

// ── Transition detection ────────────────────────────────────────────
// Only the most unambiguous, explicit patterns are kept as a fast path.
// All nuanced/ambiguous cases are handled by the LLM via [NEXT]/[PREV] tokens.

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

// Fallback: detect when the LLM says "let's move on" naturally without [NEXT].
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

// Detect whether a response is asking a question — covers literal
// question marks AND common interrogative patterns the LLM may
// produce without punctuation.
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

// ── Build prompts from interview context ─────────────────────────────

function isChineseInterview(ctx: InterviewContext): boolean {
  return (
    ctx.language === "zh" || ctx.language.toLowerCase().includes("chinese")
  );
}

function buildSystemText(ctx: InterviewContext): string {
  return bt(isChineseInterview(ctx), SPOKEN.systemText(ctx.aiName, ctx.aiTone.toLowerCase()));
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

/**
 * Transition SayHello — spoken aloud by the model.
 * Must NOT include the LLM summary (that goes into system_text silently).
 * Keep it short and natural: just acknowledge + ask the next question.
 */
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

/**
 * Resume greeting — spoken when continuing an in-progress session.
 * Welcomes the user back and states the current question.
 */
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

/**
 * Return-to-previous SayHello — spoken when going back to an earlier question.
 */
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
    const result = await callLLM(bt(isZh, PROMPTS.summarize(questionText, t)));
    log.info(`Q summary: "${result.slice(0, 100)}..."`);
    return result;
  } catch (err) {
    log.error("LLM summarization failed:", err);
    return bt(isZh, PROMPTS.summaryError);
  }
}

// ── Relay server ────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: RELAY_PORT });
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

  const volcSessionId = randomUUID();
  let volcWs: WebSocket | null = null;
  let isAlive = false;
  let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  let asrAccumulator = "";

  const autoTimeout = setTimeout(() => {
    log.info("Mic test auto-timeout");
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ type: "timeout" }));
    }
    cleanup();
  }, 20_000);

  function cleanup() {
    clearTimeout(autoTimeout);
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
    if (isAlive && volcWs && volcWs.readyState === WebSocket.OPEN) {
      try {
        volcWs.send(buildFinishSession(volcSessionId));
        volcWs.send(buildFinishConnection());
      } catch { /* ignore */ }
    }
    volcWs?.close();
    volcWs = null;
    isAlive = false;
  }

  try {
    const connectId = randomUUID();
    const headers: Record<string, string> = {
      "X-Api-App-ID": APP_ID,
      "X-Api-Access-Key": ACCESS_TOKEN,
      "X-Api-Resource-Id": RESOURCE_ID,
      "X-Api-Connect-Id": connectId,
    };
    if (APP_KEY) headers["X-Api-App-Key"] = APP_KEY;

    volcWs = new WebSocket(VOLCENGINE_WS_URL, { headers });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Connection timeout")), 10000);
      volcWs!.on("unexpected-response", (_req: unknown, res: IncomingMessage) => {
        clearTimeout(t);
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => reject(new Error(`HTTP ${res.statusCode}: ${body || res.statusMessage}`)));
      });
      volcWs!.on("open", () => { clearTimeout(t); resolve(); });
      volcWs!.on("error", (e) => { clearTimeout(t); reject(e); });
    });

    volcWs.send(buildStartConnection());
    await waitForEvent(volcWs, ServerEvent.CONNECTION_STARTED, 5000);

    volcWs.send(
      buildStartSession(volcSessionId, "MicTest", "Listen to the user. Do not speak.", undefined)
    );
    await waitForEvent(volcWs, ServerEvent.SESSION_STARTED, 5000);
    isAlive = true;

    browserWs.send(JSON.stringify({ type: "ready" }));

    volcWs.on("message", (data: Buffer) => {
      try {
        const resp = parseResponse(Buffer.from(data));

        if (resp.event === ServerEvent.ASR_RESPONSE) {
          const payload = resp.payload as Record<string, unknown>;
          const results = (payload.results as Array<Record<string, unknown>>) || [];
          if (results.length > 0 && typeof results[0].text === "string") {
            asrAccumulator = results[0].text as string;
          }
          if (browserWs.readyState === WebSocket.OPEN) {
            browserWs.send(JSON.stringify({ type: "asr", data: payload }));
          }
        } else if (resp.event === ServerEvent.ASR_ENDED) {
          if (browserWs.readyState === WebSocket.OPEN) {
            browserWs.send(JSON.stringify({ type: "asr_ended", text: asrAccumulator.trim() }));
          }
          asrAccumulator = "";
        } else if (
          resp.event === ServerEvent.SESSION_FINISHED ||
          resp.event === ServerEvent.SESSION_FAILED
        ) {
          isAlive = false;
        }
        // Ignore TTS/CHAT events — mic test only needs ASR
      } catch (err) {
        log.error("Mic test parse error:", err);
      }
    });

    volcWs.on("close", () => {
      isAlive = false;
      if (browserWs.readyState === WebSocket.OPEN) {
        browserWs.send(JSON.stringify({ type: "disconnected" }));
      }
    });

    volcWs.on("error", (err: Error) => {
      log.error("Mic test Volcengine error:", err.message);
    });

    browserWs.on("message", (data) => {
      if (!volcWs || volcWs.readyState !== WebSocket.OPEN || !isAlive) return;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "audio" && msg.data) {
          volcWs.send(buildSendAudio(volcSessionId, Buffer.from(msg.data, "hex")));
        }
      } catch { /* ignore */ }
    });

    browserWs.on("close", () => {
      log.info("Mic test: browser disconnected");
      cleanup();
    });

    keepAliveInterval = setInterval(() => {
      if (!isAlive || !volcWs || volcWs.readyState !== WebSocket.OPEN) {
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        return;
      }
      volcWs.send(buildSendAudio(volcSessionId, Buffer.alloc(3200)));
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
  let volcSessionId = randomUUID();
  let volcWs: WebSocket | null = null;
  let isAlive = false;
  let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

  // ── Per-question state ──────────────────────────────────────────
  // When resuming a session, start from the question the interviewee
  // was on (provided via init context); default to 0 for new sessions.
  let currentQuestionIndex = 0; // set after init
  const questionSummaries: string[] = [];
  let questionTranscript: TranscriptEntry[] = [];
  let asrAccumulator = "";
  let ttsAccumulator = "";
  let isTransitioning = false;
  let interviewDone = false;

  // ── Agent context state ────────────────────────────────────────
  let currentCodeContent = "";
  let currentCodeLanguage = "plaintext";
  let latestWhiteboardImage = "";
  let whiteboardDirty = false;
  let cachedWhiteboardDescription = "";
  let lastResponseWasCorrection = false;
  const recentAgentResponses: string[] = [];
  let pendingWhiteboardVision = false;

  // ── Final-response state ──────────────────────────────────────
  // After the last question, the agent asks "anything else to add?"
  // We wait for the user to respond (or a timeout) before ending.
  let awaitingFinalResponse = false;
  let pendingFinalTimeout = false;   // start timeout after wrap-up TTS ends
  let pendingInterviewEnd = false;   // send interview_complete after farewell TTS ends
  let finalResponseTimeout: ReturnType<typeof setTimeout> | null = null;
  // On the last question, delay auto-transition so the user has time to
  // respond to the agent's last reply before the wrap-up fires.
  let pendingLastQuestionTimeout: ReturnType<typeof setTimeout> | null = null;

  function endInterview() {
    if (interviewDone) return;
    interviewDone = true;
    awaitingFinalResponse = false;
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
    if (interviewDone) return;

    awaitingFinalResponse = false;
    generatingResponse = false;
    suppressModelOutput = true;
    pendingTransitionAfterTts = false;
    pendingPrevTransitionAfterTts = false;

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
    awaitingSayHelloTts = true;
    skipNextTtsTranscript = true;

    if (!volcWs || volcWs.readyState !== WebSocket.OPEN || !isAlive) {
      log.warn(`${reason} — relay unavailable, ending interview without farewell audio`);
      endInterview();
      return;
    }

    volcWs.send(buildSayHello(volcSessionId, farewell));
    questionTranscript.push({ role: "assistant", text: farewell });
    pendingInterviewEnd = true;
    log.info(reason);
  }

  // ── LLM-controlled response state ─────────────────────────────
  // The S2S model's internal LLM doesn't follow system_text reliably.
  // Instead, we suppress its auto-generated responses and use our own
  // text LLM (Kimi/MiniMax) to generate on-topic replies, then pipe
  // them through the S2S model via SayHello (TTS only).
  let suppressModelOutput = false;
  let generatingResponse = false;
  // When true, the next TTS cycle is from a controlled SayHello whose
  // text is already tracked in questionTranscript — skip re-adding it.
  let skipNextTtsTranscript = false;
  // Track user turns on the current question so the LLM knows when to
  // wrap up and signal a transition.
  let userTurnsOnCurrentQ = 0;
  // When true, the LLM has signalled [NEXT] and we're waiting for the
  // acknowledgement TTS to finish before triggering the transition.
  let pendingTransitionAfterTts = false;
  let pendingPrevTransitionAfterTts = false;
  // After sending a controlled SayHello, we keep suppressModelOutput=true
  // until the SayHello's TTS actually starts (TTS_SENTENCE_START). This
  // prevents residual TTS audio from the model's interrupted auto-response
  // from leaking through.
  let awaitingSayHelloTts = false;

  const sortedQuestions = ctx.questions.sort(
    (a, b) => a.order - b.order
  );
  const configIsZh = isChineseInterview(ctx);
  let isZh = configIsZh;

  // Detect user's spoken language from ASR text and override isZh if the
  // user is speaking a different language than the interview config.
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

  // Apply starting question index for resumed sessions
  const startIdx = ctx.startQuestionIndex ?? 0;
  if (startIdx > 0 && startIdx < sortedQuestions.length) {
    currentQuestionIndex = startIdx;
  }

  // Max follow-up exchanges AFTER the initial answer.
  // e.g. MODERATE=2 means: initial answer + up to 2 follow-ups = 3 turns total.
  let maxFollowUps: number;
  switch (ctx.followUpDepth) {
    case "LIGHT":   maxFollowUps = 1; break;
    case "MODERATE": maxFollowUps = 3; break;
    case "DEEP":    maxFollowUps = 5; break;
    default:        maxFollowUps = 1;
  }

  log.info(
    `Interview: "${ctx.title}" (${sortedQuestions.length} questions, lang=${ctx.language}, startQ=${currentQuestionIndex})`
  );

  // ── LLM-controlled response generator ─────────────────────────
  // Called after each user utterance to produce an on-topic response.
  // The response is then spoken by the S2S model via SayHello.
  //
  // The LLM appends the token [NEXT] when the question is sufficiently
  // answered. The relay strips [NEXT] before speaking and triggers
  // handleTransition() automatically.

  const NEXT_TOKEN = "[NEXT]";
  const PREV_TOKEN = "[PREV]";

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
      if (whiteboardDirty && latestWhiteboardImage) {
        log.info("Whiteboard vision: calling vision LLM (race 800ms)");
        const visionPromise = describeWhiteboard(latestWhiteboardImage, isZh);
        const result = await Promise.race([
          visionPromise.then((desc) => ({ desc, timedOut: false })),
          new Promise<{ desc: string; timedOut: boolean }>((resolve) =>
            setTimeout(() => resolve({ desc: "", timedOut: true }), 800)
          ),
        ]);
        if (!result.timedOut && result.desc) {
          cachedWhiteboardDescription = result.desc;
          whiteboardDirty = false;
          log.info(`Whiteboard vision: description ready (${result.desc.length} chars)`);
        } else if (result.timedOut) {
          agentCtx.whiteboardLoading = true;
          pendingWhiteboardVision = true;
          log.info("Whiteboard vision: timed out, setting loading=true for two-phase");
          visionPromise.then((desc) => {
            if (desc) {
              cachedWhiteboardDescription = desc;
              whiteboardDirty = false;
              log.info(`Whiteboard vision: background description ready (${desc.length} chars)`);
            }
            pendingWhiteboardVision = false;
          }).catch(() => { pendingWhiteboardVision = false; });
        } else if (!result.timedOut && !result.desc) {
          // Vision returned quickly but empty (API error) — tell the LLM
          // we're "loading" so it says "let me check" instead of "can't see"
          agentCtx.whiteboardLoading = true;
          log.info("Whiteboard vision: returned empty (likely API error), treating as loading");
        }
      } else if (!cachedWhiteboardDescription && latestWhiteboardImage) {
        // Image exists but not dirty (already described) — use cached
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

    // Detect repetition: if last 2+ agent responses are similar, force diversity
    if (recentAgentResponses.length >= 2) {
      const last = recentAgentResponses[recentAgentResponses.length - 1];
      const prev = recentAgentResponses[recentAgentResponses.length - 2];
      if (last && prev && isSimilarResponse(last, prev)) {
        agentCtx.antiRepetition = isZh
          ? `\n**重要：你上面的回复已经重复了（"${last.slice(0, 40)}..."）。你必须用完全不同的方式回应。仔细阅读受访者最后一句话，如果他们在问你问题，请直接回答他们的问题。不要再说类似的话。**\n`
          : `\n**IMPORTANT: Your previous responses have been repetitive ("${last.slice(0, 40)}..."). You MUST respond differently. Read the participant's last message carefully — if they are asking you a question, answer it directly. Do NOT repeat similar phrasing.**\n`;
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
      followUpInstruction = bt(isZh, PROMPTS.followUp.pastLimit(NEXT_TOKEN));
    } else if (turnsLeft <= 0) {
      followUpInstruction = bt(isZh, PROMPTS.followUp.atLimit(NEXT_TOKEN));
    } else if (turnsLeft === 1) {
      followUpInstruction = bt(isZh, PROMPTS.followUp.oneLeft(NEXT_TOKEN));
    } else {
      followUpInstruction = bt(isZh, PROMPTS.followUp.remaining(turnsLeft, NEXT_TOKEN));
    }

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
      forceLanguage: userLangSamples.length > 0 ? (isZh ? "zh" : "en") : undefined,
    };

    const prompt = bt(isZh, isCodingOrWhiteboard
      ? PROMPTS.response.codingWb(promptParams)
      : PROMPTS.response.normal(promptParams));

    const maxTokens = getMaxTokensForQuestion(currentQ.type);
    const startMs = Date.now();
    let response = await callLLM(prompt, maxTokens);

    // Strip any type-label prefix the LLM might output (e.g. "追问型：", "FOLLOW-UP:")
    response = response.replace(/^(追问型|结束型|FOLLOW[- ]?UP|WRAP[- ]?UP)\s*[:：]\s*/i, "").trim();

    if (!forceSkip) {
      // Safety: if the LLM included [NEXT] alongside a follow-up or invitation
      // for the participant to keep talking, strip [NEXT].
      if (response.includes(NEXT_TOKEN) && replyKeepsConversationOpen(response.replace(NEXT_TOKEN, ""), isZh)) {
        log.info("Stripped [NEXT] — response still invites a participant reply");
        response = response.replace(NEXT_TOKEN, "").trim();
      }

      // Guard: never transition if no user response yet on this question
      if (response.includes(NEXT_TOKEN) && userTurnsOnCurrentQ === 0) {
        log.info("Stripped [NEXT] — no user response on this question yet");
        response = response.replace(NEXT_TOKEN, "").trim();
      }

      // Guard: never transition right after a correction
      if (response.includes(NEXT_TOKEN) && lastResponseWasCorrection) {
        log.info("Stripped [NEXT] — awaiting response to correction");
        response = response.replace(NEXT_TOKEN, "").trim();
      }
    }

    // Force-add [NEXT] if user explicitly asked to skip but LLM didn't comply
    if (forceSkip && !response.includes(NEXT_TOKEN)) {
      log.info("Force-adding [NEXT] — user explicitly asked to skip");
      response = response.trimEnd() + " " + NEXT_TOKEN;
    }

    // Track whether this response is a correction (for next turn's guard)
    lastResponseWasCorrection = isCorrection(response, isZh);
    if (lastResponseWasCorrection) {
      log.info("Response detected as correction — will guard next turn");
    }

    // Track response for anti-repetition
    const spokenResponse = response.replace(NEXT_TOKEN, "").replace(PREV_TOKEN, "").trim();
    if (spokenResponse) {
      recentAgentResponses.push(spokenResponse);
      if (recentAgentResponses.length > 5) recentAgentResponses.shift();
    }

    log.info(`Response LLM (${Date.now() - startMs}ms, ${maxTokens}tok, turn ${userTurnsOnCurrentQ}): "${response.slice(0, 100)}..."`);
    return response;
  }

  // ── Two-phase whiteboard follow-up ─────────────────────────────
  // When the vision LLM is still processing the whiteboard image,
  // we send an interim response first ("let me look at the whiteboard"),
  // then generate a real follow-up once the description is ready.

  function scheduleWhiteboardFollowUp() {
    const pollInterval = 300;
    const maxWait = 5000;
    let waited = 0;

    const poll = () => {
      if (isTransitioning || interviewDone || !volcWs || volcWs.readyState !== WebSocket.OPEN || !isAlive) return;

      if (!pendingWhiteboardVision && cachedWhiteboardDescription) {
        log.info("Whiteboard vision ready — sending follow-up response");
        generatingResponse = true;
        generateControlledResponse()
          .then((followUp) => {
            generatingResponse = false;
            if (!followUp || !volcWs || volcWs.readyState !== WebSocket.OPEN || !isAlive) {
              suppressModelOutput = false;
              return;
            }
            const spokenFollowUp = followUp.replace(NEXT_TOKEN, "").replace(PREV_TOKEN, "").trim();
            if (spokenFollowUp) {
              awaitingSayHelloTts = true;
              skipNextTtsTranscript = true;
              volcWs.send(buildSayHello(volcSessionId, spokenFollowUp));
              questionTranscript.push({ role: "assistant", text: spokenFollowUp });
              log.info("Sent whiteboard follow-up via SayHello");
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

  async function handleTransition(auto = false) {
    if (isTransitioning || interviewDone || !volcWs || !isAlive) return;
    isTransitioning = true;

    // Immediately suppress any in-flight TTS audio from the previous
    // controlled response so it doesn't overlap with the transition.
    suppressModelOutput = true;
    generatingResponse = false;
    skipNextTtsTranscript = false;

    try {
      // Tell browser to show transitioning UI.
      // `auto` lets the client decide whether to interrupt audio immediately
      // (manual) or let the current acknowledgement finish playing (auto).
      browserWs.send(JSON.stringify({ type: "transitioning", auto, direction: "next" }));

      const currentQ = sortedQuestions[currentQuestionIndex];
      const transcriptSnapshot = [...questionTranscript];
      questionTranscript = [];
      asrAccumulator = "";
      ttsAccumulator = "";
      userTurnsOnCurrentQ = 0;
      pendingTransitionAfterTts = false;
      pendingPrevTransitionAfterTts = false;
      awaitingSayHelloTts = false;
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
        // Run LLM summarization AND session teardown in parallel
        // to minimize transition latency.
        const summaryPromise = transcriptSnapshot.length > 0
          ? summarizeQuestion(currentQ.text, transcriptSnapshot, isZh)
          : Promise.resolve("");

        const sessionTeardownPromise = (async () => {
          try {
            volcWs!.send(buildFinishSession(volcSessionId));
            await waitForEvent(volcWs!, ServerEvent.SESSION_FINISHED, 5000);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("stream is done")) {
              log.info("Session already ended (expected race), reconnecting");
            } else {
              log.error("FinishSession failed, reconnecting:", msg);
            }
            await reconnectVolcengine();
          }
        })();

        // Wait for both to complete
        const [summary] = await Promise.all([summaryPromise, sessionTeardownPromise]);
        questionSummaries.push(summary);

        const nextQ = sortedQuestions[currentQuestionIndex];

        // Start new session with updated system_text containing accumulated context
        try {
          volcSessionId = randomUUID();
          const newSystemText = buildSystemText(ctx);
          volcWs!.send(
            buildStartSession(volcSessionId, ctx.aiName, newSystemText, buildTTSOptions(ctx.language))
          );
          await waitForEvent(volcWs!, ServerEvent.SESSION_STARTED, 5000);
          isAlive = true;
        } catch (sessionErr) {
          log.error("Session restart failed, using SayHello fallback:", sessionErr);
        }

        // Keep suppressed until the SayHello TTS actually starts so
        // that stale events from the old session are not forwarded.
        awaitingSayHelloTts = true;

        // SayHello with transition + next question (spoken aloud)
        const transition = buildTransitionSayHello(
          currentQuestionIndex,
          nextQ,
          isZh
        );
        volcWs!.send(buildSayHello(volcSessionId, transition));

        browserWs.send(
          JSON.stringify({
            type: "question_change",
            questionIndex: currentQuestionIndex,
            totalQuestions: sortedQuestions.length,
            auto,
          })
        );

        log.info(
          `→ Q${currentQuestionIndex + 1}/${sortedQuestions.length}: ${nextQ.text.slice(0, 60)}...`
        );
      } else {
        // Last question — still summarize for the final report
        if (transcriptSnapshot.length > 0) {
          const lastSummary = await summarizeQuestion(currentQ.text, transcriptSnapshot, isZh);
          questionSummaries.push(lastSummary);
        }

        // Brief pause so the acknowledgement and wrap-up don't run
        // back-to-back without giving the user a chance to react.
        if (auto) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          if (interviewDone) return;
        }

        // Don't end yet — the wrap-up asks "anything else to add?"
        // Wait for the user to respond (or a timeout) before ending.
        awaitingFinalResponse = true;
        pendingFinalTimeout = true;
        // Keep suppressed until the wrap-up SayHello's TTS actually starts,
        // preventing stale model events from triggering the final timeout.
        awaitingSayHelloTts = true;
        const wrapUp = buildWrapUpSayHello(isZh);
        volcWs!.send(buildSayHello(volcSessionId, wrapUp));
        skipNextTtsTranscript = true;
        questionTranscript.push({ role: "assistant", text: wrapUp });

        log.info("All questions covered, awaiting final response");
      }
    } catch (err) {
      log.error("Transition error:", err);
    } finally {
      isTransitioning = false;
    }
  }

  // ── Previous-question transition handler ───────────────────────

  async function handlePreviousTransition(auto = false) {
    if (isTransitioning || interviewDone || !volcWs || !isAlive) return;
    if (currentQuestionIndex <= 0) return; // Already at first question
    isTransitioning = true;

    suppressModelOutput = true;
    generatingResponse = false;
    skipNextTtsTranscript = false;

    try {
      browserWs.send(JSON.stringify({ type: "transitioning", auto, direction: "previous" }));

      const transcriptSnapshot = [...questionTranscript];
      questionTranscript = [];
      asrAccumulator = "";
      ttsAccumulator = "";
      userTurnsOnCurrentQ = 0;
      pendingTransitionAfterTts = false;
      pendingPrevTransitionAfterTts = false;
      awaitingSayHelloTts = false;
      lastResponseWasCorrection = false;
      cachedWhiteboardDescription = "";
      whiteboardDirty = !!latestWhiteboardImage;
      recentAgentResponses.length = 0;
      if (pendingLastQuestionTimeout) {
        clearTimeout(pendingLastQuestionTimeout);
        pendingLastQuestionTimeout = null;
      }

      // Summarize current question before going back
      const currentQ = sortedQuestions[currentQuestionIndex];
      if (transcriptSnapshot.length > 0) {
        const summary = await summarizeQuestion(currentQ.text, transcriptSnapshot, isZh);
        questionSummaries.push(summary);
      }

      currentQuestionIndex--;

      // Tear down current session
      try {
        volcWs!.send(buildFinishSession(volcSessionId));
        await waitForEvent(volcWs!, ServerEvent.SESSION_FINISHED, 5000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("stream is done")) {
          log.info("Session already ended (expected race), reconnecting");
        } else {
          log.error("FinishSession failed, reconnecting:", msg);
        }
        await reconnectVolcengine();
      }

      const prevQ = sortedQuestions[currentQuestionIndex];

      // Start new session
      try {
        volcSessionId = randomUUID();
        const newSystemText = buildSystemText(ctx);
        volcWs!.send(
          buildStartSession(volcSessionId, ctx.aiName, newSystemText, buildTTSOptions(ctx.language))
        );
        await waitForEvent(volcWs!, ServerEvent.SESSION_STARTED, 5000);
        isAlive = true;
      } catch (sessionErr) {
        log.error("Session restart failed:", sessionErr);
      }

      // Keep suppressed until the SayHello TTS actually starts so
      // that stale events from the old session are not forwarded.
      awaitingSayHelloTts = true;

      // SayHello with return-to-previous greeting
      const transition = buildReturnSayHello(
        currentQuestionIndex,
        prevQ,
        isZh
      );
      volcWs!.send(buildSayHello(volcSessionId, transition));

      browserWs.send(
        JSON.stringify({
          type: "question_change",
          questionIndex: currentQuestionIndex,
          totalQuestions: sortedQuestions.length,
          auto: false,
        })
      );

      log.info(
        `← Q${currentQuestionIndex + 1}/${sortedQuestions.length} (back): ${prevQ.text.slice(0, 60)}...`
      );
    } catch (err) {
      log.error("Previous transition error:", err);
    } finally {
      isTransitioning = false;
    }
  }

  // ── Build initial prompts ───────────────────────────────────────

  const systemPrompt = buildSystemText(ctx);
  const greeting = currentQuestionIndex > 0
    ? buildResumeGreeting(ctx, currentQuestionIndex)
    : buildGreeting(ctx);

  log.info("System text:", systemPrompt.slice(0, 300) + "...");
  log.info("SayHello:", greeting.slice(0, 200) + "...");

  // ── Connect to Volcengine ──────────────────────────────────────

  try {
    const connectId = randomUUID();
    const headers: Record<string, string> = {
      "X-Api-App-ID": APP_ID,
      "X-Api-Access-Key": ACCESS_TOKEN,
      "X-Api-Resource-Id": RESOURCE_ID,
      "X-Api-Connect-Id": connectId,
    };
    if (APP_KEY) {
      headers["X-Api-App-Key"] = APP_KEY;
    }

    log.info("Connecting to:", VOLCENGINE_WS_URL);

    volcWs = new WebSocket(VOLCENGINE_WS_URL, { headers });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Volcengine connection timeout")),
        10000
      );

      volcWs!.on("unexpected-response", (_req: unknown, res: IncomingMessage) => {
        clearTimeout(timeout);
        let body = "";
        res.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          log.error(
            `Volcengine rejected connection: HTTP ${res.statusCode}`
          );
          log.error("Response body:", body);
          reject(
            new Error(
              `Volcengine HTTP ${res.statusCode}: ${body || res.statusMessage}`
            )
          );
        });
      });

      volcWs!.on("open", () => {
        clearTimeout(timeout);
        log.info("Volcengine WS open");
        resolve();
      });
      volcWs!.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Step 1: StartConnection
    volcWs.send(buildStartConnection());
    log.info("Sent StartConnection");

    await waitForEvent(volcWs, ServerEvent.CONNECTION_STARTED, 5000);
    log.info("ConnectionStarted received");

    // Step 2: StartSession with system prompt (focused on Q1)
    volcWs.send(
      buildStartSession(volcSessionId, ctx.aiName, systemPrompt, buildTTSOptions(ctx.language))
    );
    log.info("Sent StartSession (Q1)");

    await waitForEvent(volcWs, ServerEvent.SESSION_STARTED, 5000);
    log.info("SessionStarted received");
    isAlive = true;

    // Notify browser
    browserWs.send(JSON.stringify({ type: "ready", sessionId: volcSessionId }));

    // Send initial question progress
    browserWs.send(
      JSON.stringify({
        type: "question_change",
        questionIndex: currentQuestionIndex,
        totalQuestions: sortedQuestions.length,
      })
    );

    // Step 3: SayHello with greeting + current question
    volcWs.send(buildSayHello(volcSessionId, greeting));
    log.info(`Sent SayHello with greeting + Q${currentQuestionIndex + 1}`);
  } catch (err) {
    log.error("Failed to connect to Volcengine:", err);
    browserWs.send(
      JSON.stringify({
        type: "error",
        message: `Volcengine connection failed: ${err instanceof Error ? err.message : err}`,
      })
    );
    browserWs.close();
    volcWs?.close();
    return;
  }

  // ── Relay: Volcengine → Browser ────────────────────────────────

  const volcOnMessage = (data: Buffer) => {
    try {
      const resp = parseResponse(Buffer.from(data));

      // Log every non-audio event for debugging
      if (resp.event !== ServerEvent.TTS_RESPONSE) {
        log.info(
          `Event ${resp.event} (type ${resp.messageType}):`,
          Buffer.isBuffer(resp.payload)
            ? `<binary ${resp.payload.length}b>`
            : JSON.stringify(resp.payload)
        );
      }

      if (resp.event === ServerEvent.TTS_RESPONSE) {
        // Audio → forward to browser ONLY if not suppressed
        if (!suppressModelOutput && Buffer.isBuffer(resp.payload)) {
          browserWs.send(resp.payload, { binary: true });
        }
      } else if (resp.event === ServerEvent.TTS_SENTENCE_START) {
        // If we're waiting for a SayHello's TTS to start, unsuppress so
        // its audio gets forwarded. We check tts_type to distinguish our
        // SayHello ("chat_tts_text") from the model's auto-response
        // ("default"), which may arrive first due to a race condition.
        if (awaitingSayHelloTts) {
          const p = resp.payload as Record<string, unknown>;
          if (p?.tts_type === "chat_tts_text") {
            awaitingSayHelloTts = false;
            suppressModelOutput = false;
            log.info("SayHello TTS started — unsuppressed");
          }
        }
        if (!suppressModelOutput) {
          const payload = resp.payload as Record<string, unknown>;
          const text = extractText(payload);
          if (text) {
            ttsAccumulator += (ttsAccumulator ? " " : "") + text;
          }
          browserWs.send(JSON.stringify({ type: "tts_text", data: payload }));
        }
      } else if (resp.event === ServerEvent.TTS_SENTENCE_END) {
        if (!suppressModelOutput) {
          browserWs.send(
            JSON.stringify({ type: "tts_sentence_end", data: resp.payload })
          );
        }
      } else if (resp.event === ServerEvent.TTS_ENDED) {
        if (!suppressModelOutput) {
          // Save accumulated text to transcript — unless it was a controlled
          // SayHello whose text we already pushed manually.
          if (!skipNextTtsTranscript && ttsAccumulator.trim()) {
            questionTranscript.push({
              role: "assistant",
              text: ttsAccumulator.trim(),
            });
          }
          skipNextTtsTranscript = false;
          browserWs.send(JSON.stringify({ type: "tts_ended" }));

          // If the LLM signalled [NEXT], the acknowledgement has now
          // finished playing — safe to transition.
          if (pendingTransitionAfterTts && !isTransitioning && !interviewDone) {
            pendingTransitionAfterTts = false;
            const isLastQuestion = currentQuestionIndex >= sortedQuestions.length - 1;
            if (isLastQuestion) {
              // Last question — don't transition immediately. Give the
              // user time to respond to the agent's reply (e.g. an
              // explanation request) before wrapping up the interview.
              log.info("TTS ended on last Q — waiting 15s for user response before wrap-up");
              pendingLastQuestionTimeout = setTimeout(() => {
                pendingLastQuestionTimeout = null;
                if (!isTransitioning && !interviewDone && !generatingResponse) {
                  log.info("No user response on last Q — auto-wrapping up");
                  handleTransition(/* auto */ true).catch(log.error);
                }
              }, 15_000);
            } else {
              log.info("TTS ended — triggering queued transition");
              handleTransition(/* auto */ true).catch(log.error);
            }
          }

          if (pendingPrevTransitionAfterTts && !isTransitioning && !interviewDone && currentQuestionIndex > 0) {
            pendingPrevTransitionAfterTts = false;
            log.info("TTS ended — queuing PREV transition after audio flush delay");
            setTimeout(() => {
              handlePreviousTransition(/* auto */ true).catch(log.error);
            }, 1500);
          }

          // Wrap-up TTS finished — give the user time to respond.
          // Suppress model output so its auto-response to user speech
          // doesn't leak; ASR is still forwarded regardless.
          if (pendingFinalTimeout) {
            pendingFinalTimeout = false;
            suppressModelOutput = true;
            finalResponseTimeout = setTimeout(() => {
              if (!interviewDone && !awaitingFinalResponse) return;
              awaitingFinalResponse = false;
              if (finalResponseTimeout) {
                clearTimeout(finalResponseTimeout);
                finalResponseTimeout = null;
              }
              // Say goodbye before ending
              const farewell = buildFarewellSayHello(isZh);
              suppressModelOutput = true;
              awaitingSayHelloTts = true;
              skipNextTtsTranscript = true;
              if (volcWs && volcWs.readyState === WebSocket.OPEN && isAlive) {
                volcWs.send(buildSayHello(volcSessionId, farewell));
                questionTranscript.push({ role: "assistant", text: farewell });
                pendingInterviewEnd = true;
                log.info("No final response after timeout, sending farewell");
              } else {
                endInterview();
              }
            }, 15_000);
          }

          // Farewell TTS finished — now end the interview
          if (pendingInterviewEnd) {
            pendingInterviewEnd = false;
            endInterview();
          }
        }
        // Always clear accumulator (even if suppressed)
        ttsAccumulator = "";
      } else if (resp.event === ServerEvent.ASR_INFO) {
        // User started speaking — always forward interrupt
        browserWs.send(JSON.stringify({ type: "interrupt" }));
      } else if (resp.event === ServerEvent.ASR_RESPONSE) {
        // ASR transcript — always forward (it's the user's speech)
        const payload = resp.payload as Record<string, unknown>;
        const results =
          (payload.results as Array<Record<string, unknown>>) || [];
        if (results.length > 0 && typeof results[0].text === "string") {
          asrAccumulator = results[0].text as string;
        }
        browserWs.send(JSON.stringify({ type: "asr", data: payload }));
      } else if (resp.event === ServerEvent.ASR_ENDED) {
        // User finished speaking
        const userText = asrAccumulator.trim();
        asrAccumulator = "";

        if (userText) {
          updateUserLanguage(userText);
          questionTranscript.push({ role: "user", text: userText });
          userTurnsOnCurrentQ++;
          lastResponseWasCorrection = false;
          browserWs.send(JSON.stringify({ type: "asr_ended", text: userText }));

          // User spoke — cancel any pending last-question auto-transition
          // so the conversation can continue naturally.
          if (pendingLastQuestionTimeout) {
            clearTimeout(pendingLastQuestionTimeout);
            pendingLastQuestionTimeout = null;
            log.info("User spoke — cancelled pending last-Q transition");
          }

          // After all questions answered, the user responds to "anything else?"
          // Send a farewell and end the interview after it plays.
          if (awaitingFinalResponse && !interviewDone && !generatingResponse) {
            awaitingFinalResponse = false;
            if (finalResponseTimeout) {
              clearTimeout(finalResponseTimeout);
              finalResponseTimeout = null;
            }

            const farewell = buildFarewellSayHello(isZh);
            suppressModelOutput = true;
            awaitingSayHelloTts = true;
            skipNextTtsTranscript = true;
            volcWs!.send(buildSayHello(volcSessionId, farewell));
            questionTranscript.push({ role: "assistant", text: farewell });
            pendingInterviewEnd = true;
            log.info("Final response received, sending farewell");
          }
          else if (!isTransitioning && !interviewDone && isUserEndRequest(userText)) {
            queueFarewellAndEnd(`Explicit interview end request: "${userText.slice(0, 80)}"`);
          }
          // Fast-path: unambiguous standalone commands (e.g. "next question", "skip")
          else if (!isTransitioning && !interviewDone && (isFastPrevRequest(userText) || isUserPrevRequest(userText))) {
            log.info("Fast-path: previous question request");
            handlePreviousTransition().catch(log.error);
          }
          else if (!isTransitioning && !interviewDone && isFastNextRequest(userText)) {
            log.info("Fast-path: next question request");
            handleTransition().catch(log.error);
          }
          // All other cases: let the LLM decide intent via [NEXT]/[PREV] tokens
          else if (!isTransitioning && !interviewDone && !generatingResponse) {
            const userWantsSkip = isUserSkipRequest(userText);
            if (userWantsSkip) log.info(`User skip intent detected: "${userText.slice(0, 80)}"`);

            // Suppress the S2S model's auto-response — we'll replace it
            suppressModelOutput = true;
            generatingResponse = true;
            generateControlledResponse({ forceSkip: userWantsSkip })
              .then((response) => {
                generatingResponse = false;
                if (!response || !volcWs || volcWs.readyState !== WebSocket.OPEN || !isAlive) {
                  suppressModelOutput = false;
                  return;
                }

                // Detect LLM navigation signals
                let shouldTransition = response.includes(NEXT_TOKEN);
                let shouldGoPrev = response.includes(PREV_TOKEN);
                const spokenText = response.replace(NEXT_TOKEN, "").replace(PREV_TOKEN, "").trim();

                // Fallback: if the LLM says "let's move on to the next question"
                // without including [NEXT], treat it as an implicit transition signal.
                // Skip if the response also contains a question — the agent is still
                // engaging the user and should wait for their answer.
                if (!shouldTransition && !shouldGoPrev && userTurnsOnCurrentQ > 0
                    && hasImplicitTransition(spokenText) && !replyKeepsConversationOpen(spokenText, isZh)) {
                  shouldTransition = true;
                  log.info("Implicit transition detected in response text");
                }

                if (!shouldGoPrev && !shouldTransition && hasImplicitPrevTransition(spokenText)) {
                  shouldGoPrev = true;
                  log.info("Implicit PREV transition detected in response text");
                }

                // Safety net: never transition if the spoken response still keeps
                // the conversational floor open for the participant.
                if (shouldTransition && !userWantsSkip && replyKeepsConversationOpen(spokenText, isZh)) {
                  shouldTransition = false;
                  log.info("Stripped transition — spoken response still invites a reply");
                }
                // For coding/whiteboard, also strip overly long responses.
                const currentType = sortedQuestions[currentQuestionIndex]?.type;
                if (shouldTransition && !userWantsSkip && (currentType === "CODING" || currentType === "WHITEBOARD")) {
                  if (spokenText.length > 80) {
                    shouldTransition = false;
                    log.info(`Stripped transition — coding/wb response too long (${spokenText.length} chars)`);
                  }
                }

                if (spokenText) {
                  awaitingSayHelloTts = true;
                  skipNextTtsTranscript = true;
                  volcWs.send(buildSayHello(volcSessionId, spokenText));
                  questionTranscript.push({ role: "assistant", text: spokenText });
                  log.info("Sent controlled response via SayHello");
                } else {
                  suppressModelOutput = false;
                }

                if (shouldGoPrev && !isTransitioning && !interviewDone && currentQuestionIndex > 0) {
                  if (spokenText) {
                    log.info("LLM signalled [PREV] — will go back after TTS ends");
                    pendingPrevTransitionAfterTts = true;
                  } else {
                    log.info("LLM signalled [PREV] — no spoken text, going back immediately");
                    handlePreviousTransition().catch(log.error);
                  }
                } else if (shouldTransition && !isTransitioning && !interviewDone) {
                  log.info("LLM signalled [NEXT] — will transition after TTS ends");
                  pendingTransitionAfterTts = true;
                }

                // Two-phase whiteboard: if vision was loading, schedule a follow-up
                // once the description is ready
                if (pendingWhiteboardVision && !shouldTransition && !shouldGoPrev) {
                  scheduleWhiteboardFollowUp();
                }
              })
              .catch((err) => {
                log.error("Response generation failed:", err);
                suppressModelOutput = false;
                generatingResponse = false;
                awaitingSayHelloTts = false;
              });
          }
        } else {
          browserWs.send(JSON.stringify({ type: "asr_ended", text: userText }));
        }
      } else if (resp.event === ServerEvent.CHAT_RESPONSE) {
        if (!suppressModelOutput) {
          browserWs.send(JSON.stringify({ type: "chat", data: resp.payload }));
        }
      } else if (resp.event === ServerEvent.CHAT_ENDED) {
        if (!suppressModelOutput) {
          browserWs.send(JSON.stringify({ type: "chat_ended" }));
        }
      } else if (
        resp.event === ServerEvent.SESSION_FINISHED ||
        resp.event === ServerEvent.SESSION_FAILED
      ) {
        // Only treat as terminal if not during a planned transition
        if (!isTransitioning) {
          log.info(`Session ended (event ${resp.event})`);
          isAlive = false;
        }
      } else if (resp.event !== undefined) {
        browserWs.send(
          JSON.stringify({
            type: "event",
            event: resp.event,
            data: resp.payload,
          })
        );
      }
    } catch (err) {
      log.error("Error parsing Volcengine message:", err);
    }
  };

  const volcOnClose = () => {
    log.info("Volcengine WS closed");
    isAlive = false;
    // During transitions we intentionally close the old socket to stop
    // stale audio.  Don't tear down the browser connection in that case.
    if (!isTransitioning && browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ type: "disconnected" }));
      browserWs.close();
    }
  };

  const volcOnError = (err: Error) => {
    log.error("Volcengine WS error:", err.message);
  };

  /** Attach the three volcWs event handlers.  Idempotent-safe because
   *  callers always removeAllListeners() on the old socket first. */
  function attachVolcHandlers() {
    volcWs!.on("message", volcOnMessage);
    volcWs!.on("close", volcOnClose);
    volcWs!.on("error", volcOnError);
  }

  /** Close the current Volcengine WebSocket and establish a fresh
   *  connection + StartConnection handshake. Used when FinishSession
   *  fails and stale events from the old session would otherwise leak. */
  async function reconnectVolcengine() {
    const oldWs = volcWs;
    if (oldWs) {
      oldWs.removeAllListeners();
      try { oldWs.close(); } catch { /* ignore */ }
    }

    const connectId = randomUUID();
    const headers: Record<string, string> = {
      "X-Api-App-ID": APP_ID,
      "X-Api-Access-Key": ACCESS_TOKEN,
      "X-Api-Resource-Id": RESOURCE_ID,
      "X-Api-Connect-Id": connectId,
    };
    if (APP_KEY) {
      headers["X-Api-App-Key"] = APP_KEY;
    }

    volcWs = new WebSocket(VOLCENGINE_WS_URL, { headers });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error("Volcengine reconnect timeout")),
        10000
      );
      volcWs!.on("open", () => { clearTimeout(t); resolve(); });
      volcWs!.on("error", (e) => { clearTimeout(t); reject(e); });
    });

    volcWs!.send(buildStartConnection());
    await waitForEvent(volcWs!, ServerEvent.CONNECTION_STARTED, 5000);

    attachVolcHandlers();
    log.info("Reconnected to Volcengine (fresh connection)");
  }

  // Attach handlers for the initial connection
  attachVolcHandlers();

  // ── Relay: Browser → Volcengine ────────────────────────────────

  browserWs.on("message", (data) => {
    if (!volcWs || volcWs.readyState !== WebSocket.OPEN) return;

    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "audio" && msg.data) {
        if (!isAlive || isTransitioning) return; // Drop audio during transitions
        const audioBuf = Buffer.from(msg.data, "hex");
        volcWs.send(buildSendAudio(volcSessionId, audioBuf));
      } else if (msg.type === "text_input" && msg.content) {
        // Text chat input — treat exactly like a completed voice utterance
        const userText = (msg.content as string).trim();
        if (userText && !isTransitioning && !interviewDone) {
          updateUserLanguage(userText);
          questionTranscript.push({ role: "user", text: userText });
          userTurnsOnCurrentQ++;
          lastResponseWasCorrection = false;
          // Interrupt any playing audio, then signal ASR completion
          browserWs.send(JSON.stringify({ type: "interrupt" }));
          browserWs.send(JSON.stringify({ type: "asr_ended", text: userText }));

          if (pendingLastQuestionTimeout) {
            clearTimeout(pendingLastQuestionTimeout);
            pendingLastQuestionTimeout = null;
          }

          if (awaitingFinalResponse && !generatingResponse) {
            awaitingFinalResponse = false;
            if (finalResponseTimeout) {
              clearTimeout(finalResponseTimeout);
              finalResponseTimeout = null;
            }
            const farewell = buildFarewellSayHello(isZh);
            suppressModelOutput = true;
            awaitingSayHelloTts = true;
            skipNextTtsTranscript = true;
            volcWs!.send(buildSayHello(volcSessionId, farewell));
            questionTranscript.push({ role: "assistant", text: farewell });
            pendingInterviewEnd = true;
          } else if (isUserEndRequest(userText)) {
            queueFarewellAndEnd(`Explicit interview end request (text): "${userText.slice(0, 80)}"`);
          } else if (isFastPrevRequest(userText) || isUserPrevRequest(userText)) {
            handlePreviousTransition().catch(log.error);
          } else if (isFastNextRequest(userText)) {
            handleTransition().catch(log.error);
          } else if (!generatingResponse) {
            const userWantsSkip = isUserSkipRequest(userText);
            if (userWantsSkip) log.info(`User skip intent detected (text): "${userText.slice(0, 80)}"`);

            suppressModelOutput = true;
            generatingResponse = true;
            generateControlledResponse({ forceSkip: userWantsSkip })
              .then((response) => {
                generatingResponse = false;
                if (!response || !volcWs || volcWs.readyState !== WebSocket.OPEN || !isAlive) {
                  suppressModelOutput = false;
                  return;
                }
                let shouldTransition = response.includes(NEXT_TOKEN);
                let shouldGoPrev = response.includes(PREV_TOKEN);
                const spokenText = response.replace(NEXT_TOKEN, "").replace(PREV_TOKEN, "").trim();

                if (!shouldTransition && !shouldGoPrev && userTurnsOnCurrentQ > 0
                    && hasImplicitTransition(spokenText) && !replyKeepsConversationOpen(spokenText, isZh)) {
                  shouldTransition = true;
                  log.info("Implicit transition detected in text-input response");
                }

                if (!shouldGoPrev && !shouldTransition && hasImplicitPrevTransition(spokenText)) {
                  shouldGoPrev = true;
                  log.info("Implicit PREV transition detected in text-input response");
                }

                if (shouldTransition && !userWantsSkip && replyKeepsConversationOpen(spokenText, isZh)) {
                  shouldTransition = false;
                  log.info("Stripped transition — text-input response still invites a reply");
                }
                const currentType = sortedQuestions[currentQuestionIndex]?.type;
                if (shouldTransition && !userWantsSkip && (currentType === "CODING" || currentType === "WHITEBOARD")) {
                  if (spokenText.length > 80) {
                    shouldTransition = false;
                    log.info(`Stripped transition — coding/wb response too long (${spokenText.length} chars)`);
                  }
                }

                if (spokenText) {
                  awaitingSayHelloTts = true;
                  skipNextTtsTranscript = true;
                  volcWs!.send(buildSayHello(volcSessionId, spokenText));
                  questionTranscript.push({ role: "assistant", text: spokenText });
                } else {
                  suppressModelOutput = false;
                }

                if (shouldGoPrev && !isTransitioning && !interviewDone && currentQuestionIndex > 0) {
                  if (spokenText) {
                    log.info("LLM signalled [PREV] — will go back after TTS ends (text input)");
                    pendingPrevTransitionAfterTts = true;
                  } else {
                    log.info("LLM signalled [PREV] — no spoken text, going back immediately (text input)");
                    handlePreviousTransition().catch(log.error);
                  }
                } else if (shouldTransition && !isTransitioning && !interviewDone) {
                  pendingTransitionAfterTts = true;
                }
              })
              .catch((err) => {
                log.error("Text response generation failed:", err);
                suppressModelOutput = false;
                generatingResponse = false;
                awaitingSayHelloTts = false;
              });
          }
          log.info(`Text input: "${userText.slice(0, 60)}..."`);
        }
      } else if (msg.type === "next_question") {
        log.info("Browser requested next question");
        handleTransition().catch(log.error);
      } else if (msg.type === "prev_question") {
        log.info("Browser requested previous question");
        handlePreviousTransition().catch(log.error);
      } else if (msg.type === "text" && msg.content) {
        volcWs.send(buildSayHello(volcSessionId, msg.content));
      } else if (msg.type === "code_update") {
        currentCodeContent = (msg.content as string) || "";
        currentCodeLanguage = (msg.language as string) || "plaintext";
      } else if (msg.type === "whiteboard_update") {
        const img = (msg.imageDataUrl as string) || "";
        if (img && img !== latestWhiteboardImage) {
          latestWhiteboardImage = img;
          whiteboardDirty = true;
          log.info(`Whiteboard update received (${Math.round(img.length / 1024)}KB, dirty=true)`);
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
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    if (finalResponseTimeout) clearTimeout(finalResponseTimeout);
    if (pendingLastQuestionTimeout) clearTimeout(pendingLastQuestionTimeout);
    if (isAlive && volcWs && volcWs.readyState === WebSocket.OPEN) {
      try {
        volcWs.send(buildFinishSession(volcSessionId));
        volcWs.send(buildFinishConnection());
      } catch {
        // ignore
      }
    }
    volcWs?.close();
  });

  browserWs.on("error", (err) => {
    log.error("Browser WS error:", err.message);
  });

  // ── Keep-alive: send silence periodically ──────────────────────

  keepAliveInterval = setInterval(() => {
    if (!isAlive || !volcWs || volcWs.readyState !== WebSocket.OPEN) {
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      return;
    }
    // 100ms of silence at 16kHz int16 mono = 3200 bytes
    const silence = Buffer.alloc(3200);
    volcWs.send(buildSendAudio(volcSessionId, silence));
  }, 5000);
}

// ── Helper: wait for a specific event ───────────────────────────────

function waitForEvent(
  ws: WebSocket,
  targetEvent: number,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timeout waiting for event ${targetEvent}`)),
      timeoutMs
    );

    const handler = (data: Buffer) => {
      try {
        const resp = parseResponse(Buffer.from(data));

        if (resp.event === targetEvent) {
          clearTimeout(timeout);
          ws.removeListener("message", handler);
          resolve();
        } else if (
          resp.messageType === SERVER_ERROR_RESPONSE ||
          resp.event === ServerEvent.SESSION_FAILED ||
          resp.event === ServerEvent.CONNECTION_FAILED
        ) {
          clearTimeout(timeout);
          ws.removeListener("message", handler);
          const payloadStr = Buffer.isBuffer(resp.payload) ? "<binary>" : JSON.stringify(resp.payload);
          reject(new Error(`Server error (type=${resp.messageType}): ${payloadStr}`));
        }
      } catch (err) {
        log.error("Parse error in handshake:", err);
      }
    };

    ws.on("message", handler);
  });
}
