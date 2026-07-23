import { notFound } from "next/navigation";

import { VoiceFunctionalHarness } from "./voice-functional-harness";

interface VoiceFunctionalPageProps {
  searchParams?: Promise<{
    language?: string | string[];
    scenario?: string | string[];
  }>;
}

export default async function VoiceFunctionalPage({
  searchParams,
}: VoiceFunctionalPageProps) {
  if (process.env.ENABLE_FUNCTIONAL_TEST_PAGES !== "1") {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const languageParam = resolvedSearchParams?.language;
  const scenarioParam = resolvedSearchParams?.scenario;
  const language = Array.isArray(languageParam)
    ? languageParam[0]
    : languageParam || "en";
  const scenario = Array.isArray(scenarioParam)
    ? scenarioParam[0]
    : scenarioParam || "default";

  return <VoiceFunctionalHarness language={language} scenario={scenario} />;
}
