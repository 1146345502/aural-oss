export interface IntervieweeTourStep {
  id: string;
  selector: string;
  placement: "top" | "bottom" | "left" | "right";
  /** When true, this step is skipped if the target element is not in the DOM */
  optional?: boolean;
}

export const VOICE_TOUR_STEPS: IntervieweeTourStep[] = [
  { id: "voice-status", selector: '[data-tour="voice-status"]', placement: "right" },
  { id: "voice-mic", selector: '[data-tour="voice-mic"]', placement: "top" },
  { id: "voice-chat", selector: '[data-tour="voice-chat"]', placement: "top", optional: true },
  { id: "voice-tools", selector: '[data-tour="voice-tools"]', placement: "top" },
  { id: "voice-transcript", selector: '[data-tour="voice-transcript"]', placement: "left" },
  { id: "voice-progress", selector: '[data-tour="voice-progress"]', placement: "top" },
];

export const CHAT_TOUR_STEPS: IntervieweeTourStep[] = [
  { id: "chat-question", selector: '[data-tour="chat-question"]', placement: "bottom" },
  { id: "chat-input", selector: '[data-tour="chat-input"]', placement: "top" },
  { id: "chat-tools", selector: '[data-tour="chat-tools"]', placement: "bottom" },
  { id: "chat-progress", selector: '[data-tour="chat-progress"]', placement: "bottom" },
  { id: "chat-timer", selector: '[data-tour="chat-timer"]', placement: "bottom" },
];

export const TOUR_STORAGE_KEY = "aural_interviewee_tour_done";

export function markTourCompleted(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, "true");
  } catch {
    // localStorage unavailable
  }
}
