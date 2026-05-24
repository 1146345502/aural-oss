/** Empty-state copy in the suggested-answer sidebar — not valid interview answers. */
export const PREP_SUGGESTED_ANSWER_EMPTY_HINT =
  "Generate a sample answer grounded in your JD and resume.";

export const PREP_SUGGESTED_ANSWER_EMPTY_HINT_NO_CONTEXT =
  "Add a JD or resume, then generate a sample answer tailored to your background.";

export const PREP_UI_PLACEHOLDER_ANSWERS = [
  PREP_SUGGESTED_ANSWER_EMPTY_HINT,
  PREP_SUGGESTED_ANSWER_EMPTY_HINT_NO_CONTEXT,
] as const;
