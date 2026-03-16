import { notFound } from "next/navigation";

import { VoiceFunctionalHarness } from "./voice-functional-harness";

interface VoiceFunctionalPageProps {
  searchParams?: {
    language?: string | string[];
    scenario?: string | string[];
  };
}

export default function VoiceFunctionalPage({
  searchParams,
}: VoiceFunctionalPageProps) {
  if (process.env.ENABLE_FUNCTIONAL_TEST_PAGES !== "1") {
    notFound();
  }

  const languageParam = searchParams?.language;
  const scenarioParam = searchParams?.scenario;
  const language = Array.isArray(languageParam)
    ? languageParam[0]
    : languageParam || "en";
  const scenario = Array.isArray(scenarioParam)
    ? scenarioParam[0]
    : scenarioParam || "default";

  return <VoiceFunctionalHarness language={language} scenario={scenario} />;
}
