import {
    prepSampleAnswerRulesBlock,
    prepScoringRubricBlock,
} from "@/lib/prep/answer-rubric";
import type { LLMContentPart, LLMMessage } from "../types";

export interface PrepInterviewContext {
  title: string;
  roleTitle?: string | null;
  companyName?: string | null;
  jobDescription?: string | null;
  resumeText?: string | null;
  language: string;
}

export interface PrepQuestionContext {
  text: string;
  description?: string | null;
  type?: string | null;
}

export interface PrepVoiceMetricsInput {
  durationSeconds: number;
  wordsPerMinute: number;
  confidence: number;
  clarity: number;
  tone: number;
  tips?: string[];
}

export interface PrepAnswerAudioInput {
  mimeType: string;
  base64: string;
}

export interface PrepFeedbackInput {
  interview: PrepInterviewContext;
  question: PrepQuestionContext;
  answerText: string;
  responseLanguage?: string;
  practiceMode?: boolean;
  voiceMetrics?: PrepVoiceMetricsInput;
  answerAudio?: PrepAnswerAudioInput;
  previousAttempts?: {
    answerText: string;
    score: number | null;
    feedbackSummary: string;
    feedbackImprovements?: string[];
  }[];
}

export interface PrepHintInput {
  interview: PrepInterviewContext;
  question: PrepQuestionContext;
  responseLanguage?: string;
}

export interface PrepFollowUpInput {
  interview: PrepInterviewContext;
  question: PrepQuestionContext;
  initialAnswer: string;
  initialFeedbackSummary: string;
  priorTurns: { prompt: string; answer: string }[];
  /** 0 = AI may issue terminating refinement; >0 = AI must propose another follow-up. */
  remainingTurns: number;
}

function languageInstruction(language: string, target: string): string {
  const isZh = language === "zh" || language.toLowerCase().startsWith("zh");
  if (isZh) {
    return `Write ALL ${target} text in Chinese (简体中文). JSON keys stay in English. Do not write feedback in English.`;
  }
  return `Write ALL ${target} text in English. JSON keys stay in English.`;
}

function contextBlock(interview: PrepInterviewContext): string {
  const lines = [
    `Interview: ${interview.title}`,
    `Role: ${interview.roleTitle || "Not specified"}`,
    `Company: ${interview.companyName || "Not specified"}`,
    "",
    "JOB DESCRIPTION:",
    interview.jobDescription?.trim() || "(none provided)",
    "",
    "RESUME:",
    interview.resumeText?.trim() || "(none provided)",
  ];
  return lines.join("\n");
}

function questionBlock(question: PrepQuestionContext): string {
  const description = question.description?.trim();
  return [
    `Question type: ${question.type || "OPEN_ENDED"}`,
    `Question: ${question.text}`,
    description ? `Notes: ${description}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPrepHintPrompt(input: PrepHintInput): LLMMessage[] {
  const lang = input.responseLanguage || input.interview.language;
  return [
    {
      role: "system",
      content: `You are an interview coach. Produce a polished sample answer the candidate could realistically speak aloud.

${prepScoringRubricBlock(lang)}

${prepSampleAnswerRulesBlock(lang)}

- Write ONE cohesive answer: do not repeat the opening line, greeting, or name twice.
- Start once with a natural opener, then 2-3 short paragraphs.
- Output PLAIN TEXT only — no JSON, no headings, no markdown, no reasoning preamble.

${languageInstruction(lang, "sample answer")}`,
    },
    {
      role: "user",
      content: `${contextBlock(input.interview)}

${questionBlock(input.question)}`,
    },
  ];
}

function buildPrepFeedbackUserText(input: PrepFeedbackInput, prior: string): string {
  return `${contextBlock(input.interview)}

${questionBlock(input.question)}

Candidate answer (transcript):
${input.answerText}

${
  input.answerAudio
    ? "Attached: audio recording of the candidate speaking this answer. Use it for voice delivery grading."
    : ""
}

${
  input.voiceMetrics
    ? `Supplementary voice metrics (heuristic — use only if consistent with audio/transcript):
- Duration: ${input.voiceMetrics.durationSeconds}s
- Pace: ~${input.voiceMetrics.wordsPerMinute} words/min
- Confidence (volume/steadiness): ${input.voiceMetrics.confidence}/10
- Clarity (pace): ${input.voiceMetrics.clarity}/10
- Tone (energy): ${input.voiceMetrics.tone}/10
${input.voiceMetrics.tips?.length ? `- Notes: ${input.voiceMetrics.tips.join("; ")}` : ""}`
    : ""
}

Previous attempts:
${prior}`;
}

function buildPrepFeedbackUserContent(
  input: PrepFeedbackInput,
  prior: string,
): string | LLMContentPart[] {
  const text = buildPrepFeedbackUserText(input, prior);
  if (!input.answerAudio?.base64?.trim()) return text;
  return [
    { type: "text", text },
    {
      type: "inline_audio",
      mimeType: input.answerAudio.mimeType || "audio/webm",
      data: input.answerAudio.base64,
    },
  ];
}

export function buildPrepFeedbackPrompt(input: PrepFeedbackInput): LLMMessage[] {
  const lang =
    input.responseLanguage ??
    (input.interview.language?.toLowerCase().startsWith("zh") ? "zh" : "en");
  const prior = input.previousAttempts?.length
    ? input.previousAttempts
        .map(
          (a, index) =>
            `Attempt ${index + 1}: score=${a.score ?? "n/a"}\nAnswer: ${a.answerText}\nFeedback summary: ${a.feedbackSummary}${
              a.feedbackImprovements?.length
                ? `\nCoach improvements given: ${a.feedbackImprovements.join(" | ")}`
                : ""
            }`,
        )
        .join("\n\n")
    : "No previous attempts.";

  const hasVoiceAnswer = Boolean(input.answerAudio || input.voiceMetrics);

  const jsonShape = input.practiceMode
    ? hasVoiceAnswer
      ? `{
  "score": 1-10,
  "verdict": "short label for this answer",
  "summary": "2-3 sentences of coach insight for spoken playback — do NOT quote or paraphrase the candidate's words",
  "strengths": ["specific thing that worked"],
  "improvements": ["specific action to improve"],
  "missingSignals": ["important role/JD signal not shown"],
  "resumeLeverage": ["resume fact or project the candidate should use"],
  "structureSuggestion": "recommended answer structure",
  "sampleAnswer": "a polished but natural answer grounded in the resume and JD",
  "needsUserVerification": ["claims/metrics the candidate should verify before using"],
  "voiceDelivery": { "confidence": 1-10, "clarity": 1-10, "tone": 1-10, "tips": ["one delivery tip"] }
}`
      : `{
  "score": 1-10,
  "verdict": "short label for this answer",
  "summary": "2-3 sentences of coach insight for spoken playback — do NOT quote or paraphrase the candidate's words",
  "strengths": ["specific thing that worked"],
  "improvements": ["specific action to improve"],
  "missingSignals": ["important role/JD signal not shown"],
  "resumeLeverage": ["resume fact or project the candidate should use"],
  "structureSuggestion": "recommended answer structure",
  "sampleAnswer": "a polished but natural answer grounded in the resume and JD",
  "needsUserVerification": ["claims/metrics the candidate should verify before using"]
}`
    : `{
  "score": 1-10,
  "verdict": "short label for this answer",
  "summary": "one concise paragraph",
  "strengths": ["specific thing that worked"],
  "improvements": ["specific action to improve"],
  "missingSignals": ["important role/JD signal not shown"],
  "resumeLeverage": ["resume fact or project the candidate should use"],
  "structureSuggestion": "recommended answer structure",
  "followUpQuestion": "realistic interviewer follow-up the candidate should expect",
  "sampleAnswer": "a polished but natural answer grounded in the resume and JD",
  "needsUserVerification": ["claims/metrics the candidate should verify before using"]
}`;

  return [
    {
      role: "system",
      content: `You are an interview coach giving immediate, practical feedback after one candidate answer.

Use the job description, resume, question, and candidate answer. Be specific, kind, direct, and useful. Derive expected signals yourself from JD + resume + question -- do not ask the user for them. Do not invent resume facts. If a stronger sample answer would need metrics or facts not present in the resume, mark them inside needsUserVerification.

${languageInstruction(lang, "feedback and sample-answer")}

The candidate's answer language must match your feedback language. If they spoke Chinese, respond in Chinese.

For practice mode: the summary will be read aloud by a voice coach. Do NOT repeat or quote the candidate's answer. Give conclusive coaching insight and 1-2 specific next steps only. Return valid JSON in the response body only (no markdown fences).

${input.practiceMode ? prepScoringRubricBlock(lang) : ""}

${input.practiceMode ? `The sampleAnswer field must follow the same rubric and would score 8-9 if spoken as-is. It must be complete (no mid-sentence cutoffs) and match the structureSuggestion.` : ""}

${
  input.answerAudio
    ? `An audio recording of the candidate's spoken answer is attached. You MUST:
- Grade content (score, strengths, improvements) from the transcript AND what you hear.
- Grade voiceDelivery.confidence/clarity/tone primarily from the audio (pace, pauses, fillers, volume, energy, articulation).
- Do not invent delivery issues that are not audible; cite concrete behaviors (e.g. rushed ending, long pause, flat tone).
- Weave the top 1-2 delivery issues into the spoken summary alongside content coaching.`
    : input.voiceMetrics
      ? `When voice delivery metrics are provided, you MUST:
- Set voiceDelivery.confidence/clarity/tone from the metrics (adjust by ±1 only if the transcript clearly contradicts them).
- Weave the top 1-2 delivery issues into the spoken summary (e.g. volume, pace, pauses, energy) alongside content coaching.
- Add actionable delivery tips in voiceDelivery.tips and improvements (not only in the voice section).`
      : `The candidate submitted TEXT ONLY (no audio recording). You MUST NOT include a voiceDelivery field or numeric delivery scores (confidence/clarity/tone). Grade content only. If helpful, you may mention speaking-style suggestions in improvements without inventing audio metrics.`
}
${hasVoiceAnswer ? "" : "\nDo NOT output voiceDelivery in JSON for this turn."}

Return VALID JSON ONLY (no markdown fences):
${jsonShape}

${prepScoringRubricBlock(lang)}

If the answer is only checking audio/mic or greeting without answering the question, score 1-2, leave strengths empty, and tell them to answer the actual question.

If the answer repeats your prior feedback, lists what they "should" do, or discusses strategy without speaking as the candidate in the scenario (no concrete script/actions for the question), score 1-3 max, strengths must be [], and ask them to answer in-role with specific words they would say.

If the answer is a prompt to generate a sample/suggested answer (e.g. "Generate a sample answer grounded in your JD and resume") or other UI placeholder text—not the candidate's own words—score 1-2, strengths must be [], and do not invent resume/JD details they did not say.`,
    },
    {
      role: "user",
      content: buildPrepFeedbackUserContent(input, prior),
    },
  ];
}

export function buildPrepFollowUpPrompt(input: PrepFollowUpInput): LLMMessage[] {
  const prior = input.priorTurns.length
    ? input.priorTurns
        .map(
          (t, idx) =>
            `Follow-up ${idx + 1}:\nInterviewer: ${t.prompt}\nCandidate: ${t.answer}`,
        )
        .join("\n\n")
    : "(none yet)";

  const taskInstruction =
    input.remainingTurns > 0
      ? `Produce the NEXT realistic interviewer follow-up (one question) plus a short refinement of the latest candidate turn. Set "shouldContinue": true.`
      : `This is the FINAL follow-up turn for this question. Give a short final refinement of the latest candidate turn. Set "shouldContinue": false. The "nextPrompt" field should be an empty string.`;

  return [
    {
      role: "system",
      content: `You are an interview coach probing the candidate's last answer. Use the job description, resume, original question, and conversation so far.

${taskInstruction}

Refinement rules:
- 1-2 short bullets per list. Don't repeat earlier feedback verbatim.
- Don't restate strengths the candidate already heard.
- Do not invent resume facts.

${languageInstruction(input.interview.language, "follow-up and refinement")}

Return VALID JSON ONLY (no markdown fences):
{
  "shouldContinue": boolean,
  "nextPrompt": "the next follow-up question (empty string if shouldContinue=false)",
  "refinement": {
    "verdict": "short label of how the latest turn landed",
    "stillStrong": ["what worked in the latest turn"],
    "stillMissing": ["what still needs to land"]
  }
}`,
    },
    {
      role: "user",
      content: `${contextBlock(input.interview)}

Original question: ${input.question.text}

Initial answer: ${input.initialAnswer}
Initial feedback summary: ${input.initialFeedbackSummary}

Conversation so far:
${prior}

Remaining follow-up turns after this one: ${input.remainingTurns}`,
    },
  ];
}
