import { getAuthUser } from "@/lib/auth";
import { getProvider, GENERATOR_MODEL } from "@/lib/ai/registry";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/ai/generate");
import { buildGeneratorPrompt } from "@/lib/ai/prompts/generator";
function parseJsonSafe(raw: string): unknown {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse AI response as JSON");
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    let repaired = jsonMatch[0].replace(/,\s*$/, "");
    const opens = (repaired.match(/\[/g) || []).length - (repaired.match(/\]/g) || []).length;
    const braces = (repaired.match(/\{/g) || []).length - (repaired.match(/\}/g) || []).length;
    for (let i = 0; i < opens; i++) repaired += "]";
    for (let i = 0; i < braces; i++) repaired += "}";
    return JSON.parse(repaired);
  }
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { description, durationMinutes, language } = await req.json();
  if (!description) {
    return new Response(JSON.stringify({ error: "Description is required" }), { status: 400 });
  }

  const provider = getProvider(GENERATOR_MODEL);
  const messages = buildGeneratorPrompt(description, durationMinutes, language);

  const encoder = new TextEncoder();
  const sse = (obj: Record<string, unknown>) =>
    encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const enqueue = (data: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(data);
        } catch {
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      const MAX_RETRIES = 2;

      const collectLlmContent = async (streamToClient: boolean) => {
        let inThink = false;
        let fullContent = "";
        for await (const chunk of provider.streamResponse({
          messages,
          temperature: 0.7,
          maxTokens: 8192,
          model: GENERATOR_MODEL,
        })) {
          let remaining = chunk;
          while (remaining.length > 0) {
            if (inThink) {
              const endIdx = remaining.indexOf("</think>");
              if (endIdx >= 0) {
                const thinkText = remaining.slice(0, endIdx);
                if (thinkText && streamToClient) enqueue(sse({ type: "thinking", text: thinkText }));
                inThink = false;
                remaining = remaining.slice(endIdx + "</think>".length);
              } else {
                if (streamToClient) enqueue(sse({ type: "thinking", text: remaining }));
                remaining = "";
              }
            } else {
              const startIdx = remaining.indexOf("<think>");
              if (startIdx >= 0) {
                const before = remaining.slice(0, startIdx);
                if (before) {
                  fullContent += before;
                  if (streamToClient) enqueue(sse({ type: "content", text: before }));
                }
                inThink = true;
                remaining = remaining.slice(startIdx + "<think>".length);
              } else {
                fullContent += remaining;
                if (streamToClient) enqueue(sse({ type: "content", text: remaining }));
                remaining = "";
              }
            }
          }
        }
        return fullContent;
      };

      try {
        let generated: { questions?: unknown[] } | null = null;
        let lastError: unknown;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            const fullContent = await collectLlmContent(attempt === 0);
            generated = parseJsonSafe(fullContent) as { questions?: unknown[] };
            break;
          } catch (error) {
            lastError = error;
            if (attempt < MAX_RETRIES) {
              log.warn(`Generation attempt ${attempt + 1} failed (JSON parse), retrying...`, error);
              enqueue(sse({ type: "status", message: `Output was malformed, retrying (${attempt + 2}/${MAX_RETRIES + 1})…` }));
            }
          }
        }

        if (!generated) {
          throw lastError ?? new Error("Failed to parse AI response after retries");
        }

        enqueue(sse({ type: "done", data: generated }));
      } catch (error) {
        log.error("Interview generation error:", error);
        enqueue(sse({ type: "error", message: "Failed to generate interview" }));
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
