"use client";

/**
 * Read a Server-Sent Events stream of prep feedback / hint / follow-up tokens.
 *
 * Each event is a JSON object on a line prefixed with "data:". A line of
 * "data: [DONE]" terminates the stream.
 *
 * Tokens are surfaced via onToken; the final non-token event (e.g. with
 * `feedback` / `nextPrompt`) is returned. Token-only streams (like hint)
 * resolve to null.
 */
export async function readPrepStream<TFinal extends Record<string, unknown>>(
  response: Response,
  onToken: (token: string) => void,
  options?: {
    signal?: AbortSignal;
    onThinking?: (text: string) => void;
    onFirstByte?: () => void;
    onFirstThinking?: () => void;
    onFirstToken?: () => void;
    onFinal?: (payload: TFinal) => void;
    onPersisted?: (payload: {
      attemptId?: string;
      audioUrl?: string;
      audioCreatedAt?: string;
      audioDurationSeconds?: number;
    }) => void;
    onPersistWarning?: (message: string) => void;
  },
): Promise<TFinal | null> {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response has no body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let lastPayload: TFinal | null = null;
  let firstByteSeen = false;
  let firstThinkingSeen = false;
  let firstTokenSeen = false;

  while (true) {
    if (options?.signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw new DOMException("Aborted", "AbortError");
    }
    const { done, value } = await reader.read();
    if (done) break;
    if (!firstByteSeen) {
      firstByteSeen = true;
      options?.onFirstByte?.();
    }
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 2);
      if (!rawEvent.startsWith("data:")) continue;

      const payload = rawEvent.slice(5).trim();
      if (payload === "[DONE]") continue;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        continue;
      }

      if (typeof parsed.error === "string") {
        throw new Error(parsed.error);
      }
      if (parsed.type === "thinking" && typeof parsed.text === "string") {
        if (!firstThinkingSeen) {
          firstThinkingSeen = true;
          options?.onFirstThinking?.();
        }
        options?.onThinking?.(parsed.text);
        continue;
      }
      if (typeof parsed.token === "string") {
        if (!firstTokenSeen) {
          firstTokenSeen = true;
          options?.onFirstToken?.();
        }
        onToken(parsed.token);
        continue;
      }
      if (parsed.type === "persisted") {
        options?.onPersisted?.({
          attemptId:
            typeof parsed.attemptId === "string" ? parsed.attemptId : undefined,
          audioUrl:
            typeof parsed.audioUrl === "string" ? parsed.audioUrl : undefined,
          audioCreatedAt:
            typeof parsed.audioCreatedAt === "string"
              ? parsed.audioCreatedAt
              : undefined,
          audioDurationSeconds:
            typeof parsed.audioDurationSeconds === "number"
              ? parsed.audioDurationSeconds
              : undefined,
        });
        continue;
      }
      if (parsed.type === "persist_warning") {
        options?.onPersistWarning?.(
          typeof parsed.message === "string"
            ? parsed.message
            : "Failed to save this attempt",
        );
        continue;
      }
      if (parsed.feedback && typeof parsed.feedback === "object") {
        const payload = parsed as TFinal;
        lastPayload = payload;
        options?.onFinal?.(payload);
        continue;
      }
      lastPayload = parsed as TFinal;
    }
  }

  return lastPayload;
}
