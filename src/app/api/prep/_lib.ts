import { getAuthUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const log = createLogger("api/prep");

export type InterviewForPrep = {
  id: string;
  userId: string;
  projectId: string | null;
  language: string;
  followUpDepth: "LIGHT" | "MODERATE" | "DEEP";
  jobDescription: string | null;
  resumeText: string | null;
  companyName: string | null;
  roleTitle: string | null;
  title: string;
};

export type QuestionForPrep = {
  id: string;
  interviewId: string;
  text: string;
  description: string | null;
  type: string;
};

const MAX_CONTEXT_CHARS = 15_000;

export function trimForPrompt(value: string | null | undefined): string {
  if (!value) return "";
  return value.length > MAX_CONTEXT_CHARS
    ? `${value.slice(0, MAX_CONTEXT_CHARS)}\n\n[...truncated]`
    : value;
}

export async function userCanAccessPrepInterview(
  interview: InterviewForPrep,
  userId: string,
): Promise<boolean> {
  if (interview.userId === userId) return true;
  if (!interview.projectId) return false;

  const orgId = await resolveOrgIdFromInterview(interview);
  if (!orgId) return false;

  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("workspaceId", orgId)
    .eq("userId", userId)
    .single();
  if (!membership) return false;

  const { count } = await supabaseAdmin
    .from("project_members")
    .select("id", { count: "exact", head: true })
    .eq("projectId", interview.projectId);
  if ((count ?? 0) === 0) return true;

  const { data: projectMembership } = await supabaseAdmin
    .from("project_members")
    .select("id")
    .eq("projectId", interview.projectId)
    .eq("userId", userId)
    .single();

  return Boolean(projectMembership);
}

/** Authenticate request, then return an interview the user can access. */
export async function authedInterview(
  interviewId: string,
): Promise<{ user: { id: string }; interview: InterviewForPrep } | { error: Response }> {
  const user = await getAuthUser();
  if (!user) {
    return {
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  const { data: interview } = await supabaseAdmin
    .from("interviews")
    .select(
      'id, "userId", "projectId", language, "followUpDepth", "jobDescription", "resumeText", "companyName", "roleTitle", title',
    )
    .eq("id", interviewId)
    .single();

  if (!interview) {
    return {
      error: new Response(JSON.stringify({ error: "Interview not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  const typedInterview = interview as unknown as InterviewForPrep;
  const canAccess = await userCanAccessPrepInterview(typedInterview, user.id);
  if (!canAccess) {
    return {
      error: new Response(JSON.stringify({ error: "Interview not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  return {
    user: { id: user.id },
    interview: typedInterview,
  };
}

export async function resolveOrgIdFromInterview(
  interview: InterviewForPrep,
): Promise<string | null> {
  if (!interview.projectId) return null;
  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("organizationId")
    .eq("id", interview.projectId)
    .single();
  return (project?.organizationId as string | null) ?? null;
}

export const sse = (obj: Record<string, unknown>): Uint8Array =>
  new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);

export const sseDone = (): Uint8Array =>
  new TextEncoder().encode(`data: [DONE]\n\n`);

/** Guards SSE enqueue/close when the client disconnects or aborts the request. */
export function createSafeSseStreamWriter(
  controller: ReadableStreamDefaultController<Uint8Array>,
  signal: AbortSignal,
) {
  let closed = false;
  const markClosed = () => {
    closed = true;
  };
  signal.addEventListener("abort", markClosed, { once: true });

  const enqueue = (chunk: Uint8Array): boolean => {
    if (closed || signal.aborted) return false;
    try {
      controller.enqueue(chunk);
      return true;
    } catch {
      closed = true;
      return false;
    }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    try {
      controller.close();
    } catch {
      /* stream already closed */
    }
  };

  return {
    get aborted() {
      return closed || signal.aborted;
    },
    enqueue,
    close,
  };
}

export function streamHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

export const FOLLOW_UP_DEPTH_TURNS: Record<"LIGHT" | "MODERATE" | "DEEP", number> = {
  LIGHT: 0,
  MODERATE: 1,
  DEEP: 3,
};

export class LlmStreamTimeoutError extends Error {
  constructor(message = "LLM stream timed out") {
    super(message);
    this.name = "LlmStreamTimeoutError";
  }
}

async function nextWithTimeout<T>(
  iterator: AsyncIterator<T>,
  timeoutMs: number,
): Promise<IteratorResult<T>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise<IteratorResult<T>>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new LlmStreamTimeoutError());
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function drainLlmStream(
  stream: AsyncIterable<string>,
  onToken: (token: string) => void,
  options?: {
    idleTimeoutMs?: number;
    totalTimeoutMs?: number;
    /** Called when no tokens arrive for heartbeatMs (keeps SSE connections alive). */
    onHeartbeat?: () => void;
    heartbeatMs?: number;
  },
): Promise<void> {
  const idleTimeoutMs = options?.idleTimeoutMs ?? 20_000;
  const totalTimeoutMs = options?.totalTimeoutMs ?? 45_000;
  const heartbeatMs = options?.heartbeatMs ?? 4_000;
  const iterator = stream[Symbol.asyncIterator]();
  const startedAt = Date.now();
  let lastTokenAt = Date.now();

  const heartbeat =
    options?.onHeartbeat &&
    setInterval(() => {
      if (Date.now() - lastTokenAt >= heartbeatMs) {
        options.onHeartbeat?.();
        lastTokenAt = Date.now();
      }
    }, heartbeatMs);

  try {
    while (true) {
      const remainingMs = totalTimeoutMs - (Date.now() - startedAt);
      if (remainingMs <= 0) {
        throw new LlmStreamTimeoutError("LLM stream exceeded total timeout");
      }

      const result = await nextWithTimeout(
        iterator,
        Math.min(idleTimeoutMs, remainingMs),
      );
      if (result.done) break;
      lastTokenAt = Date.now();
      onToken(result.value);
    }
  } catch (err) {
    void Promise.race([
      iterator.return?.() ?? Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, 1_000)),
    ]).catch(() => undefined);
    throw err;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}

/**
 * Stateful filter that strips reasoning-mode <think>...</think> blocks from
 * what the user sees, while preserving the full raw output for downstream
 * JSON parsing. Some models (e.g. Kimi k2.5) wrap their JSON inside the
 * thinking block, so JSON extraction must run against `state.fullContent`,
 * not the visible string.
 */
const THINK_OPEN_TAGS = ['<think>', '<redacted_thinking>'] as const;
const THINK_CLOSE_TAGS = [
  '</think>',
  '</redacted_thinking>',
  '</redacted_thinking>',
] as const;

function findThinkOpenIndex(text: string): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null;
  for (const tag of THINK_OPEN_TAGS) {
    const index = text.indexOf(tag);
    if (index >= 0 && (best === null || index < best.index)) {
      best = { index, length: tag.length };
    }
  }
  return best;
}

function findThinkCloseIndex(text: string): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null;
  for (const tag of THINK_CLOSE_TAGS) {
    const index = text.indexOf(tag);
    if (index >= 0 && (best === null || index < best.index)) {
      best = { index, length: tag.length };
    }
  }
  return best;
}

/** Remove reasoning blocks before JSON extraction. */
export function stripThinkBlocks(raw: string): string {
  let text = raw;
  for (const open of THINK_OPEN_TAGS) {
    for (const close of THINK_CLOSE_TAGS) {
      const pattern = new RegExp(
        `${open.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${close.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "gi",
      );
      text = text.replace(pattern, "");
    }
  }
  return text.trim();
}

export function createThinkFilter() {
  const state = { inThink: false, fullContent: "" };
  function feed(chunk: string): string {
    state.fullContent += chunk;
    let remaining = chunk;
    let visible = "";
    while (remaining.length > 0) {
      if (state.inThink) {
        const close = findThinkCloseIndex(remaining);
        if (close) {
          state.inThink = false;
          remaining = remaining.slice(close.index + close.length);
        } else {
          remaining = "";
        }
      } else {
        const open = findThinkOpenIndex(remaining);
        if (open) {
          const before = remaining.slice(0, open.index);
          if (before) visible += before;
          state.inThink = true;
          remaining = remaining.slice(open.index + open.length);
        } else {
          visible += remaining;
          remaining = "";
        }
      }
    }
    return visible;
  }
  return { feed, state };
}

/** Split model output into thinking vs visible content streams (for SSE). */
export function createThinkStreamSplitter(handlers: {
  onThinking: (text: string) => void;
  onContent: (text: string) => void;
}) {
  const state = { inThink: false, fullContent: "" };

  function feed(chunk: string) {
    state.fullContent += chunk;
    let remaining = chunk;
    while (remaining.length > 0) {
      if (state.inThink) {
        const close = findThinkCloseIndex(remaining);
        if (close) {
          const thinkText = remaining.slice(0, close.index);
          if (thinkText) handlers.onThinking(thinkText);
          state.inThink = false;
          remaining = remaining.slice(close.index + close.length);
        } else {
          if (remaining) handlers.onThinking(remaining);
          remaining = "";
        }
      } else {
        const open = findThinkOpenIndex(remaining);
        if (open) {
          const before = remaining.slice(0, open.index);
          if (before) handlers.onContent(before);
          state.inThink = true;
          remaining = remaining.slice(open.index + open.length);
        } else {
          if (remaining) handlers.onContent(remaining);
          remaining = "";
        }
      }
    }
  }

  return { feed, state };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Stream a short thinking line + feedback preview when the LLM stream fails. */
export async function streamFeedbackFallbackPreview(
  enqueue: (chunk: Uint8Array) => void,
  feedback: { verdict: string; summary: string },
) {
  const thinking =
    "Reviewing your answer against the role requirements and your resume…\n";
  for (const char of thinking) {
    enqueue(sse({ type: "thinking", text: char }));
    await sleep(8);
  }
  const preview = `${feedback.verdict}. ${feedback.summary}`;
  for (const token of preview.match(/[\s\S]{1,14}/g) ?? []) {
    enqueue(sse({ token }));
    await sleep(12);
  }
}
