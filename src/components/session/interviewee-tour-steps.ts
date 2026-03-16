export interface IntervieweeTourStep {
  id: string;
  selector: string;
  title: string;
  description: string;
  placement: "top" | "bottom" | "left" | "right";
  /** When true, this step is skipped if the target element is not in the DOM */
  optional?: boolean;
}

export const VOICE_TOUR_STEPS: IntervieweeTourStep[] = [
  {
    id: "voice-status",
    selector: '[data-tour="voice-status"]',
    title: "Your AI Interviewer",
    description:
      "This is your AI interviewer. It will speak to you and listen to your responses in real time.",
    placement: "right",
  },
  {
    id: "voice-mic",
    selector: '[data-tour="voice-mic"]',
    title: "Microphone Control",
    description:
      "Click to mute or unmute your microphone. Speak naturally when unmuted — the AI will respond automatically.",
    placement: "top",
  },
  {
    id: "voice-chat",
    selector: '[data-tour="voice-chat"]',
    title: "Text Chat Channel",
    description:
      "Prefer typing? Open the chat panel to send text messages alongside the voice conversation.",
    placement: "top",
    optional: true,
  },
  {
    id: "voice-tools",
    selector: '[data-tour="voice-tools"]',
    title: "Whiteboard & Code Editor",
    description:
      "Use the Whiteboard for diagrams or the Code Editor for coding questions. They open as side panels.",
    placement: "top",
  },
  {
    id: "voice-transcript",
    selector: '[data-tour="voice-transcript"]',
    title: "Conversation Transcript",
    description:
      "Your full conversation transcript appears here. Use it to review what was said.",
    placement: "left",
  },
  {
    id: "voice-progress",
    selector: '[data-tour="voice-progress"]',
    title: "Question Progress",
    description:
      "Track your progress here. Use Previous/Next to navigate between questions, or click End when finished.",
    placement: "top",
  },
];

export const CHAT_TOUR_STEPS: IntervieweeTourStep[] = [
  {
    id: "chat-question",
    selector: '[data-tour="chat-question"]',
    title: "Current Question",
    description:
      "The current question appears here. The AI interviewer will guide you through each one and may ask follow-ups.",
    placement: "bottom",
  },
  {
    id: "chat-input",
    selector: '[data-tour="chat-input"]',
    title: "Type Your Response",
    description:
      "Type your answer here and press Enter or click Send. Take your time to compose thoughtful responses.",
    placement: "top",
  },
  {
    id: "chat-tools",
    selector: '[data-tour="chat-tools"]',
    title: "Whiteboard & Code Editor",
    description:
      "Open the Whiteboard for diagrams or the Code Editor for coding questions. They appear above the chat.",
    placement: "bottom",
  },
  {
    id: "chat-progress",
    selector: '[data-tour="chat-progress"]',
    title: "Question Progress",
    description:
      "Track your progress with the progress bar. The question counter shows how far along you are.",
    placement: "bottom",
  },
  {
    id: "chat-timer",
    selector: '[data-tour="chat-timer"]',
    title: "Timer & Navigation",
    description:
      "Keep an eye on the timer if one is set. Use the back arrow to revisit previous questions.",
    placement: "bottom",
  },
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
