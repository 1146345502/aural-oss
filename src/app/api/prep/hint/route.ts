import {
    authedInterview,
    createThinkStreamSplitter,
    drainLlmStream,
    log,
    sse,
    sseDone,
    streamHeaders,
    stripThinkBlocks,
    trimForPrompt,
} from "@/app/api/prep/_lib";
import { resolveGeneratorModel, streamGeneratorWithFallback } from "@/lib/ai/generator-run";
import { buildPrepHintPrompt } from "@/lib/ai/prompts/prep";
import { resolvePrepResponseLanguage } from "@/lib/prep/answer-quality";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { interviewId, questionId } = (await req.json()) as {
      interviewId?: string;
      questionId?: string;
    };
    if (!interviewId || !questionId) {
      return new Response(
        JSON.stringify({ error: "interviewId and questionId are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const auth = await authedInterview(interviewId);
    if ("error" in auth) return auth.error;
    const { interview } = auth;

    const { data: question } = await supabaseAdmin
      .from("questions")
      .select("id, text, description, type")
      .eq("id", questionId)
      .eq("interviewId", interview.id)
      .single();

    if (!question) {
      return new Response(JSON.stringify({ error: "Question not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const generatorModel = resolveGeneratorModel();
    const responseLanguage = resolvePrepResponseLanguage(
      interview.language as string,
    );
    const messages = buildPrepHintPrompt({
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
      responseLanguage,
    });

    const stream = new ReadableStream({
      async start(controller) {
        const enqueueThinking = (text: string) => {
          if (text) controller.enqueue(sse({ type: "thinking", text }));
        };
        const enqueueToken = (token: string) => {
          if (token) controller.enqueue(sse({ token }));
        };

        let streamedAnswer = "";
        const splitter = createThinkStreamSplitter({
          onThinking: enqueueThinking,
          onContent: (token) => {
            streamedAnswer += token;
            enqueueToken(token);
          },
        });

        const flushRemainder = () => {
          const visible = stripThinkBlocks(splitter.state.fullContent).trim();
          if (!visible) return;
          if (visible.startsWith(streamedAnswer)) {
            const tail = visible.slice(streamedAnswer.length);
            if (tail) {
              streamedAnswer += tail;
              enqueueToken(tail);
            }
          } else if (!streamedAnswer.trim()) {
            streamedAnswer = visible;
            enqueueToken(visible);
          }
        };

        try {
          await drainLlmStream(
            streamGeneratorWithFallback({
              messages,
              temperature: 0.45,
              maxTokens: 1200,
              model: generatorModel,
            }),
            (token) => splitter.feed(token),
            {
              idleTimeoutMs: 30_000,
              totalTimeoutMs: 60_000,
              heartbeatMs: 3_000,
            },
          );
          flushRemainder();
          controller.enqueue(sseDone());
          controller.close();
        } catch (err) {
          log.error("Hint stream error:", err);
          flushRemainder();
          if (!streamedAnswer.trim()) {
            controller.enqueue(sse({ error: "Stream interrupted" }));
          } else {
            controller.enqueue(sseDone());
          }
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: streamHeaders() });
  } catch (err) {
    log.error("Hint route error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
