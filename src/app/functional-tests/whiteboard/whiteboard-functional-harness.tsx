"use client";

import { WhiteboardCanvas } from "@/components/whiteboard/whiteboard-canvas";
import { useEffect, useState } from "react";

export function WhiteboardFunctionalHarness() {
  const [mermaidElementCount, setMermaidElementCount] = useState(0);
  const [mermaidMathRendered, setMermaidMathRendered] = useState(false);
  const [mermaidError, setMermaidError] = useState("");

  useEffect(() => {
    let cancelled = false;

    import("@excalidraw/mermaid-to-excalidraw")
      .then(({ parseMermaidToExcalidraw }) =>
        parseMermaidToExcalidraw(
          "flowchart TD\n  Start[Start interview] --> Done[Save result]",
        ),
      )
      .then(async (result) => {
        const mermaid = (await import("mermaid")).default;
        const { svg } = await mermaid.render(
          "functional-math-diagram",
          'flowchart TD\n  Math["$$x^2 + y^2 = z^2$$"]',
        );
        if (!cancelled) {
          setMermaidElementCount(result.elements.length);
          setMermaidMathRendered(svg.includes("katex"));
        }
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
      <div data-testid="mermaid-math-rendered">{String(mermaidMathRendered)}</div>
      <div data-testid="mermaid-error">{mermaidError}</div>
      <WhiteboardCanvas />
    </main>
  );
}
