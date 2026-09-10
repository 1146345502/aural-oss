import { notFound } from "next/navigation";
import { Suspense } from "react";
import NewInterviewPage from "@/app/(dashboard)/interviews/new/page";

export default function InterviewDraftsFunctionalPage() {
  if (process.env.ENABLE_FUNCTIONAL_TEST_PAGES !== "1") notFound();
  return <Suspense><NewInterviewPage /></Suspense>;
}
