import type { LLMMessage } from "../types";

export function buildGeneratorPrompt(
  description: string,
  durationMinutes?: number,
  language?: string
): LLMMessage[] {
  const languageInstruction = language && language !== "en"
    ? `\nLANGUAGE: All generated content (title, description, objective, assessment criteria names & descriptions, question texts & descriptions, follow-up prompts, and aiName) MUST be written in ${language}. Only the JSON keys and enum values (e.g. "OPEN_ENDED", "PROFESSIONAL") should remain in English.\n`
    : "";

  return [
    {
      role: "system",
      content: `You are an expert interview designer. Create a comprehensive interview structure based on the user's requirements.
${languageInstruction}
TASK:
Design a complete interview with:
1. A compelling title
2. A brief description (1-2 sentences summarizing the interview purpose)
3. Clear objective statement
4. 3-6 specific, measurable assessment criteria based on the interview objective
5. 5-15 well-crafted questions in logical flow
6. Recommended question types for each
7. Optimal AI persona configuration

GUIDELINES:
- Start with an ice-breaker/warm-up question
- Group related topics together
- Place most important questions in the middle (when engagement is highest)
- End with an open "anything else" question
- Use OPEN_ENDED for free-text/verbal responses, SINGLE_CHOICE when the participant must pick exactly one option, MULTIPLE_CHOICE when multiple selections are allowed, CODING for programming/algorithm questions, and RESEARCH when the goal is to extract as much detailed information as possible on a topic
- For SINGLE_CHOICE and MULTIPLE_CHOICE questions, ALWAYS provide 2-6 clear option strings in the "options" field
- For CODING questions, set "options" to null. Write a clear problem statement in the question text. Include a "starterCode" object with "language" and "code" fields containing a code template for the participant.
- Suggest time limits where appropriate
- Assessment criteria should be specific dimensions the participant will be evaluated on (e.g. "Communication Skills", "Problem Solving Ability", "Cultural Fit")

QUESTION TYPES:
- "OPEN_ENDED": Free-form text or verbal response. Set "options" to null.
- "SINGLE_CHOICE": Participant picks exactly one option. MUST include "options" with 2-6 option strings.
- "MULTIPLE_CHOICE": Participant can select more than one option. MUST include "options" with 2-6 option strings.
- "CODING": A coding/programming question where the participant writes code using a built-in code editor. Set "options" to null. The question text should clearly describe the problem to solve.
- "RESEARCH": A deep-dive question designed to extract comprehensive information on a topic. The interviewer will apply deeper follow-ups to explore every angle. Set "options" to null. Use when the goal is thorough knowledge extraction rather than evaluation.

OUTPUT VALID JSON ONLY (no markdown, no explanation):
{
  "title": "string",
  "description": "string (1-2 sentence summary of the interview purpose)",
  "objective": "string",
  "assessmentCriteria": [
    { "name": "string (criterion name)", "description": "string (what this criterion measures)" }
  ],
  "estimatedDurationMinutes": number,
  "questions": [
    {
      "order": number,
      "text": "string",
      "type": "OPEN_ENDED" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "CODING" | "WHITEBOARD" | "RESEARCH",
      "description": "string (helper text for the question)",
      "timeLimitSeconds": number | null,
      "isRequired": true,
      "options": { "options": ["string", "string", ...], "allowMultiple": false } | null,
      "followUpPrompts": ["string"],
      "starterCode": { "language": "string", "code": "string" } | null
    }
  ],
  "recommendedSettings": {
    "mode": "CHAT" | "VOICE" | "HYBRID",
    "followUpDepth": "LIGHT" | "MODERATE" | "DEEP",
    "aiTone": "CASUAL" | "PROFESSIONAL" | "FORMAL" | "FRIENDLY",
    "aiName": "string suggestion"
  }
}`,
    },
    {
      role: "user",
      content: `Create an interview for the following goal:

"${description}"

${durationMinutes ? `Target duration: approximately ${durationMinutes} minutes.` : ""}

Please generate the complete interview structure as JSON.`,
    },
  ];
}

export function buildImprovePrompt(
  currentInterview: {
    title: string;
    description?: string | null;
    objective?: string | null;
    assessmentCriteria?: { name: string; description: string }[];
    questions: { text: string; type: string }[];
  },
  feedback: string,
  language?: string
): LLMMessage[] {
  const questionsText = currentInterview.questions
    .map((q, i) => `${i + 1}. [${q.type}] ${q.text}`)
    .join("\n");

  const criteriaText = currentInterview.assessmentCriteria?.length
    ? currentInterview.assessmentCriteria
        .map((c) => `- ${c.name}: ${c.description}`)
        .join("\n")
    : "None defined";

  return [
    {
      role: "system",
      content: `You are an expert interview designer. Improve an existing interview based on user feedback.
${language && language !== "en" ? `\nLANGUAGE: All generated content (title, description, objective, assessment criteria names & descriptions, question texts & descriptions, follow-up prompts, and aiName) MUST be written in ${language}. Only the JSON keys and enum values (e.g. "OPEN_ENDED", "PROFESSIONAL") should remain in English.\n` : ""}
QUESTION TYPES:
- "OPEN_ENDED": Free-form text or verbal response. Set "options" to null.
- "SINGLE_CHOICE": Participant picks exactly one option. MUST include "options" with 2-6 option strings.
- "MULTIPLE_CHOICE": Participant can select more than one option. MUST include "options" with 2-6 option strings.
- "CODING": A coding/programming question where the participant writes code. Set "options" to null.
- "RESEARCH": A deep-dive question for extracting comprehensive information on a topic. Set "options" to null.

OUTPUT VALID JSON ONLY (no markdown, no explanation):
{
  "title": "string",
  "description": "string (1-2 sentence summary of the interview purpose)",
  "objective": "string",
  "assessmentCriteria": [
    { "name": "string (criterion name)", "description": "string (what this criterion measures)" }
  ],
  "estimatedDurationMinutes": number,
  "questions": [
    {
      "order": number,
      "text": "string",
      "type": "OPEN_ENDED" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "CODING" | "WHITEBOARD" | "RESEARCH",
      "description": "string (helper text for the question)",
      "timeLimitSeconds": number | null,
      "isRequired": true,
      "options": { "options": ["string", "string", ...], "allowMultiple": false } | null,
      "followUpPrompts": ["string"],
      "starterCode": { "language": "string", "code": "string" } | null
    }
  ],
  "recommendedSettings": {
    "mode": "CHAT" | "VOICE" | "HYBRID",
    "followUpDepth": "LIGHT" | "MODERATE" | "DEEP",
    "aiTone": "CASUAL" | "PROFESSIONAL" | "FORMAL" | "FRIENDLY",
    "aiName": "string suggestion"
  }
}

IMPORTANT: Each question MUST have a "text" field with the question content.
IMPORTANT: Always include 3-6 assessment criteria.
IMPORTANT: Always include a "description" field with a 1-2 sentence summary.
IMPORTANT: For SINGLE_CHOICE and MULTIPLE_CHOICE questions, ALWAYS include "options" with 2-6 clear choices.`,
    },
    {
      role: "user",
      content: `Current interview:
Title: ${currentInterview.title}
Description: ${currentInterview.description ?? "Not set"}
Objective: ${currentInterview.objective ?? "Not set"}
Assessment Criteria:
${criteriaText}
Questions:
${questionsText}

User feedback: "${feedback}"

Please improve this interview based on the feedback. Output ONLY valid JSON.`,
    },
  ];
}
