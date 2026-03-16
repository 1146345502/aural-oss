"use client";

import { createContext, useContext } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface EditInterviewContextValue {
  interview: any;
  interviewId: string;
  updateMutation: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const EditInterviewContext = createContext<EditInterviewContextValue | null>(null);

export const EditInterviewProvider = EditInterviewContext.Provider;

export function useEditInterview() {
  const ctx = useContext(EditInterviewContext);
  if (!ctx) throw new Error("useEditInterview must be used within EditInterviewProvider");
  return ctx;
}
