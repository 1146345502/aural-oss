import { notFound } from "next/navigation";

import { CodeEditorFunctionalHarness } from "./code-editor-functional-harness";

export default function CodeEditorFunctionalPage() {
  if (process.env.ENABLE_FUNCTIONAL_TEST_PAGES !== "1") {
    notFound();
  }

  return <CodeEditorFunctionalHarness />;
}
