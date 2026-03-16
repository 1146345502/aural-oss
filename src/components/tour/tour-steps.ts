export interface TourStep {
  id: string;
  /** CSS selector for the target element (uses data-tour attribute) */
  selector: string;
  title: string;
  description: string;
  /** URL pattern the step belongs to (exact match or prefix) */
  page: string;
  /** Where the tooltip appears relative to the target */
  placement: "top" | "bottom" | "left" | "right";
  /**
   * If set, clicking "Next" navigates to this URL before activating
   * the next step. Useful when the next step is on a different page.
   */
  advanceTo?: string;
  /** Wait for an element matching this selector before showing the step */
  waitFor?: string;
  /** If true, clicking the target does NOT auto-advance the tour */
  noAutoAdvance?: boolean;
  /**
   * CSS selector for an input/textarea. When set, "Next" is disabled
   * until the matched element has a non-empty value.
   */
  requireInput?: string;
  /**
   * CSS selector — auto-advance the tour when an element matching this
   * selector appears in the DOM (e.g. a dropdown menu item after opening).
   */
  advanceOnAppear?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "project-card",
    selector: '[data-tour="project-card"]',
    title: "Select a project",
    description:
      "**Click on a project** to open it. This is where your interviews and sessions live.",
    page: "/organizations",
    placement: "right",
  },
  {
    id: "new-interview",
    selector: '[data-tour="new-interview"]',
    title: "Create a new interview",
    description:
      'Click **"+ New Interview"** to set up your first AI-powered interview.',
    page: "/dashboard",
    placement: "bottom",
  },
  {
    id: "interview-prompt",
    selector: '[data-tour="interview-prompt"]',
    title: "Describe your interview",
    description:
      "**Type a description** of the interview you need. Be specific about the role and skills you want to assess.",
    page: "/interviews/new",
    placement: "bottom",
    noAutoAdvance: true,
    requireInput: "#ai-description",
  },
  {
    id: "generate-interview",
    selector: '[data-tour="generate-interview"]',
    title: "Generate with AI",
    description:
      'Click **"Generate"** to let AI create a complete interview structure with questions and assessment criteria.',
    page: "/interviews/new",
    placement: "top",
  },
  {
    id: "accept-create",
    selector: '[data-tour="accept-create"]',
    title: "Accept & create",
    description:
      'Review the AI-generated questions, then click **"Accept & create"** to create the interview.',
    page: "/interviews/new",
    placement: "top",
    waitFor: '[data-tour="accept-create"]',
  },
  {
    id: "add-session",
    selector: '[data-tour="add-session"]',
    title: "Add candidates",
    description:
      'Click **"+ Add"** to invite candidates to your interview.',
    page: "/edit/sessions",
    placement: "top",
    noAutoAdvance: true,
    advanceOnAppear: '[data-tour="create-individually"]',
  },
  {
    id: "create-individually",
    selector: '[data-tour="create-individually"]',
    title: "Create individually",
    description:
      'Select **"Create individually"** to add a new candidate to your interview.',
    page: "/edit/sessions",
    placement: "left",
    waitFor: '[data-tour="create-individually"]',
  },
  {
    id: "save-candidate",
    selector: '[data-tour="save-candidate"]',
    title: "Save candidate details",
    description:
      'Fill in the candidate\'s name and details, then click **"Save and add"**.',
    page: "/edit/sessions",
    placement: "left",
    noAutoAdvance: true,
    waitFor: '[data-tour="save-candidate"]',
    advanceOnAppear: '[data-tour="copy-link"]',
  },
  {
    id: "copy-link",
    selector: '[data-tour="copy-link"]',
    title: "Share the invite link",
    description:
      'Click **"Copy link"** to copy the interview invite URL. Share it with your candidate to start the interview.',
    page: "/edit/sessions",
    placement: "left",
    waitFor: '[data-tour="copy-link"]',
  },
];

export const TOUR_STORAGE_KEY = "aural_onboarding_tour";
export const TOUR_EDIT_URL_KEY = "aural_tour_last_edit_url";

export interface TourState {
  currentStep: number;
  completed: boolean;
  dismissed: boolean;
}

export function getStoredTourState(): TourState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TOUR_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredTourState(state: TourState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
}
