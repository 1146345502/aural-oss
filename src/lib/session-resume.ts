/**
 * Rebuilds what a participant should see when they re-enter a session already underway, whether they
 * came back through their invite link or the owner reopened it from the Sessions tab.
 *
 * Both routes reuse the same session row, so everything already stored on it — transcript, whiteboard
 * drawings, the question they had reached — has to be handed back to the interface. Otherwise the
 * interview silently restarts from the first question and the second pass is appended to the first in
 * the stored transcript.
 */

export interface ResumeMessage {
  id: string;
  role: string;
  content: string;
  contentType?: string | null;
  whiteboardData?: unknown;
  timestamp?: string | number | Date | null;
}

export interface ResumeVoiceMessage {
  id: string;
  role: string;
  content: string;
}

export interface ResumeChatMessage {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  timestamp: string;
}

export interface ResumeDrawing {
  id: string;
  label: string;
  snapshotData: string;
}

export interface SessionResumeState {
  /** True once the session has any stored message, i.e. this is a re-entry rather than a first visit. */
  isResuming: boolean;
  /** Index into the interview's questions to resume at. */
  questionIndex: number;
  /** False when nothing pinned a question, so callers can leave the interface on its own default. */
  hasQuestion: boolean;
  voiceMessages: ResumeVoiceMessage[];
  chatMessages: ResumeChatMessage[];
  drawings: ResumeDrawing[];
}

function timestampValue(timestamp: ResumeMessage["timestamp"]): number {
  if (timestamp === null || timestamp === undefined) return 0;
  const parsed = new Date(timestamp as string | number | Date).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function buildSessionResumeState(input: {
  messages?: ResumeMessage[] | null;
  currentQuestionId?: string | null;
  /** Used only when the session itself has not recorded a question yet. */
  fallbackQuestionId?: string | null;
  questions?: Array<{ id: string; order?: number | null }> | null;
}): SessionResumeState {
  // The relay resolves the resume index against questions sorted by `order`, so the index has to be
  // computed against that same sequence. Queries do not all sort the rows they return, and an index
  // taken from an unsorted list silently starts the interview from the middle.
  const questions = [...(input.questions ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );

  const indexOfQuestion = (questionId?: string | null) => {
    if (!questionId) return -1;
    return questions.findIndex((question) => question.id === questionId);
  };

  const currentIdx = indexOfQuestion(input.currentQuestionId);
  const fallbackIdx = currentIdx >= 0 ? -1 : indexOfQuestion(input.fallbackQuestionId);
  const resolvedIdx = currentIdx >= 0 ? currentIdx : fallbackIdx;

  // Sorting here rather than in each query keeps ordering identical across callers and avoids relying
  // on the order nested rows happen to come back in.
  const messages = [...(input.messages ?? [])].sort(
    (a, b) => timestampValue(a.timestamp) - timestampValue(b.timestamp),
  );

  const voiceMessages: ResumeVoiceMessage[] = [];
  const chatMessages: ResumeChatMessage[] = [];
  const drawings: ResumeDrawing[] = [];

  for (const message of messages) {
    const contentType = message.contentType ?? "TEXT";

    if (contentType === "WHITEBOARD") {
      if (!message.whiteboardData) continue;
      const label = (message.whiteboardData as Record<string, unknown>)?.label;
      // The id must stay the drawing id held in `content`: saveWhiteboard upserts on it, so a resumed
      // drawing saved again updates its row rather than inserting a duplicate.
      drawings.push({
        id: message.content,
        label: typeof label === "string" ? label : "Drawing",
        snapshotData: JSON.stringify(message.whiteboardData),
      });
      continue;
    }

    chatMessages.push({
      id: message.id,
      role: message.role as ResumeChatMessage["role"],
      content: message.content,
      timestamp: String(message.timestamp ?? ""),
    });

    // Voice keeps only spoken turns; attachments have no place in a read-back transcript.
    if (contentType === "TEXT") {
      voiceMessages.push({
        id: message.id,
        role: message.role,
        content: message.content,
      });
    }
  }

  return {
    isResuming: messages.length > 0,
    questionIndex: resolvedIdx >= 0 ? resolvedIdx : 0,
    hasQuestion: Boolean(input.currentQuestionId || input.fallbackQuestionId),
    voiceMessages,
    chatMessages,
    drawings,
  };
}
