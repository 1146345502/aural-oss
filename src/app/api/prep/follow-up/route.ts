import {
  FOLLOW_UP_DEPTH_TURNS,
  authedInterview,
  createThinkFilter,
  drainLlmStream,
  log,
  sse,
  sseDone,
  streamHeaders,
  trimForPrompt,
} from "@/app/api/prep/_lib";
import { extractJson } from "@/lib/ai/extract-json";
import { buildPrepFollowUpPrompt } from "@/lib/ai/prompts/prep";
import { getProvider, REPORT_MODEL } from "@/lib/ai/registry";
import { supabaseAdmin } from "@/lib/supabase/admin";

type RawFollowUp = {
  shouldContinue?: boolean;
  nextPrompt?: string;
  refinement?: {
    verdict?: string;
    stillStrong?: string[];
    stillMissing?: string[];
  };
};

type StoredFollowUpTurn = {
  prompt: string;
  answer: string;
  refinement: {
    verdict: string;
    stillStrong: string[];
    stillMissing: string[];
  };
  shouldContinue: boolean;
  nextPrompt: string;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
}

function fallbackFollowUp(rawResponse: string): RawFollowUp {
  const rawSummary = rawResponse.replace(/\s+/g, " ").trim();
  return {
    shouldContinue: false,
    nextPrompt: "",
    refinement: {
      verdict: "Good refinement direction",
      stillStrong: [
        rawSummary.slice(0, 180) ||
          "The answer adds useful context to the original response.",
      ],
      stillMissing: [
        "Add one concrete detail, metric, or customer outcome to make it stronger.",
      ],
    },
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      attemptId?: string;
      promptText?: string;
      answerText?: string;
    };
    const { attemptId, promptText, answerText } = body;
    if (!attemptId || !promptText || !answerText || answerText.trim().length < 4) {
      return new Response(
        JSON.stringify({
          error: "attemptId, promptText, and an answer of at least 4 characters are required",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const { data: attempt } = await supabaseAdmin
      .from("prep_attempts")
      .select(
        'id, "interviewId", "questionId", "userId", "answerText", feedback, "followUp"',
      )
      .eq("id", attemptId)
      .single();

    if (!attempt) {
      return new Response(JSON.stringify({ error: "Attempt not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const auth = await authedInterview(attempt.interviewId as string);
    if ("error" in auth) return auth.error;
    const { user, interview } = auth;
    if (attempt.userId !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const maxTurns = FOLLOW_UP_DEPTH_TURNS[interview.followUpDepth] ?? 1;
    const existingTurns = ((attempt.followUp as StoredFollowUpTurn[] | null) ??
      []) as StoredFollowUpTurn[];
    const completedTurns = existingTurns.length;
    if (completedTurns >= maxTurns) {
      return new Response(
        JSON.stringify({
          error: `Follow-up depth (${interview.followUpDepth}) only allows ${maxTurns} turn(s).`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const { data: question } = await supabaseAdmin
      .from("questions")
      .select("id, text, description, type")
      .eq("id", attempt.questionId as string)
      .single();
    if (!question) {
      return new Response(JSON.stringify({ error: "Question not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const remainingAfterThis = Math.max(0, maxTurns - completedTurns - 1);
    const initialFeedback = (attempt.feedback ?? {}) as { summary?: string };

    const provider = getProvider(REPORT_MODEL);
    const messages = buildPrepFollowUpPrompt({
      interview: {
        title: interview.title,
        roleTitle: interview.roleTitle,
        companyName: interview.companyName,
        jobDescription: trimForPrompt(interview.jobDescription),
        resumeText: trimForPrompt(interview.resumeText),
        language: interview.language,
      },
      question: {
        text: question.text as string,
        description: question.description as string | null,
        type: question.type as string,
      },
      initialAnswer: attempt.answerText as string,
      initialFeedbackSummary: initialFeedback.summary ?? "",
      priorTurns: existingTurns.map((t) => ({
        prompt: t.prompt,
        answer: t.answer,
      })),
      remainingTurns: remainingAfterThis,
    });

    const stream = new ReadableStream({
      async start(controller) {
        const filter = createThinkFilter();
        try {
          let streamFailed = false;
          try {
            await drainLlmStream(
              provider.streamResponse({
                messages,
                temperature: 0.3,
                maxTokens: 700,
                model: REPORT_MODEL,
              }),
              (token) => {
                const visible = filter.feed(token);
                if (visible) controller.enqueue(sse({ token: visible }));
              },
            );
          } catch (streamErr) {
            streamFailed = true;
            log.warn("Follow-up LLM stream fallback:", streamErr);
          }

          let parsed: RawFollowUp;
          try {
            if (streamFailed || !filter.state.fullContent.trim()) {
              throw new Error("Using fallback follow-up after stream failure");
            }
            parsed = extractJson<RawFollowUp>(filter.state.fullContent);
          } catch (parseErr) {
            log.error("Follow-up JSON parse failed:", parseErr);
            parsed = fallbackFollowUp(filter.state.fullContent);
          }

          const refinement = {
            verdict: parsed.refinement?.verdict?.trim() || "Refinement",
            stillStrong: asStringArray(parsed.refinement?.stillStrong),
            stillMissing: asStringArray(parsed.refinement?.stillMissing),
          };
          const shouldContinue =
            Boolean(parsed.shouldContinue) && remainingAfterThis > 0;
          const nextPrompt = shouldContinue
            ? parsed.nextPrompt?.trim() || ""
            : "";

          const newTurn: StoredFollowUpTurn = {
            prompt: promptText.trim(),
            answer: answerText.trim(),
            refinement,
            shouldContinue,
            nextPrompt,
          };
          const updatedTurns = [...existingTurns, newTurn];

          await supabaseAdmin
            .from("prep_attempts")
            .update({ followUp: updatedTurns })
            .eq("id", attemptId);

          controller.enqueue(
            sse({
              shouldContinue,
              nextPrompt,
              refinement,
              completedTurns: updatedTurns.length,
              maxTurns,
            }),
          );
          controller.enqueue(sseDone());
          controller.close();
        } catch (err) {
          log.error("Follow-up stream error:", err);
          controller.enqueue(sse({ error: "Stream interrupted" }));
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: streamHeaders() });
  } catch (err) {
    log.error("Follow-up route error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
