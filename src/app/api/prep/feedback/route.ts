import {
    createSafeSseStreamWriter,
    createThinkStreamSplitter,
    drainLlmStream,
    log,
    sse,
    sseDone,
    streamFeedbackFallbackPreview,
    streamHeaders,
    stripThinkBlocks,
} from "@/app/api/prep/_lib";
import { isAbortError } from "@/lib/abort-error";
import { extractJson } from "@/lib/ai/extract-json";
import { resolveGeneratorModel, streamGeneratorWithFallback } from "@/lib/ai/generator-run";
import { buildPrepFeedbackPrompt } from "@/lib/ai/prompts/prep";
import { getProvider, REPORT_MODEL } from "@/lib/ai/registry";
import {
    applyPrepScoreGuardrails,
    buildHeuristicFeedback,
    buildMetaPromptFeedback,
    buildNonSubstantiveFeedback,
    isMetaPromptOrUiPlaceholderAnswer,
    isNonSubstantiveAnswer,
    resolvePrepResponseLanguage,
    type PriorAttemptForScoring,
} from "@/lib/prep/answer-quality";
import { loadPrepFeedbackContext } from "@/lib/prep/load-prep-feedback-context";
import { parsePrepFeedbackRequest } from "@/lib/prep/parse-prep-feedback-request";
import {
    resolvePrepAnswerAudioUrl,
    uploadPrepAnswerAudio,
} from "@/lib/prep/upload-answer-audio";
import { voiceMetricsToFeedback } from "@/lib/prep/voice-delivery";
import { supabaseAdmin } from "@/lib/supabase/admin";

type RawVoiceDelivery = {
  confidence?: number;
  clarity?: number;
  tone?: number;
  tips?: string[];
};

type RawFeedback = {
  score?: number;
  verdict?: string;
  summary?: string;
  strengths?: string[];
  improvements?: string[];
  missingSignals?: string[];
  resumeLeverage?: string[];
  structureSuggestion?: string;
  followUpQuestion?: string;
  sampleAnswer?: string;
  needsUserVerification?: string[];
  voiceDelivery?: RawVoiceDelivery;
};

type VoiceMetricsBody = {
  durationSeconds?: number;
  wordsPerMinute?: number;
  confidence?: number;
  clarity?: number;
  tone?: number;
  tips?: string[];
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
}

function clampScore(value: unknown, fallback = 5): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10, Math.max(1, n));
}

function normalizeVoiceDelivery(raw?: RawVoiceDelivery) {
  if (!raw) return undefined;
  return {
    confidence: clampScore(raw.confidence, 5),
    clarity: clampScore(raw.clarity, 5),
    tone: clampScore(raw.tone, 5),
    tips: asStringArray(raw.tips),
  };
}

function normalizeFeedback(raw: RawFeedback) {
  const score = Number(raw.score);
  return {
    score: Number.isFinite(score) ? Math.min(10, Math.max(1, score)) : 5,
    verdict: raw.verdict?.trim() || "Needs refinement",
    summary:
      raw.summary?.trim() ||
      "The answer is relevant but needs more evidence and structure.",
    strengths: asStringArray(raw.strengths),
    improvements: asStringArray(raw.improvements),
    missingSignals: asStringArray(raw.missingSignals),
    resumeLeverage: asStringArray(raw.resumeLeverage),
    structureSuggestion:
      raw.structureSuggestion?.trim() ||
      "Use a concise situation, action, result structure with one role-specific detail.",
    followUpQuestion: raw.followUpQuestion?.trim() || "",
    sampleAnswer: raw.sampleAnswer?.trim() || "",
    needsUserVerification: asStringArray(raw.needsUserVerification),
    voiceDelivery: normalizeVoiceDelivery(raw.voiceDelivery),
  };
}

function withoutVoiceDelivery(
  feedback: ReturnType<typeof normalizeFeedback>,
): ReturnType<typeof normalizeFeedback> {
  return { ...feedback, voiceDelivery: undefined };
}

function mergeVoiceMetrics(
  feedback: ReturnType<typeof normalizeFeedback>,
  metrics?: VoiceMetricsBody,
) {
  if (!metrics) return feedback;
  const delivery = voiceMetricsToFeedback({
    durationSeconds: metrics.durationSeconds ?? 0,
    wordsPerMinute: metrics.wordsPerMinute ?? 0,
    confidence: clampScore(metrics.confidence, 5),
    clarity: clampScore(metrics.clarity, 5),
    tone: clampScore(metrics.tone, 5),
    tips: asStringArray(metrics.tips),
  });
  const extraImprovements = delivery.tips.filter(
    (t) => !feedback.improvements.includes(t),
  );
  return {
    ...feedback,
    voiceDelivery: feedback.voiceDelivery ?? delivery,
    improvements: [...feedback.improvements, ...extraImprovements].slice(0, 5),
  };
}

function mapPriorAttemptsForScoring(
  rows: { answerText: unknown; feedback: unknown }[] | null,
): PriorAttemptForScoring[] {
  return (rows ?? []).map((a) => {
    const fb = (a.feedback as { summary?: string; improvements?: unknown } | null) ?? {};
    return {
      answerText: String(a.answerText ?? ""),
      feedbackSummary: fb.summary ?? "",
      feedbackImprovements: asStringArray(fb.improvements),
    };
  });
}

function finalizeFeedback(
  answerText: string,
  raw: ReturnType<typeof normalizeFeedback>,
  ctx: {
    questionText: string;
    previousAttempts: PriorAttemptForScoring[];
  },
) {
  return applyPrepScoreGuardrails(answerText, raw, ctx);
}

function fallbackFeedback(
  answerText: string,
  responseLanguage: string,
  ctx: {
    questionText: string;
    previousAttempts: PriorAttemptForScoring[];
  },
) {
  return finalizeFeedback(
    answerText,
    normalizeFeedback(buildHeuristicFeedback(answerText, responseLanguage)),
    ctx,
  );
}

function parseFeedbackFromModel(raw: string) {
  const candidates = [raw, stripThinkBlocks(raw)];
  let lastError: unknown;
  for (const candidate of candidates) {
    if (!candidate.trim()) continue;
    try {
      return normalizeFeedback(extractJson<RawFeedback>(candidate));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("No parseable feedback JSON in model output");
}

export async function POST(req: Request) {
  const routeT0 = Date.now();
  try {
    const parsed = await parsePrepFeedbackRequest(req);
    if ("error" in parsed) return parsed.error;

    const {
      sessionId,
      questionId,
      answerText,
      practiceMode = false,
      voiceMetrics,
      answerAudio,
      diagTraceId,
      parseMethod,
    } = parsed;

    const diag = (event: string, meta?: Record<string, unknown>) => {
      log.debug(
        `[prep-feedback-diag] ${diagTraceId ?? "no-trace"} +${Date.now() - routeT0}ms ${event}`,
        meta ?? {},
      );
    };
    diag("request_parsed", {
      parseMethod,
      hasAudio: Boolean(answerAudio),
      audioBase64Chars: answerAudio?.base64.length ?? 0,
      answerChars: answerText.length,
      inputMode: parsed.inputMode,
    });

    const loaded = await loadPrepFeedbackContext(sessionId, questionId);
    if ("error" in loaded) return loaded.error;

    const {
      user,
      interview,
      trimmedJobDescription,
      trimmedResumeText,
      question,
      priorAttempts,
      tokenCheck,
    } = loaded;
    diag("context_loaded", {
      priorAttempts: priorAttempts?.length ?? 0,
      tokenBalance: tokenCheck.balance,
      interviewCached: true,
    });

    const trimmedAnswer = answerText.trim();
    const responseLanguage = resolvePrepResponseLanguage(
      interview.language as string,
      trimmedAnswer,
    );
    const skipLlm =
      isNonSubstantiveAnswer(trimmedAnswer) ||
      isMetaPromptOrUiPlaceholderAnswer(trimmedAnswer);

    const hasVoiceAnswer = Boolean(
      (practiceMode && answerAudio) || voiceMetrics,
    );

    const feedbackModel = practiceMode ? resolveGeneratorModel() : REPORT_MODEL;
    const messages = buildPrepFeedbackPrompt({
      interview: {
        title: interview.title,
        roleTitle: interview.roleTitle,
        companyName: interview.companyName,
        jobDescription: trimmedJobDescription,
        resumeText: trimmedResumeText,
        language: interview.language,
      },
      question: {
        text: question.text as string,
        description: question.description as string | null,
        type: question.type as string,
      },
      answerText: trimmedAnswer,
      responseLanguage,
      practiceMode,
      answerAudio: practiceMode ? answerAudio : undefined,
      voiceMetrics: voiceMetrics
        ? {
            durationSeconds: voiceMetrics.durationSeconds ?? 0,
            wordsPerMinute: voiceMetrics.wordsPerMinute ?? 0,
            confidence: clampScore(voiceMetrics.confidence, 5),
            clarity: clampScore(voiceMetrics.clarity, 5),
            tone: clampScore(voiceMetrics.tone, 5),
            tips: asStringArray(voiceMetrics.tips),
          }
        : undefined,
      previousAttempts: (priorAttempts ?? []).map((a) => {
        const fb =
          (a.feedback as { summary?: string; improvements?: unknown } | null) ??
          {};
        return {
          answerText: a.answerText as string,
          score: (a.score as number | null) ?? null,
          feedbackSummary: fb.summary ?? "",
          feedbackImprovements: asStringArray(fb.improvements),
        };
      }),
    });

    const attemptNumber = (priorAttempts?.length ?? 0) + 1;
    const scoreCtx = {
      questionText: question.text as string,
      previousAttempts: mapPriorAttemptsForScoring(priorAttempts),
    };
    diag("prompt_built", {
      model: feedbackModel,
      hasVoiceAnswer,
      skipLlm,
      messageCount: messages.length,
    });

    const stream = new ReadableStream({
      async start(controller) {
        const writer = createSafeSseStreamWriter(controller, req.signal);
        diag("stream_started");
        const enqueueThinking = (text: string) => {
          if (text) writer.enqueue(sse({ type: "thinking", text }));
        };
        const enqueueToken = (token: string) => {
          if (token) writer.enqueue(sse({ token }));
        };

        const splitter = createThinkStreamSplitter({
          onThinking: enqueueThinking,
          onContent: enqueueToken,
        });

        const isZh = responseLanguage === "zh";
        enqueueThinking(
          isZh
            ? "正在阅读你的回答并分析表达与岗位匹配度…\n"
            : "Reading your answer and analyzing delivery…\n",
        );
        diag("first_thinking_enqueued");

        let firstLlmTokenSeen = false;

        try {
          if (writer.aborted) return;

          let feedback: ReturnType<typeof normalizeFeedback>;

          if (skipLlm) {
            const skipPayload = isMetaPromptOrUiPlaceholderAnswer(trimmedAnswer)
              ? buildMetaPromptFeedback(responseLanguage)
              : buildNonSubstantiveFeedback(trimmedAnswer, responseLanguage);
            feedback = normalizeFeedback(skipPayload);
            const summary = feedback.summary;
            for (const char of summary) {
              enqueueToken(char);
            }
          } else {
            let streamFailed = false;
            let streamedToClient = false;
            try {
              const llmStream = practiceMode
                ? streamGeneratorWithFallback({
                    messages,
                    temperature: 0.25,
                    maxTokens: answerAudio ? 1800 : 1200,
                    model: feedbackModel,
                  })
                : getProvider(feedbackModel).streamResponse({
                    messages,
                    temperature: 0.25,
                    maxTokens: 1200,
                    model: feedbackModel,
                  });
              diag("llm_stream_started", { model: feedbackModel });
              await drainLlmStream(
                llmStream,
                (token) => {
                  if (!firstLlmTokenSeen) {
                    firstLlmTokenSeen = true;
                    diag("first_llm_token");
                  }
                  streamedToClient = true;
                  splitter.feed(token);
                },
                {
                  idleTimeoutMs: practiceMode ? 60_000 : 90_000,
                  totalTimeoutMs: practiceMode ? 90_000 : 120_000,
                  heartbeatMs: 3_000,
                  onHeartbeat: () => enqueueThinking("."),
                },
              );
            } catch (streamErr) {
              if (writer.aborted || isAbortError(streamErr)) return;
              streamFailed = true;
              log.warn("Feedback LLM stream fallback:", streamErr);
            }
            diag("llm_stream_finished", { streamFailed, streamedToClient });

            if (writer.aborted) return;

            const rawModelOutput = splitter.state.fullContent.trim();
            try {
              if (!rawModelOutput) {
                throw new Error("Empty model output");
              }
              feedback = parseFeedbackFromModel(rawModelOutput);
              if (practiceMode) {
                feedback = { ...feedback, followUpQuestion: "" };
              }
              feedback = mergeVoiceMetrics(feedback, voiceMetrics);
              if (!hasVoiceAnswer) {
                feedback = withoutVoiceDelivery(feedback);
              }
            } catch (parseErr) {
              if (writer.aborted) return;
              log.error("Feedback JSON parse failed:", parseErr);
              if (isNonSubstantiveAnswer(trimmedAnswer)) {
                feedback = normalizeFeedback(
                  buildNonSubstantiveFeedback(trimmedAnswer, responseLanguage),
                );
              } else {
                feedback = mergeVoiceMetrics(
                  fallbackFeedback(trimmedAnswer, responseLanguage, scoreCtx),
                  voiceMetrics,
                );
              }
              if (!streamedToClient && !writer.aborted) {
                await streamFeedbackFallbackPreview(
                  (chunk) => {
                    writer.enqueue(chunk);
                  },
                  {
                    verdict: feedback.verdict,
                    summary: feedback.summary,
                  },
                );
              }
            }
          }

          if (writer.aborted) return;

          if (skipLlm) {
            feedback = mergeVoiceMetrics(feedback, voiceMetrics);
          }
          if (!hasVoiceAnswer) {
            feedback = withoutVoiceDelivery(feedback);
          }

          feedback = finalizeFeedback(trimmedAnswer, feedback, scoreCtx);

          if (!writer.aborted) {
            writer.enqueue(
              sse({
                feedback,
                score: feedback.score,
                attemptNumber,
              }),
            );
            diag("feedback_enqueued", { score: feedback.score, attemptNumber });
          }

          try {
            const { data: persisted } = await supabaseAdmin
              .from("prep_attempts")
              .insert({
                sessionId,
                interviewId: interview.id,
                questionId,
                userId: user.id,
                answerText: answerText.trim(),
                inputMode: parsed.inputMode ?? "TEXT",
                durationSeconds: parsed.durationSeconds ?? null,
                feedback,
                followUp: [],
                score: feedback.score,
                attemptNumber,
              })
              .select("id, createdAt")
              .single();

            let audioStoragePath: string | null = null;
            let audioPlaybackUrl: string | null = null;
            const audioDurationSeconds =
              answerAudio && voiceMetrics?.durationSeconds != null
                ? Math.max(1, Math.floor(voiceMetrics.durationSeconds))
                : null;
            if (persisted?.id && answerAudio) {
              audioStoragePath = await uploadPrepAnswerAudio(
                sessionId,
                persisted.id,
                answerAudio,
              );
              if (audioStoragePath) {
                await supabaseAdmin
                  .from("prep_attempts")
                  .update({
                    audioUrl: audioStoragePath,
                    audioDurationSeconds,
                  })
                  .eq("id", persisted.id);
                audioPlaybackUrl = await resolvePrepAnswerAudioUrl(
                  audioStoragePath,
                );
              }
            }

            await supabaseAdmin
              .from("prep_sessions")
              .update({ lastActivityAt: new Date().toISOString() })
              .eq("id", sessionId);

            if (!writer.aborted) {
              writer.enqueue(
                sse({
                  type: "persisted",
                  attemptId: persisted?.id,
                  audioUrl: audioPlaybackUrl ?? undefined,
                  audioCreatedAt: persisted?.createdAt,
                  audioDurationSeconds: audioDurationSeconds ?? undefined,
                }),
              );
            }
            diag("persist_complete", {
              attemptId: persisted?.id,
              hasAudio: Boolean(audioStoragePath),
            });
          } catch (persistErr) {
            if (!writer.aborted && !isAbortError(persistErr)) {
              log.error("Feedback persist failed after stream:", persistErr);
              writer.enqueue(
                sse({
                  type: "persist_warning",
                  message: "Feedback shown but saving the attempt failed.",
                }),
              );
            }
          }

          if (!writer.aborted) {
            writer.enqueue(sseDone());
          }
          diag("stream_complete", { score: feedback.score, attemptNumber });
        } catch (err) {
          if (!writer.aborted && !isAbortError(err)) {
            log.error("Feedback stream error:", err);
            writer.enqueue(sse({ error: "Stream interrupted" }));
          }
        } finally {
          writer.close();
        }
      },
    });

    diag("response_returned");
    return new Response(stream, { headers: streamHeaders() });
  } catch (err) {
    log.error("Feedback route error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
