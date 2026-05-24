import { buildInterviewerPrompt } from "@/lib/ai/prompts/interviewer";
import { getProvider } from "@/lib/ai/registry";
import type { LLMMessage } from "@/lib/ai/types";
import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const log = createLogger("api/ai/chat");

const MOVE_ON_PATTERN =
  /\b(next\s*question|move\s*on|skip\s*(this|it)?|next\s*one|let'?s\s*(move|continue)\s*(on|forward)?)\b/i;

export async function POST(req: Request) {
  const { sessionId, interviewId, messages, currentQuestionIndex, manualNavigation } =
    await req.json();

  try {
    const { data: interview } = await supabaseAdmin
      .from("interviews")
      .select("*, questions(*)")
      .eq("id", interviewId)
      .order("order", { referencedTable: "questions", ascending: true })
      .single();

    if (!interview) {
      return NextResponse.json(
        { error: "Interview not found" },
        { status: 404 },
      );
    }

    const provider = getProvider(interview.llmProvider);

    const conversationHistory: LLMMessage[] = (messages ?? [])
      .filter(
        (m: { role?: string; content?: string }) =>
          typeof m.content === "string" && m.content.trim().length > 0,
      )
      .map((m: { role: "user" | "assistant"; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content.trim(),
      }));

    const promptMessages = buildInterviewerPrompt({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      interview: interview as any,
      conversationHistory,
      currentQuestionIndex: currentQuestionIndex ?? 0,
    });

    const response = await provider.generateResponse({
      messages: promptMessages,
      temperature: 0.7,
      maxTokens: 1024,
      model: interview.llmModel ?? undefined,
    });

    const isComplete = response.content.includes("[INTERVIEW_COMPLETE]");
    let questionAdvanced = response.content.includes("[NEXT_QUESTION]");

    // Ignore [NEXT_QUESTION] in the greeting message — the AI sometimes
    // mistakenly includes it when first asking Q1 from the introduction.
    if (questionAdvanced && conversationHistory.length === 0) {
      questionAdvanced = false;
    }

    if (questionAdvanced && manualNavigation) {
      questionAdvanced = false;
    }

    const cleanContent = response.content
      .replace("[INTERVIEW_COMPLETE]", "")
      .replace("[NEXT_QUESTION]", "")
      .trim();

    // Fallback: detect when the AI moved to the next question without the marker.
    // This catches the common case where the user says "next question" and the AI
    // transitions verbally but forgets [NEXT_QUESTION].
    if (
      !manualNavigation &&
      !questionAdvanced &&
      !isComplete &&
      conversationHistory.length > 0
    ) {
      const lastUserMsg = [...conversationHistory]
        .reverse()
        .find((m) => m.role === "user");
      if (lastUserMsg) {
        const userText =
          typeof lastUserMsg.content === "string"
            ? lastUserMsg.content
            : lastUserMsg.content.map((p) => ("text" in p ? p.text : "")).join(" ");
        const userAskedToMoveOn = MOVE_ON_PATTERN.test(userText);
        if (userAskedToMoveOn) {
          const questions = (interview.questions ?? []) as { id: string; text: string }[];
          const nextQ = questions[(currentQuestionIndex ?? 0) + 1];
          if (nextQ) {
            // Check if the AI's response references the next question's content
            const nextQWords = nextQ.text.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
            const responseLower = cleanContent.toLowerCase();
            const matchCount = nextQWords.filter((w) => responseLower.includes(w)).length;
            const matchRatio = nextQWords.length > 0 ? matchCount / nextQWords.length : 0;

            if (matchRatio >= 0.4) {
              questionAdvanced = true;
              log.info("Fallback: detected question advancement without marker", {
                sessionId,
                nextQuestionText: nextQ.text,
                matchRatio,
              });
            }
          }
        }
      }
    }

    await supabaseAdmin.from("messages").insert({
      sessionId,
      role: "ASSISTANT" as const,
      content: cleanContent,
      wordCount: cleanContent.split(/\s+/).length,
    });

    if (questionAdvanced) {
      const nextIndex = (currentQuestionIndex ?? 0) + 1;
      const questions = (interview.questions ?? []) as { id: string }[];
      const nextQuestion = questions[nextIndex];
      if (nextQuestion) {
        await supabaseAdmin
          .from("sessions")
          .update({ currentQuestionId: nextQuestion.id })
          .eq("id", sessionId);
      }
    }

    return NextResponse.json({
      content: cleanContent,
      questionAdvanced,
      isComplete,
    });
  } catch (error) {
    log.error("Chat AI error:", error);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 },
    );
  }
}
