import { GoogleGenAI, type Content, type Part } from "@google/genai";
import {
    type GenerationParams,
    type LLMContentPart,
    type LLMMessage,
    type LLMProvider,
    type LLMResponse,
} from "../types";

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const MAX_RETRIES = 3;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(error: unknown): boolean {
  const status =
    (error as { status?: number })?.status ??
    (error as { code?: number })?.code;
  return typeof status === "number" && RETRYABLE_STATUSES.has(status);
}

function partFromContentPart(part: LLMContentPart): Part | null {
  if (part.type === "text") {
    return { text: part.text };
  }
  if (part.type === "inline_audio") {
    return {
      inlineData: {
        mimeType: part.mimeType,
        data: part.data,
      },
    };
  }
  if (part.type === "image_url") {
    const url = part.image_url.url;
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return { inlineData: { mimeType: match[1], data: match[2] } };
      }
    }
    return { text: `[image: ${url}]` };
  }
  return null;
}

function messageToParts(content: string | LLMContentPart[]): Part[] {
  if (typeof content === "string") {
    return content.trim() ? [{ text: content }] : [];
  }
  const parts: Part[] = [];
  for (const p of content) {
    const mapped = partFromContentPart(p);
    if (mapped) parts.push(mapped);
  }
  return parts;
}

function toGeminiRequest(messages: LLMMessage[]): {
  systemInstruction: string;
  contents: Content[];
} {
  const systemChunks: string[] = [];
  const contents: Content[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content
              .filter((p) => p.type === "text")
              .map((p) => (p.type === "text" ? p.text : ""))
              .join("\n");
      if (text.trim()) systemChunks.push(text.trim());
      continue;
    }

    const parts = messageToParts(message.content);
    if (parts.length === 0) continue;
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts,
    });
  }

  // Gemini requires at least one user/model turn (system-only fails with "contents are required").
  if (contents.length === 0) {
    contents.push({
      role: "user",
      parts: [{ text: "Please begin the interview." }],
    });
  }

  return {
    systemInstruction: systemChunks.join("\n\n"),
    contents,
  };
}

export class GeminiProvider implements LLMProvider {
  id = "gemini";
  name = "Google Gemini";
  models = [DEFAULT_MODEL, "gemini-2.5-flash", "gemini-2.5-pro"];
  defaultModel = DEFAULT_MODEL;

  private client: GoogleGenAI | null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  private ensureClient(): GoogleGenAI {
    if (!this.client) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    return this.client;
  }

  async generateResponse(
    params: GenerationParams & { model?: string },
  ): Promise<LLMResponse> {
    const client = this.ensureClient();
    const model = params.model ?? this.defaultModel;
    const { systemInstruction, contents } = toGeminiRequest(params.messages);

    let response: Awaited<ReturnType<typeof client.models.generateContent>> | null =
      null;
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        response = await client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: systemInstruction || undefined,
            temperature: params.temperature ?? 0.25,
            maxOutputTokens: params.maxTokens ?? 2048,
          },
        });
        break;
      } catch (error) {
        lastError = error;
        if (!isRetryableGeminiError(error) || attempt === MAX_RETRIES - 1) {
          throw error;
        }
        await sleep(1000 * 2 ** attempt);
      }
    }

    if (!response) {
      throw lastError ?? new Error("Gemini generateContent failed");
    }

    return {
      content: response.text ?? "",
      finishReason: "stop",
      usage: response.usageMetadata
        ? {
            promptTokens: response.usageMetadata.promptTokenCount ?? 0,
            completionTokens: response.usageMetadata.candidatesTokenCount ?? 0,
            totalTokens: response.usageMetadata.totalTokenCount ?? 0,
          }
        : undefined,
    };
  }

  async *streamResponse(
    params: GenerationParams & { model?: string },
  ): AsyncIterable<string> {
    const client = this.ensureClient();
    const model = params.model ?? this.defaultModel;
    const { systemInstruction, contents } = toGeminiRequest(params.messages);

    const stream = await client.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: systemInstruction || undefined,
        temperature: params.temperature ?? 0.25,
        maxOutputTokens: params.maxTokens ?? 2048,
      },
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
    }
  }
}
