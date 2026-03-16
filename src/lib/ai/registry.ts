import { type LLMProvider } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { KimiProvider } from "./providers/kimi";
import { MinimaxProvider } from "./providers/minimax";

const providers = new Map<string, LLMProvider>();

function registerProvider(provider: LLMProvider) {
  providers.set(provider.id, provider);
}

registerProvider(new OpenAIProvider());
registerProvider(new KimiProvider());
registerProvider(new MinimaxProvider());

/** Resolve the right provider for a given model name or provider id. */
export function getProvider(idOrModel?: string | null): LLMProvider {
  if (idOrModel) {
    if (providers.has(idOrModel)) return providers.get(idOrModel)!;
    const allProviders = Array.from(providers.values());
    for (const p of allProviders) {
      if (p.models.some((m: string) => m.toLowerCase() === idOrModel.toLowerCase())) {
        return p;
      }
    }
  }
  // Default fallback order: openai → kimi → minimax
  if (process.env.OPENAI_API_KEY) return providers.get("openai")!;
  if (process.env.KIMI_API_KEY) return providers.get("kimi")!;
  if (process.env.MINIMAX_API_KEY) return providers.get("minimax")!;
  throw new Error("No LLM provider configured. Set OPENAI_API_KEY, KIMI_API_KEY, or MINIMAX_API_KEY.");
}

export function listProviders(): LLMProvider[] {
  return Array.from(providers.values());
}

/**
 * Model used for post-interview report generation.
 * Falls back through available providers.
 */
export const REPORT_MODEL = process.env.OPENAI_API_KEY
  ? "gpt-4o"
  : process.env.KIMI_API_KEY
    ? "kimi-k2.5"
    : "MiniMax-M2.1-lightning";

/**
 * Model used for interview question generation and refinement.
 */
export const GENERATOR_MODEL = process.env.OPENAI_API_KEY
  ? "gpt-4o-mini"
  : process.env.KIMI_API_KEY
    ? "moonshot-v1-8k"
    : "MiniMax-M2.1-lightning";
