import {
    isPrepAnswerAudioWithinLimit,
    PREP_ANSWER_AUDIO_MAX_BYTES,
} from "@/lib/prep/answer-audio";

/** Max JSON body size when audio is embedded as base64 (~4MB audio + metadata). */
const MAX_JSON_BODY_BYTES = 6 * 1024 * 1024;

export type VoiceMetricsBody = {
  durationSeconds?: number;
  wordsPerMinute?: number;
  confidence?: number;
  clarity?: number;
  tone?: number;
  tips?: string[];
};

export type PrepFeedbackRequestPayload = {
  sessionId: string;
  questionId: string;
  answerText: string;
  inputMode?: "TEXT" | "VOICE";
  durationSeconds?: number;
  practiceMode?: boolean;
  voiceMetrics?: VoiceMetricsBody;
  answerAudio?: { mimeType: string; base64: string };
  diagTraceId?: string;
};

type MetadataFields = {
  sessionId?: string;
  questionId?: string;
  answerText?: string;
  inputMode?: "TEXT" | "VOICE";
  durationSeconds?: number;
  practiceMode?: boolean;
  voiceMetrics?: VoiceMetricsBody;
  answerAudioMimeType?: string;
  diagTraceId?: string;
};

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildPayload(
  metadata: MetadataFields,
  answerAudio?: { mimeType: string; base64: string },
): PrepFeedbackRequestPayload | { error: Response } {
  const { sessionId, questionId, answerText } = metadata;
  if (!sessionId || !questionId || !answerText || answerText.trim().length < 8) {
    return {
      error: jsonError(
        400,
        "sessionId, questionId, and an answer of at least 8 characters are required",
      ),
    };
  }

  if (answerAudio && !isPrepAnswerAudioWithinLimit(answerAudio.base64)) {
    return {
      error: jsonError(413, "Answer audio is too large (max 4MB)."),
    };
  }

  return {
    sessionId,
    questionId,
    answerText,
    inputMode: metadata.inputMode,
    durationSeconds: metadata.durationSeconds,
    practiceMode: metadata.practiceMode,
    voiceMetrics: metadata.voiceMetrics,
    answerAudio,
    diagTraceId: metadata.diagTraceId,
  };
}

async function parseMultipartRequest(
  req: Request,
): Promise<
  | (PrepFeedbackRequestPayload & { parseMethod: "multipart" })
  | { error: Response }
> {
  const form = await req.formData();
  const metadataRaw = form.get("metadata");
  if (typeof metadataRaw !== "string" || !metadataRaw.trim()) {
    return { error: jsonError(400, "metadata field is required") };
  }

  let metadata: MetadataFields;
  try {
    metadata = JSON.parse(metadataRaw) as MetadataFields;
  } catch {
    return { error: jsonError(400, "Invalid metadata JSON") };
  }

  const audioEntry = form.get("audio");
  let answerAudio: { mimeType: string; base64: string } | undefined;
  if (audioEntry instanceof Blob && audioEntry.size > 0) {
    if (audioEntry.size > PREP_ANSWER_AUDIO_MAX_BYTES) {
      return { error: jsonError(413, "Answer audio is too large (max 4MB).") };
    }
    const base64 = Buffer.from(await audioEntry.arrayBuffer()).toString("base64");
    answerAudio = {
      mimeType:
        audioEntry.type?.trim() ||
        metadata.answerAudioMimeType?.trim() ||
        "audio/webm",
      base64,
    };
  }

  const payload = buildPayload(metadata, answerAudio);
  if ("error" in payload) return payload;
  return { ...payload, parseMethod: "multipart" };
}

async function parseJsonRequest(
  req: Request,
): Promise<
  | (PrepFeedbackRequestPayload & { parseMethod: "json" })
  | { error: Response }
> {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_JSON_BODY_BYTES) {
    return {
      error: jsonError(
        413,
        "Request body is too large. Send audio as multipart/form-data instead.",
      ),
    };
  }

  const body = (await req.json()) as MetadataFields & {
    answerAudioBase64?: string;
  };

  let answerAudio: { mimeType: string; base64: string } | undefined;
  if (body.practiceMode && body.answerAudioBase64?.trim()) {
    answerAudio = {
      mimeType: body.answerAudioMimeType?.trim() || "audio/webm",
      base64: body.answerAudioBase64.trim(),
    };
  }

  const payload = buildPayload(body, answerAudio);
  if ("error" in payload) return payload;
  return { ...payload, parseMethod: "json" };
}

/** Parse JSON or multipart prep feedback requests (multipart avoids large base64 JSON bodies). */
export async function parsePrepFeedbackRequest(
  req: Request,
): Promise<
  | (PrepFeedbackRequestPayload & {
      parseMethod: "json" | "multipart";
    })
  | { error: Response }
> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return parseMultipartRequest(req);
  }
  return parseJsonRequest(req);
}
