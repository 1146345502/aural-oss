import { svgDataUrlToPng } from "@/lib/ai/convert-svg";
import { extractJson } from "@/lib/ai/extract-json";
import { buildSummaryPrompt } from "@/lib/ai/prompts/summary";
import { getProvider, REPORT_MODEL } from "@/lib/ai/registry";
import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { handleVoiceSave, type CompletionSession, type ProgressSession, type VoiceSaveOps, type VoiceSavePayload } from "./logic";

const log = createLogger("api/voice/save");
const voiceSaveOps: VoiceSaveOps = {
  async insertMessages(sessionId, messages) {
    await supabaseAdmin.from("messages").insert(
      messages.map((m) => ({
        sessionId,
        role: m.role === "user" ? ("USER" as const) : ("ASSISTANT" as const),
        content: m.content,
        contentType: "TEXT" as const,
        questionId: m.questionId || null,
        wordCount: m.content.split(/\s+/).length,
        transcription: m.source === "chat" ? "chat" : null,
      })),
    );
  },
  async loadSessionForCompletion(sessionId) {
    const { data } = await supabaseAdmin
      .from("sessions")
      .select(
        `*, interview:interviews!inner(title, objective, language, userId, projectId, assessmentCriteria, questions(text, order, type))`,
      )
      .eq("id", sessionId)
      .order("order", {
        referencedTable: "interviews.questions",
        ascending: true,
      })
      .single();

    return (data as CompletionSession | null) ?? null;
  },
  async loadFirstMessageTimestamp(sessionId) {
    const { data } = await supabaseAdmin
      .from("messages")
      .select("timestamp")
      .eq("sessionId", sessionId)
      .order("timestamp", { ascending: true })
      .limit(1)
      .single();

    return (data?.timestamp as string | undefined) ?? null;
  },
  async loadSessionForProgress(sessionId) {
    const { data } = await supabaseAdmin
      .from("sessions")
      .select(`*, interview:interviews!inner(questions(*))`)
      .eq("id", sessionId)
      .order("order", {
        referencedTable: "interviews.questions",
        ascending: true,
      })
      .single();

    return (data as ProgressSession | null) ?? null;
  },
  async updateSession(sessionId, payload) {
    await supabaseAdmin.from("sessions").update(payload).eq("id", sessionId);
  },
  generateSummary,
  log,
  now: () => new Date(),
};

/**
 * POST /api/voice/save
 * Save voice interview messages, optionally complete the session,
 * and fire-and-forget an AI summary/analysis so the interviewee isn't blocked.
 */
export async function POST(req: Request) {
  const payload = (await req.json()) as VoiceSavePayload;
  const result = await handleVoiceSave(payload, voiceSaveOps);
  return NextResponse.json(result.body, { status: result.status });
}

async function generateSummary(
  sessionId: string,
  interviewTitle: string,
  objective?: string | null,
  language?: string | null,
  questions?: { text: string; order: number; type?: string }[] | null,
  assessmentCriteria?: { name: string; description: string }[] | null,
): Promise<void> {
  try {
    const { data: allMessages } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("sessionId", sessionId)
      .order("timestamp", { ascending: true });

    if (!allMessages || allMessages.length === 0) {
      log.info("No messages to summarize");
      return;
    }

    const whiteboardDrawingsRaw = allMessages
      .filter((m) => m.contentType === "WHITEBOARD" && m.whiteboardData)
      .map((m) => {
        const data = m.whiteboardData as Record<string, unknown>;
        return {
          label: (data.label as string) || "Untitled Drawing",
          imageDataUrl: m.whiteboardImageUrl ?? null,
        };
      });

    const whiteboardDrawings = await Promise.all(
      whiteboardDrawingsRaw.map(async (d) => ({
        ...d,
        imageDataUrl: d.imageDataUrl
          ? await svgDataUrlToPng(d.imageDataUrl)
          : null,
      })),
    );

    const codeSnippetsInput = allMessages
      .filter(
        (m) => (m.contentType as string) === "CODE" && m.whiteboardData,
      )
      .map((m) => {
        const data = m.whiteboardData as Record<string, unknown>;
        return {
          label: (data.label as string) || "Untitled Snippet",
          code: (data.code as string) || "",
          language: (data.language as string) || "plaintext",
        };
      })
      .filter((s) => s.code.trim().length > 0);

    const provider = getProvider(REPORT_MODEL);
    const textMessages = allMessages
      .filter((m) => m.contentType === "TEXT")
      .map((m) => ({
        role: m.role === "USER" ? "user" : "assistant",
        content: m.content,
      }));
    const drawingsInput =
      whiteboardDrawings.length > 0 ? whiteboardDrawings : null;
    const codeInput = codeSnippetsInput.length > 0 ? codeSnippetsInput : null;

    const promptMessages = buildSummaryPrompt(
      interviewTitle,
      textMessages,
      objective,
      assessmentCriteria,
      questions,
      language,
      drawingsInput,
      codeInput,
    );

    let response;
    try {
      response = await provider.generateResponse({
        messages: promptMessages,
        temperature: 0.3,
        maxTokens: 8192,
        model: REPORT_MODEL,
      });
    } catch (err) {
      const isVisionError =
        err instanceof Error &&
        /image.*not supported|vision.*not supported|does not support.*image/i.test(
          err.message,
        );
      if (isVisionError && drawingsInput?.some((d) => d.imageDataUrl)) {
        log.info("Model does not support images, retrying text-only");
        const textOnlyDrawings = drawingsInput.map((d) => ({
          ...d,
          imageDataUrl: null,
        }));
        const fallbackMessages = buildSummaryPrompt(
          interviewTitle,
          textMessages,
          objective,
          assessmentCriteria,
          questions,
          language,
          textOnlyDrawings,
          codeInput,
        );
        response = await provider.generateResponse({
          messages: fallbackMessages,
          temperature: 0.3,
          maxTokens: 8192,
          model: REPORT_MODEL,
        });
      } else {
        throw err;
      }
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = extractJson(response.content);
    } catch (parseErr) {
      log.error(
        "Raw AI response (first 1000 chars):",
        response.content.slice(0, 1000),
      );
      throw parseErr;
    }

    const insightsData: Record<string, unknown> = {
      keyInsights: parsed.keyInsights ?? [],
    };
    if (parsed.criteriaEvaluations) {
      insightsData.criteriaEvaluations = parsed.criteriaEvaluations;
    }
    if (parsed.questionEvaluations) {
      insightsData.questionEvaluations = parsed.questionEvaluations;
    }
    if (parsed.researchFindings) {
      insightsData.researchFindings = parsed.researchFindings;
    }
    if (parsed.toneAnalysis) {
      insightsData.toneAnalysis = parsed.toneAnalysis;
    }

    await supabaseAdmin
      .from("sessions")
      .update({
        summary: String(parsed.summary ?? ""),
        themes: (parsed.themes as string[]) ?? [],
        sentiment: parsed.sentiment ?? null,
        insights: insightsData,
      })
      .eq("id", sessionId);

    const themeCount = Array.isArray(parsed.themes) ? parsed.themes.length : 0;
    const insightCount = Array.isArray(parsed.keyInsights)
      ? parsed.keyInsights.length
      : 0;
    const qEvalCount = Array.isArray(parsed.questionEvaluations)
      ? parsed.questionEvaluations.length
      : 0;
    log.info(
      `Summary generated for session ${sessionId}: ` +
        `${themeCount} themes, ${insightCount} insights, ${qEvalCount} question evaluations`,
    );
  } catch (error) {
    log.error("Summary generation failed:", error);
  }
}
