/**
 * Voice-relay text LLM (summaries + interviewer replies).
 * Default: Gemini gemini-3.1-flash-lite @ temperature 0.
 * Fallback: MiniMax abab6.5s-chat when Gemini fails and MINIMAX_API_KEY is set.
 */

import { GoogleGenAI } from "@google/genai";
import { createLogger } from "../src/lib/logger";

const log = createLogger("relay-llm");

export const RELAY_LLM_PRIMARY_MODEL = "gemini-3.1-flash-lite";
export const RELAY_LLM_FALLBACK_MODEL = "abab6.5s-chat";

interface RelayLlmEndpoint {
  model: string;
  temperature: number;
  apiKey: string;
  baseUrl: string;
  useGemini: boolean;
}

let cachedChain: RelayLlmEndpoint[] | null = null;
let geminiClient: GoogleGenAI | null = null;
let logged = false;

function parseTemperature(): number {
  const raw = process.env.RELAY_LLM_TEMPERATURE?.trim();
  if (raw === undefined || raw === "") return 0;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0 || v > 2) {
    log.warn(`Invalid RELAY_LLM_TEMPERATURE="${raw}", using 0`);
    return 0;
  }
  return v;
}

function usesGemini(model: string): boolean {
  const provider = process.env.RELAY_LLM_PROVIDER?.trim().toLowerCase();
  if (provider === "gemini") return true;
  if (provider === "openai") return false;
  return model.toLowerCase().startsWith("gemini");
}

function resolvePrimaryEndpoint(): RelayLlmEndpoint {
  const model = process.env.RELAY_LLM_MODEL?.trim() || RELAY_LLM_PRIMARY_MODEL;
  const useGemini = usesGemini(model);
  const apiKey = useGemini
    ? (process.env.RELAY_LLM_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || "")
    : (
        process.env.RELAY_LLM_API_KEY?.trim() ||
        process.env.KIMI_API_KEY?.trim() ||
        process.env.MINIMAX_API_KEY?.trim() ||
        ""
      );
  const baseUrl =
    process.env.RELAY_LLM_BASE_URL?.trim() ||
    (process.env.KIMI_API_KEY
      ? process.env.KIMI_BASE_URL?.trim() || "https://api.moonshot.cn/v1"
      : process.env.MINIMAX_BASE_URL?.trim() || "https://api.minimaxi.com/v1");

  return {
    model,
    temperature: parseTemperature(),
    apiKey,
    baseUrl,
    useGemini,
  };
}

function resolveFallbackEndpoint(primary: RelayLlmEndpoint): RelayLlmEndpoint | null {
  const model =
    process.env.RELAY_LLM_FALLBACK_MODEL?.trim() || RELAY_LLM_FALLBACK_MODEL;
  const apiKey = process.env.MINIMAX_API_KEY?.trim() || "";
  if (!apiKey) return null;

  const baseUrl =
    process.env.RELAY_LLM_FALLBACK_BASE_URL?.trim() ||
    process.env.MINIMAX_BASE_URL?.trim() ||
    "https://api.minimaxi.com/v1";

  const fallback: RelayLlmEndpoint = {
    model,
    temperature: parseTemperature(),
    apiKey,
    baseUrl,
    useGemini: false,
  };

  if (
    primary.model === fallback.model &&
    primary.baseUrl === fallback.baseUrl &&
    primary.apiKey === fallback.apiKey
  ) {
    return null;
  }

  return fallback;
}

function buildEndpointChain(): RelayLlmEndpoint[] {
  const primary = resolvePrimaryEndpoint();
  const chain = [primary];
  const fallback = resolveFallbackEndpoint(primary);
  if (fallback) chain.push(fallback);
  return chain;
}

function getEndpointChain(): RelayLlmEndpoint[] {
  if (!cachedChain) cachedChain = buildEndpointChain();
  return cachedChain;
}

/** @internal */
export function resetRelayLlmCacheForTests(): void {
  cachedChain = null;
  geminiClient = null;
  logged = false;
}

/** Resolved after dotenv loads (see getEndpointChain). */
export function getRelayLlmModel(): string {
  return getEndpointChain()[0]!.model;
}

export function getRelayLlmTemperature(): number {
  return getEndpointChain()[0]!.temperature;
}

export function getRelayLlmFallbackModel(): string | null {
  return getEndpointChain()[1]?.model ?? null;
}

function logConfig(chain: RelayLlmEndpoint[]): void {
  if (logged) return;
  logged = true;

  const primary = chain[0]!;
  if (!primary.apiKey && !chain[1]?.apiKey) {
    log.warn(
      "Relay LLM: no API key configured (set GEMINI_API_KEY, MINIMAX_API_KEY, or RELAY_LLM_API_KEY)",
    );
    return;
  }

  if (primary.apiKey) {
    const backend = primary.useGemini ? "gemini" : primary.baseUrl;
    log.info(
      `Relay LLM: ${primary.model} @ ${backend} (temperature=${primary.temperature})`,
    );
  }

  const fallback = chain[1];
  if (fallback?.apiKey) {
    log.info(
      `Relay LLM fallback: ${fallback.model} @ ${fallback.baseUrl} (temperature=${fallback.temperature})`,
    );
  }
}

/** Call once after dotenv loads (e.g. voice-relay startup). */
export function logRelayLlmStartup(): void {
  logConfig(getEndpointChain());
}

function getGeminiClient(apiKey: string): GoogleGenAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

async function callGemini(
  endpoint: RelayLlmEndpoint,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  const client = getGeminiClient(endpoint.apiKey);
  const stream = await client.models.generateContentStream({
    model: endpoint.model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: endpoint.temperature,
      maxOutputTokens: maxTokens,
    },
  });

  let text = "";
  for await (const chunk of stream) {
    if (chunk.text) text += chunk.text;
  }
  return text.trim();
}

async function callOpenAICompatible(
  endpoint: RelayLlmEndpoint,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  const res = await fetch(`${endpoint.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify({
      model: endpoint.model,
      messages: [{ role: "user", content: prompt }],
      temperature: endpoint.temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`LLM API ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function callEndpoint(
  endpoint: RelayLlmEndpoint,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  if (!endpoint.apiKey) {
    throw new Error(`No API key for relay model ${endpoint.model}`);
  }
  return endpoint.useGemini
    ? callGemini(endpoint, prompt, maxTokens)
    : callOpenAICompatible(endpoint, prompt, maxTokens);
}

export async function callRelayLLM(prompt: string, maxTokens = 150): Promise<string> {
  const chain = getEndpointChain();
  logConfig(chain);

  const configured = chain.filter((e) => e.apiKey);
  if (configured.length === 0) {
    return "";
  }

  const startMs = Date.now();
  let lastError: unknown;

  for (let i = 0; i < configured.length; i++) {
    const endpoint = configured[i]!;
    try {
      const text = await callEndpoint(endpoint, prompt, maxTokens);
      if (i > 0) {
        log.warn(
          `Relay LLM recovered via fallback ${endpoint.model} (${Date.now() - startMs}ms)`,
        );
      } else {
        log.info(`Relay LLM took ${Date.now() - startMs}ms`);
      }
      return text;
    } catch (err) {
      lastError = err;
      const next = configured[i + 1];
      if (next) {
        log.warn(
          `Relay LLM failed for ${endpoint.model}, falling back to ${next.model}`,
          err,
        );
      }
    }
  }

  log.error("Relay LLM failed on all configured models", lastError);
  throw lastError ?? new Error("Relay LLM failed");
}
