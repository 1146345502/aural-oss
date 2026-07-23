"use client";

import { CodeEditorCanvas } from "@/components/code-editor/code-editor-canvas";

const INITIAL_DATA = JSON.stringify({
  code: "const secureEditor = true;",
  language: "typescript",
});

export function CodeEditorFunctionalHarness() {
  return (
    <main className="h-screen p-4">
      <CodeEditorCanvas initialData={INITIAL_DATA} fillParent />
    </main>
  );
}
