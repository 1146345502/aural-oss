"use client";

import { WhiteboardCanvas } from "@/components/whiteboard/whiteboard-canvas";
import { useEffect, useState } from "react";

export function WhiteboardFunctionalHarness() {
  const [mermaidElementCount, setMermaidElementCount] = useState(0);
  const [mermaidError, setMermaidError] = useState("");

  useEffect(() => {
    let cancelled = false;

    import("@excalidraw/mermaid-to-excalidraw")
      .then(({ parseMermaidToExcalidraw }) =>
        parseMermaidToExcalidraw(
          "flowchart TD\n  Start[Start interview] --> Done[Save result]",
        ),
      )
      .then((result) => {
        if (!cancelled) setMermaidElementCount(result.elements.length);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMermaidError(
            error instanceof Error ? error.message : "Mermaid conversion failed",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="p-6">
      <div data-testid="mermaid-element-count">{mermaidElementCount}</div>
      <div data-testid="mermaid-error">{mermaidError}</div>
      <WhiteboardCanvas />
    </main>
  );
}
