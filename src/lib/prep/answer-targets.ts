import {
    inferSuggestedAnswerStructure,
    structureTagLabel,
    type PrepStructureLabel,
} from "@/lib/prep/answer-rubric";

/** What a strong answer to this question should aim for. */
export type AnswerTarget = {
  structure: PrepStructureLabel;
  structureLabel: string;
  structureHint: string;
  /** Signals the coach expects to hear in a strong answer. */
  signals: string[];
  /** Suggested spoken length, e.g. "60–90s". */
  lengthLabel: string;
  /** Suggested word budget, e.g. "80–110 words". */
  wordsLabel: string;
};

const TARGET_PRESETS: Record<
  PrepStructureLabel,
  { signals: string[]; lengthLabel: string; wordsLabel: string }
> = {
  Intro: {
    signals: ["Who you are", "Why this role", "One proof point"],
    lengthLabel: "60–90s",
    wordsLabel: "80–110 words",
  },
  STAR: {
    signals: ["Specific situation", "Your actions", "Measurable result"],
    lengthLabel: "90–120s",
    wordsLabel: "120–160 words",
  },
  PAR: {
    signals: ["Problem framing", "Approach & trade-offs", "Outcome"],
    lengthLabel: "90–150s",
    wordsLabel: "120–180 words",
  },
  Technical: {
    signals: ["Problem framing", "Approach & trade-offs", "Outcome"],
    lengthLabel: "90–150s",
    wordsLabel: "120–180 words",
  },
  Service: {
    signals: ["Empathy", "Need probe", "Clear next step"],
    lengthLabel: "60–90s",
    wordsLabel: "80–120 words",
  },
  Knowledge: {
    signals: ["Key categories", "Features", "Best-fit customer"],
    lengthLabel: "60–90s",
    wordsLabel: "80–120 words",
  },
  Choice: {
    signals: ["Selected option", "Reason", "Trade-off"],
    lengthLabel: "30–60s",
    wordsLabel: "50–80 words",
  },
  WrapUp: {
    signals: ["Extra signal", "Role fit", "Concise close"],
    lengthLabel: "30–60s",
    wordsLabel: "50–80 words",
  },
};

/** Heuristic answer target for a question (structure, expected signals, length). */
export function buildAnswerTarget(
  questionType: string | null | undefined,
  questionText: string,
): AnswerTarget {
  const structure = inferSuggestedAnswerStructure(questionType, questionText);
  const { label, hint } = structureTagLabel(structure);
  const preset = TARGET_PRESETS[structure] ?? TARGET_PRESETS.STAR;
  return {
    structure,
    structureLabel: label,
    structureHint: hint,
    signals: preset.signals,
    lengthLabel: preset.lengthLabel,
    wordsLabel: preset.wordsLabel,
  };
}
