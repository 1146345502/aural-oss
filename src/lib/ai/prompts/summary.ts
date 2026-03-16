import { getLanguageKey, LANGUAGE_DISPLAY_NAME } from "@/lib/i18n";
import type { LLMContentPart, LLMMessage } from "../types";

export interface WhiteboardDrawingInput {
  label: string;
  imageDataUrl?: string | null;
}

export interface CodeSnippetInput {
  label: string;
  code: string;
  language: string;
}

export function buildSummaryPrompt(
  interviewTitle: string,
  messages: { role: string; content: string }[],
  objective?: string | null,
  assessmentCriteria?: { name: string; description: string }[] | null,
  questions?: { text: string; order: number; type?: string }[] | null,
  language?: string | null,
  whiteboardDrawings?: WhiteboardDrawingInput[] | null,
  codeSnippets?: CodeSnippetInput[] | null
): LLMMessage[] {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "Participant" : "Interviewer"}: ${m.content}`)
    .join("\n\n");

  const objectiveSection = objective
    ? `\nInterview Objective: "${objective}"`
    : "";

  // ── Questions section ──────────────────────────────────────────
  const questionsSection =
    questions && questions.length > 0
      ? `\n\nInterview Questions:\n${questions.map((q, i) => `${i + 1}. ${q.type ? `[${q.type}] ` : ""}${q.text}`).join("\n")}`
      : "";

  // ── Whiteboard drawings section (text context) ─────────────────
  const hasDrawings = whiteboardDrawings && whiteboardDrawings.length > 0;
  const whiteboardSection = hasDrawings
    ? `\n\nWhiteboard Drawings (created by the participant during the interview):\n${whiteboardDrawings.map((d, i) => `${i + 1}. "${d.label}"`).join("\n")}`
    : "";

  // ── Code snippets section ─────────────────────────────────────
  const hasCode = codeSnippets && codeSnippets.length > 0;
  const codeSection = hasCode
    ? `\n\nCode Snippets (written by the participant during the interview):\n${codeSnippets.map((s, i) => `--- Snippet ${i + 1}: "${s.label}" (${s.language}) ---\n${s.code}\n--- End of Snippet ${i + 1} ---`).join("\n\n")}`
    : "";

  // ── Assessment criteria section ────────────────────────────────
  const criteriaSection =
    assessmentCriteria && assessmentCriteria.length > 0
      ? `\nAssessment Criteria:\n${assessmentCriteria.map((c) => `- ${c.name}: ${c.description}`).join("\n")}`
      : "";

  const criteriaEvalInstruction =
    assessmentCriteria && assessmentCriteria.length > 0
      ? `7. Evaluate the participant against EACH assessment criterion with a score (1-10) and reasoning\n`
      : "";

  const criteriaJsonField =
    assessmentCriteria && assessmentCriteria.length > 0
      ? `,
  "criteriaEvaluations": [
    { "name": "criterion name", "score": 1-10, "reasoning": "brief explanation of the score" }
  ]`
      : "";

  // ── Research questions section ────────────────────────────────
  const researchQuestions = questions?.filter((q) => q.type === "RESEARCH") ?? [];
  const hasResearchQuestions = researchQuestions.length > 0;

  const toneInstruction = `${hasResearchQuestions ? "9" : "8"}. Analyze the participant's communication tone and confidence throughout the interview by examining speech patterns in the transcript: filler words ("um", "uh", "like", "嗯", "那个"), hedging language ("I think maybe", "I'm not sure but", "可能", "大概"), response lengths, directness vs evasiveness, and enthusiasm markers. Produce a per-question tone assessment.\n`;

  const researchInstruction = hasResearchQuestions
    ? `${hasResearchQuestions ? "10" : "9"}. For each RESEARCH-type question, produce a detailed research finding: a comprehensive, specific summary of ALL information the participant shared on that topic, organized into key sub-topics with supporting details, data points, examples, and direct quotes. This should read like a thorough research brief — be as specific and detailed as possible.\n`
    : "";

  const researchJsonField = hasResearchQuestions
    ? `,
  "researchFindings": [
    {
      "question": "the research question text",
      "summary": "comprehensive 2-4 paragraph summary of all information extracted, organized by sub-topics",
      "keyTopics": [
        { "topic": "topic name", "details": "specific details, data points, examples, and quotes from the participant" }
      ],
      "dataPoints": ["specific fact, number, or data point mentioned by the participant"]
    }
  ]`
    : "";

  // ── Per-question evaluation section ────────────────────────────
  const questionEvalInstruction =
    questions && questions.length > 0
      ? `6. For EACH interview question, evaluate the participant's response: how well they addressed the question, key strengths, areas for improvement, and a score (1-10)\n`
      : "";

  const questionEvalJsonField =
    questions && questions.length > 0
      ? `,
  "questionEvaluations": [
    {
      "question": "the interview question text",
      "score": 8,
      "evaluation": "detailed evaluation of the participant's response to this question",
      "highlights": ["specific strength or notable point"],
      "improvements": ["area where the response could be improved"]
    }
  ]`
      : "";

  // ── Language instruction ───────────────────────────────────────
  const langKey = getLanguageKey(language ?? undefined);
  const languageInstruction = language
    ? `\n\nIMPORTANT: Write the ENTIRE report (all text fields including summary, evaluations, insights, themes) in ${LANGUAGE_DISPLAY_NAME[langKey]}. Do NOT mix languages.`
    : "";

  const whiteboardInstruction = hasDrawings
    ? "\n- The participant created whiteboard drawings during the interview to visually illustrate their ideas. The drawing images are attached below. Analyze the visual content of each drawing and incorporate your observations into the report — describe what was drawn, how it relates to the discussion, and whether it demonstrates clear thinking or effective communication."
    : "";

  const codeInstruction = hasCode
    ? "\n- The participant wrote code snippets during the interview. Evaluate the code quality, correctness, readability, and problem-solving approach. Consider whether the code demonstrates strong algorithmic thinking, proper use of data structures, good coding practices, and effective handling of edge cases. Incorporate your code evaluation into the report."
    : "";

  const systemPrompt = `You are an expert interview analyst. Evaluate and summarize the following interview transcript. Focus on the participant's responses — their depth, relevance, and quality.

Interview: "${interviewTitle}"${objectiveSection}${criteriaSection}${questionsSection}${whiteboardSection}${codeSection}

Transcript:
${transcript}

Your analysis should:
1. Summarize the key points from the participant's answers
2. Evaluate how well the participant addressed each topic
3. Identify recurring themes and notable insights
4. Assess the overall sentiment and engagement level
5. Highlight any particularly strong or weak responses${whiteboardInstruction}${codeInstruction}
${questionEvalInstruction}${criteriaEvalInstruction}${toneInstruction}${researchInstruction}${languageInstruction}

Provide a structured analysis as VALID JSON ONLY (use only standard ASCII double-quotes, never Unicode smart quotes like \u201C \u201D):
{
  "summary": "2-3 paragraph evaluation of the participant's responses, covering key points discussed and overall performance",
  "themes": ["theme1", "theme2", ...],
  "sentiment": {
    "overall": "positive" | "neutral" | "negative",
    "details": "brief analysis of participant's engagement and attitude"
  },
  "keyInsights": ["insight1", "insight2", ...],
  "notableQuotes": ["direct quote from participant 1", "direct quote 2"],
  "toneAnalysis": {
    "overall": "confident" | "neutral" | "hesitant",
    "details": "brief overall communication style assessment",
    "segments": [
      { "question": "Q1 question text", "tone": "confident" | "enthusiastic" | "neutral" | "hesitant" | "uncertain", "confidence": "high" | "medium" | "low", "notes": "specific observations about speech patterns, filler words, directness" }
    ]
  }${questionEvalJsonField}${criteriaJsonField}${researchJsonField}
}`;

  const result: LLMMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // ── Attach whiteboard images as a multimodal user message ──────
  if (hasDrawings) {
    const drawingsWithImages = whiteboardDrawings.filter((d) => d.imageDataUrl);
    if (drawingsWithImages.length > 0) {
      const parts: LLMContentPart[] = [
        {
          type: "text",
          text: `Here are the whiteboard drawings created by the participant during the interview. Please analyze their visual content:\n${drawingsWithImages.map((d, i) => `Drawing ${i + 1}: "${d.label}"`).join("\n")}`,
        },
        ...drawingsWithImages.map(
          (d) =>
            ({
              type: "image_url",
              image_url: { url: d.imageDataUrl! },
            }) as LLMContentPart
        ),
      ];
      result.push({ role: "user", content: parts });
    }
  }

  return result;
}
