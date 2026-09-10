import { z } from "zod";

export const apiCandidateDetailsSchema = z.object({
  gender: z.string().nullable().optional(),
  birthday: z.iso.date().nullable().optional(),
  education: z.string().nullable().optional(),
  school: z.string().nullable().optional(),
  major: z.string().nullable().optional(),
  graduationYear: z.number().int().nullable().optional(),
  workExperience: z.string().nullable().optional(),
});

export const apiQuestionDetailsSchema = z.object({
  description: z.string().nullable().optional(),
  starterCode: z.record(z.string(), z.string()).nullable().optional(),
  validationRules: z.json().nullable().optional(),
  followUpPrompts: z.json().nullable().optional(),
  probeThreshold: z.number().nullable().optional(),
  showIf: z.json().nullable().optional(),
  skipIf: z.json().nullable().optional(),
  timeLimitSeconds: z.number().int().positive().nullable().optional(),
  allowFileUpload: z.boolean().optional(),
  allowedFileTypes: z.array(z.string()).optional(),
});

export const bulkInterviewActionSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(100)
    .transform((ids) => [...new Set(ids)]),
  dryRun: z.boolean().default(true),
});
