export type LLMContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string | LLMContentPart[];
}

export interface GenerationParams {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMResponse {
  content: string;
  finishReason: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMProvider {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
  generateResponse(params: GenerationParams & { model?: string }): Promise<LLMResponse>;
  streamResponse(
    params: GenerationParams & { model?: string }
  ): AsyncIterable<string>;
}

export interface AssessmentCriterion {
  name: string;
  description: string;
}

export interface GeneratedInterview {
  title: string;
  description: string;
  objective: string;
  assessmentCriteria: AssessmentCriterion[];
  estimatedDurationMinutes: number;
  questions: GeneratedQuestion[];
  recommendedSettings: {
    mode?: "CHAT" | "VOICE" | "HYBRID";
    chatEnabled?: boolean;
    voiceEnabled?: boolean;
    videoEnabled?: boolean;
    followUpDepth: "LIGHT" | "MODERATE" | "DEEP";
    aiTone: "CASUAL" | "PROFESSIONAL" | "FORMAL" | "FRIENDLY";
    aiName: string;
  };
}

export interface GeneratedQuestion {
  order: number;
  text: string;
  type: "OPEN_ENDED" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "CODING" | "WHITEBOARD" | "RESEARCH";
  description?: string;
  timeLimitSeconds?: number;
  isRequired: boolean;
  options?: { options: string[]; allowMultiple?: boolean };
  followUpPrompts?: string[];
  /** Starter code template for CODING questions. */
  starterCode?: { language: string; code: string };
}
