/** Dev-oriented latency marks for practice feedback (voice + text). */

export type PrepFeedbackDiagEvent =
  | "recording_complete"
  | "submit_click"
  | "metrics_start"
  | "metrics_done"
  | "base64_start"
  | "base64_done"
  | "user_message_shown"
  | "feedback_card_shown"
  | "fetch_start"
  | "fetch_response"
  | "first_sse_byte"
  | "first_thinking_sse"
  | "first_content_token"
  | "final_sse_received"
  | "stream_complete";

type Mark = {
  event: PrepFeedbackDiagEvent;
  elapsedMs: number;
  meta?: Record<string, unknown>;
};

let traceId: string | null = null;
let t0 = 0;
const marks: Mark[] = [];

function isEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

function shortId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Start a new client-side trace; returns trace id for server correlation. */
export function startPrepFeedbackDiag(
  sessionId: string,
  questionId: string,
): string {
  traceId = `${sessionId.slice(0, 8)}:${questionId.slice(0, 8)}:${shortId()}`;
  t0 = performance.now();
  marks.length = 0;
  markPrepFeedbackDiag("submit_click", { sessionId, questionId });
  return traceId;
}

export function getPrepFeedbackDiagTraceId(): string | null {
  return traceId;
}

export function markPrepFeedbackDiag(
  event: PrepFeedbackDiagEvent,
  meta?: Record<string, unknown>,
): void {
  if (!isEnabled() || !traceId) return;
  const elapsedMs = Math.round(performance.now() - t0);
  marks.push({ event, elapsedMs, meta });
  console.info(`[prep-feedback-diag] ${traceId} +${elapsedMs}ms ${event}`, meta ?? "");
}

/** Mark time since recording stopped (before submit). */
export function markRecordingComplete(meta?: Record<string, unknown>): void {
  if (!isEnabled()) return;
  console.info("[prep-feedback-diag] recording_complete", meta ?? "");
}

export function finishPrepFeedbackDiag(meta?: Record<string, unknown>): void {
  if (!isEnabled() || !traceId) return;
  markPrepFeedbackDiag("stream_complete", meta);
  console.info(`[prep-feedback-diag] ${traceId} summary`, marks);
  traceId = null;
  marks.length = 0;
}

export function abortPrepFeedbackDiag(): void {
  traceId = null;
  marks.length = 0;
}
