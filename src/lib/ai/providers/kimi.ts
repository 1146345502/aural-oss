import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { type LLMProvider, type GenerationParams, type LLMResponse, type LLMMessage } from "../types";

// kimi-k2.5 does not allow temperature to be set — the API rejects custom values.
const FIXED_TEMPERATURE_MODELS = new Set(["kimi-k2.5"]);

export class KimiProvider implements LLMProvider {
  id = "kimi";
  name = "Moonshot Kimi";
  models = ["kimi-k2.5", "kimi-k2-turbo", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"];
  defaultModel = "moonshot-v1-8k";

  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.KIMI_API_KEY ?? "",
      baseURL: process.env.KIMI_BASE_URL ?? "https://api.moonshot.cn/v1",
    });
  }

  private toOpenAIMessages(messages: LLMMessage[]): ChatCompletionMessageParam[] {
    return messages.map((m) => ({
      role: m.role,
      content: m.content as string & Array<unknown>,
    })) as ChatCompletionMessageParam[];
  }

  async generateResponse(
    params: GenerationParams & { model?: string }
  ): Promise<LLMResponse> {
    const model = params.model ?? this.defaultModel;
    const response = await this.client.chat.completions.create({
      model,
      messages: this.toOpenAIMessages(params.messages),
      ...(FIXED_TEMPERATURE_MODELS.has(model)
        ? {}
        : { temperature: params.temperature ?? 0.7 }),
      max_tokens: params.maxTokens ?? 2048,
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content ?? "",
      finishReason: choice.finish_reason ?? "stop",
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }

  async *streamResponse(
    params: GenerationParams & { model?: string }
  ): AsyncIterable<string> {
    const model = params.model ?? this.defaultModel;
    const stream = await this.client.chat.completions.create({
      model,
      messages: this.toOpenAIMessages(params.messages),
      ...(FIXED_TEMPERATURE_MODELS.has(model)
        ? {}
        : { temperature: params.temperature ?? 0.7 }),
      max_tokens: params.maxTokens ?? 2048,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}
