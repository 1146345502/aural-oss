export type PrepContextInitial = {
  jobDescription: string | null;
  resumeText: string | null;
  companyName: string | null;
  roleTitle: string | null;
};

export function prepContextFromInterview(
  interview:
    | {
        jobDescription?: string | null;
        resumeText?: string | null;
        companyName?: string | null;
        roleTitle?: string | null;
      }
    | null
    | undefined,
): PrepContextInitial {
  return {
    jobDescription: interview?.jobDescription ?? null,
    resumeText: interview?.resumeText ?? null,
    companyName: interview?.companyName ?? null,
    roleTitle: interview?.roleTitle ?? null,
  };
}
