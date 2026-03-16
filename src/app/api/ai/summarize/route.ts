import { svgDataUrlToPng } from "@/lib/ai/convert-svg";
import { extractJson } from "@/lib/ai/extract-json";
import { createLogger } from "@/lib/logger";
import { buildSummaryPrompt } from "@/lib/ai/prompts/summary";
import { getProvider, REPORT_MODEL } from "@/lib/ai/registry";
import { getAuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const log = createLogger("api/ai/summarize");

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await req.json();

  try {
    const { data: interviewSession } = await supabaseAdmin
      .from("sessions")
      .select(
        `*, interview:interviews!inner(title, userId, projectId, objective, language, assessmentCriteria, questions(text, order, type)), messages(*)`,
      )
      .eq("id", sessionId)
      .order("order", { referencedTable: "interviews.questions", ascending: true })
      .order("timestamp", { referencedTable: "messages", ascending: true })
      .single();

    if (
      !interviewSession ||
      (interviewSession.interview as { userId: string }).userId !== user.id
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const interview = interviewSession.interview as {
      title: string;
      userId: string;
      projectId: string;
      objective: string | null;
      language: string;
      assessmentCriteria: { name: string; description: string }[] | null;
      questions: { text: string; order: number; type?: string }[];
    };

    const msgs = (interviewSession.messages ?? []) as {
      contentType: string;
      whiteboardData: Record<string, unknown> | null;
      whiteboardImageUrl: string | null;
      role: string;
      content: string;
    }[];

    const criteria = interview.assessmentCriteria;

    const whiteboardDrawingsRaw = msgs
      .filter((m) => m.contentType === "WHITEBOARD" && m.whiteboardData)
      .map((m) => ({
        label: (m.whiteboardData?.label as string) || "Untitled Drawing",
        imageDataUrl: m.whiteboardImageUrl ?? null,
      }));

    const whiteboardDrawings = await Promise.all(
      whiteboardDrawingsRaw.map(async (d) => ({
        ...d,
        imageDataUrl: d.imageDataUrl
          ? await svgDataUrlToPng(d.imageDataUrl)
          : null,
      })),
    );

    const codeSnippetsInput = msgs
      .filter((m) => m.contentType === "CODE" && m.whiteboardData)
      .map((m) => ({
        label: (m.whiteboardData?.label as string) || "Untitled Snippet",
        code: (m.whiteboardData?.code as string) || "",
        language: (m.whiteboardData?.language as string) || "plaintext",
      }))
      .filter((s) => s.code.trim().length > 0);

    const provider = getProvider(REPORT_MODEL);
    const textMessages = msgs
      .filter((m) => m.contentType === "TEXT")
      .map((m) => ({ role: m.role, content: m.content }));
    const drawingsInput =
      whiteboardDrawings.length > 0 ? whiteboardDrawings : null;
    const codeInput = codeSnippetsInput.length > 0 ? codeSnippetsInput : null;

    const messages = buildSummaryPrompt(
      interview.title,
      textMessages,
      interview.objective,
      criteria,
      interview.questions,
      interview.language,
      drawingsInput,
      codeInput,
    );

    let response;
    try {
      response = await provider.generateResponse({
        messages,
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
          interview.title,
          textMessages,
          interview.objective,
          criteria,
          interview.questions,
          interview.language,
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

    const parsed = extractJson(response.content);

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

    return NextResponse.json(parsed);
  } catch (error) {
    log.error("Summary generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 },
    );
  }
}
