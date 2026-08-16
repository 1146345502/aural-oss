export const DEFAULT_TTS_BARGE_IN_MIN_AUDIO_MS = 400;
export const DEFAULT_TTS_BARGE_IN_MIN_AUDIO_BYTES = 32_000;

/**
 * System-prompt copy describing the follow-up budget.
 *
 * A budget of zero needs its own wording: "at most 0 follow-ups" reads as a
 * riddle, and the model tends to improvise past it.
 */
export function followUpDepthPromptCopy(
  maxFollowUps: number,
  isZh: boolean,
): { summary: string; rule: string } {
  if (maxFollowUps === 0) {
    return isZh
      ? {
          summary: "不追问（受访者回答完当前问题后直接进入下一题）",
          rule: "这场面试不使用追问。提出问题、听完回答后就进入下一题。只有在回答完全听不懂或明显跑题时才追问一次。",
        }
      : {
          summary:
            "no follow-ups — move on once the participant has answered the scripted question",
          rule: "This interview uses no follow-ups. Ask the scripted question, listen to the answer, then move on. Only probe if the answer was unintelligible or clearly about a different topic.",
        };
  }

  const plural = maxFollowUps === 1 ? "" : "s";
  return isZh
    ? {
        summary: `每题最多${maxFollowUps}次追问`,
        rule: `对每个问题，根据受访者的回答最多追问${maxFollowUps}次，达到上限后必须进入下一题。语气要像友好、耐心的真人面试官，而不是冷冰冰地连珠发问。`,
      }
    : {
        summary: `at most ${maxFollowUps} follow-up${plural} per question`,
        rule: `For each question, ask at most ${maxFollowUps} follow-up${plural} based on the participant's answers, then move on — never exceed that limit. Sound like a warm, patient human interviewer, not a rapid-fire questionnaire.`,
      };
}

/**
 * Follow-ups the participant has actually heard on the current question.
 *
 * Counts completed assistant turns rather than user utterances: ASR splits one
 * spoken answer into several finals, and a barged-in turn was never heard. The
 * first assistant turn is the scripted question itself, so it is not a follow-up.
 */
export function followUpsSpentOnQuestion(
  assistantTurnsThisQuestion: number,
): number {
  return Math.max(0, assistantTurnsThisQuestion - 1);
}

export interface FollowUpLimitNoticeInput {
  assistantTurnsThisQuestion: number;
  followUpBudget: number;
  noticeAlreadySent: boolean;
  interviewDone: boolean;
}

/**
 * Whether to tell the Realtime model its follow-up budget is gone.
 *
 * The model drives its own turn-taking, so the configured depth can only be
 * enforced by injecting an instruction once the budget is spent.
 */
export function shouldSendFollowUpLimitNotice({
  assistantTurnsThisQuestion,
  followUpBudget,
  noticeAlreadySent,
  interviewDone,
}: FollowUpLimitNoticeInput): boolean {
  if (noticeAlreadySent || interviewDone) return false;
  return (
    followUpsSpentOnQuestion(assistantTurnsThisQuestion) >= followUpBudget
  );
}

/** Instruction injected once the follow-up budget for a question is spent. */
export function followUpLimitNotice(
  questionNumber: number,
  followUpBudget: number,
  isZh: boolean,
): string {
  if (isZh) {
    return `[SYSTEM] 第${questionNumber}题的追问次数已用完（本次面试每题最多${followUpBudget}次追问）。受访者下次回答后，简短承接一句，然后调用 signal_question_change 进入下一题。不要再追问这道题。`;
  }
  const plural = followUpBudget === 1 ? "" : "s";
  return `[SYSTEM] The follow-up budget for question ${questionNumber} is used up (this interview allows at most ${followUpBudget} follow-up${plural} per question). After the participant's next answer, briefly acknowledge it and call signal_question_change to move on. Do not ask another follow-up on this question.`;
}

export interface TtsBargeInDecision {
  inEchoCooldown: boolean;
  modelIsSpeaking: boolean;
  responseAudioStarted: boolean;
  ttsAudioStartedAt: number;
  nowMs: number;
  responseTtsBytes: number;
  rms: number;
  thresholdRms: number;
  consecutiveFrames: number;
  thresholdFrames: number;
  minAudioMs?: number;
  minAudioBytes?: number;
}

export function shouldAllowTtsBargeIn({
  inEchoCooldown,
  modelIsSpeaking,
  responseAudioStarted,
  ttsAudioStartedAt,
  nowMs,
  responseTtsBytes,
  rms,
  thresholdRms,
  consecutiveFrames,
  thresholdFrames,
  minAudioMs = DEFAULT_TTS_BARGE_IN_MIN_AUDIO_MS,
  minAudioBytes = DEFAULT_TTS_BARGE_IN_MIN_AUDIO_BYTES,
}: TtsBargeInDecision): boolean {
  if (!inEchoCooldown || !modelIsSpeaking || !responseAudioStarted) return false;
  if (ttsAudioStartedAt <= 0) return false;
  if (nowMs - ttsAudioStartedAt < minAudioMs) return false;
  if (responseTtsBytes < minAudioBytes) return false;
  if (rms < thresholdRms) return false;
  if (consecutiveFrames < thresholdFrames) return false;
  return true;
}
