"use client";

import { CodeBlock } from "@/components/code-editor/code-block";
import {
    CodeEditorCanvas,
    type CodeEditorCanvasRef,
} from "@/components/code-editor/code-editor-canvas";
import { IntervieweeHelpPopover } from "@/components/session/interviewee-help-popover";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChatComposer } from "@/components/ui/chat-composer";
import { Progress } from "@/components/ui/progress";
import {
    WhiteboardCanvas,
    type WhiteboardCanvasRef,
} from "@/components/whiteboard/whiteboard-canvas";
import {
    useChunkLoadRecovery,
    useSessionToolChunkPrefetch,
} from "@/hooks/use-chunk-load-recovery";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import {
    Check,
    Clock,
    Code2,
    FileText,
    Loader2,
    MessageCircle,
    Plus,
    Save,
    X
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";

interface Message {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  timestamp: string;
}

interface Interview {
  id: string;
  title: string;
  aiName: string;
  mode: string;
  questions: {
    id: string;
    text: string;
    type: string;
    description?: string | null;
    starterCode?: { language: string; code: string } | null;
  }[];
}

const aiGreetingRequested = new Set<string>();

const CHAT_PREVIOUS_TRANSITION =
  "[I'd like to go back to the previous question and add more to my answer.]";
const CHAT_NEXT_TRANSITION =
  "[I'd like to move on to the next question.]";

export function ChatInterface({
  sessionId,
  interview,
  durationMinutes,
  initialMessages,
  initialQuestionIndex,
  onComplete,
  preview = false,
}: {
  sessionId: string;
  interview: Interview;
  durationMinutes?: number;
  initialMessages?: Message[];
  initialQuestionIndex?: number;
  onComplete: (reason?: string) => void;
  /** Render in static preview mode — shows full layout without API calls */
  preview?: boolean;
}) {
  useChunkLoadRecovery();
  useSessionToolChunkPrefetch(!preview);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const isMobile = useIsMobile();

  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(initialQuestionIndex ?? 0);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [codeEditorOpen, setCodeEditorOpen] = useState(false);
  const [finishDialogOpen, setFinishDialogOpen] = useState(false);
  const [splitPercent, setSplitPercent] = useState(40);
  const [toolSplitPercent, setToolSplitPercent] = useState(42);
  const [problemChatSplitPercent, setProblemChatSplitPercent] = useState(48);
  const splitDragging = useRef(false);
  const toolDragging = useRef(false);
  const problemChatDragging = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const toolSplitContainerRef = useRef<HTMLDivElement>(null);
  const problemChatContainerRef = useRef<HTMLDivElement>(null);
  /** Survives React Strict Mode remounts so we only request one opening greeting. */
  const greetingStartedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const whiteboardRef = useRef<WhiteboardCanvasRef>(null);
  const codeEditorRef = useRef<CodeEditorCanvasRef>(null);

  // ── Countdown timer (starts after first user message) ───────────
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const timerExpiredRef = useRef(false);
  const timerStartedRef = useRef(false);
  const initialMessageCount = useRef(initialMessages?.length ?? 0);

  useEffect(() => {
    if (timerStartedRef.current || !durationMinutes) return;
    if (messages.length > initialMessageCount.current) {
      timerStartedRef.current = true;
      setRemainingSeconds(durationMinutes * 60);
    }
  }, [messages.length, durationMinutes]);

  useEffect(() => {
    if (remainingSeconds === null || remainingSeconds <= 0) return;
    const id = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null) return null;
        return prev <= 1 ? 0 : prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [remainingSeconds]);

  // ── Multiple drawings state ───────────────────────────────────
  interface Drawing {
    id: string;
    label: string;
    snapshotData: string | null;
  }
  const [drawings, setDrawings] = useState<Drawing[]>([
    { id: crypto.randomUUID(), label: "Drawing 1", snapshotData: null },
  ]);
  const [activeDrawingIdx, setActiveDrawingIdx] = useState(0);

  // ── Multiple code snippets state ────────────────────────────────
  interface CodeSnippet {
    id: string;
    label: string;
    snapshotData: string | null;
  }
  const [codeSnippets, setCodeSnippets] = useState<CodeSnippet[]>([
    { id: crypto.randomUUID(), label: "Snippet 1", snapshotData: null },
  ]);
  const [activeSnippetIdx, setActiveSnippetIdx] = useState(0);

  // ── Per-question content map (save/restore on question switch) ──
  interface QuestionContent {
    drawings: Drawing[];
    activeDrawingIdx: number;
    codeSnippets: CodeSnippet[];
    activeSnippetIdx: number;
  }
  const questionContentMapRef = useRef<Map<number, QuestionContent>>(new Map());

  // ── Persist active drawing/code on page close ───────────────────
  const drawingsRef = useRef(drawings);
  const activeDrawingIdxRef = useRef(activeDrawingIdx);
  drawingsRef.current = drawings;
  activeDrawingIdxRef.current = activeDrawingIdx;

  const codeSnippetsRef = useRef(codeSnippets);
  const activeSnippetIdxRef = useRef(activeSnippetIdx);
  codeSnippetsRef.current = codeSnippets;
  activeSnippetIdxRef.current = activeSnippetIdx;

  useEffect(() => {
    if (preview) return;
    const handleBeforeUnload = () => {
      // Save active whiteboard drawing
      const active = drawingsRef.current[activeDrawingIdxRef.current];
      if (active) {
        const wb = whiteboardRef.current;
        const snapshotData = wb?.getSnapshotData() ?? active.snapshotData;
        if (snapshotData) {
          const payload = {
            json: {
              sessionId,
              drawingId: active.id,
              label: active.label,
              snapshotData,
            },
          };
          const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
          navigator.sendBeacon("/api/trpc/session.saveWhiteboard", blob);
        }
      }

      // Save active code snippet
      const activeSnippet = codeSnippetsRef.current[activeSnippetIdxRef.current];
      if (activeSnippet) {
        const ce = codeEditorRef.current;
        const codeSnapshot = ce?.getSnapshotData() ?? activeSnippet.snapshotData;
        if (codeSnapshot) {
          const payload = {
            json: {
              sessionId,
              snippetId: activeSnippet.id,
              label: activeSnippet.label,
              snapshotData: codeSnapshot,
            },
          };
          const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
          navigator.sendBeacon("/api/trpc/session.saveCode", blob);
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [sessionId, preview]);

  // ── Coding / Whiteboard question detection ─────────────────────
  const currentQ = interview.questions[currentQuestion];
  const isCodingQuestion = currentQ?.type === "CODING";
  const isWhiteboardQuestion = currentQ?.type === "WHITEBOARD";

  // ── Draggable split handlers ──────────────────────────────
  const handleSplitMouseDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    splitDragging.current = true;
    const onMouseMove = (ev: PointerEvent) => {
      if (!splitDragging.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(Math.max(pct, 20), 70));
    };
    const onMouseUp = () => {
      splitDragging.current = false;
      target.releasePointerCapture?.(e.pointerId);
      document.removeEventListener("pointermove", onMouseMove);
      document.removeEventListener("pointerup", onMouseUp);
    };
    document.addEventListener("pointermove", onMouseMove);
    document.addEventListener("pointerup", onMouseUp);
  }, []);

  const handleToolSplitMouseDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    toolDragging.current = true;
    const onMouseMove = (ev: PointerEvent) => {
      if (!toolDragging.current || !toolSplitContainerRef.current) return;
      const rect = toolSplitContainerRef.current.getBoundingClientRect();
      const chatPct = ((ev.clientX - rect.left) / rect.width) * 100;
      setToolSplitPercent(Math.min(Math.max(100 - chatPct, 28), 65));
    };
    const onMouseUp = () => {
      toolDragging.current = false;
      target.releasePointerCapture?.(e.pointerId);
      document.removeEventListener("pointermove", onMouseMove);
      document.removeEventListener("pointerup", onMouseUp);
    };
    document.addEventListener("pointermove", onMouseMove);
    document.addEventListener("pointerup", onMouseUp);
  }, []);

  const handleProblemChatSplitMouseDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    problemChatDragging.current = true;
    const onMouseMove = (ev: PointerEvent) => {
      if (!problemChatDragging.current || !problemChatContainerRef.current) return;
      const rect = problemChatContainerRef.current.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setProblemChatSplitPercent(Math.min(Math.max(pct, 22), 78));
    };
    const onMouseUp = () => {
      problemChatDragging.current = false;
      target.releasePointerCapture?.(e.pointerId);
      document.removeEventListener("pointermove", onMouseMove);
      document.removeEventListener("pointerup", onMouseUp);
    };
    document.addEventListener("pointermove", onMouseMove);
    document.addEventListener("pointerup", onMouseUp);
  }, []);

  const toggleWhiteboard = useCallback(() => {
    if (isCodingQuestion || isWhiteboardQuestion) {
      setWhiteboardOpen(true);
      setCodeEditorOpen(false);
      return;
    }
    setWhiteboardOpen((prev) => {
      const next = !prev;
      if (next) setCodeEditorOpen(false);
      return next;
    });
  }, [isCodingQuestion, isWhiteboardQuestion]);

  const toggleCodeEditor = useCallback(() => {
    if (isCodingQuestion || isWhiteboardQuestion) {
      setCodeEditorOpen(true);
      setWhiteboardOpen(false);
      return;
    }
    setCodeEditorOpen((prev) => {
      const next = !prev;
      if (next) setWhiteboardOpen(false);
      return next;
    });
  }, [isCodingQuestion, isWhiteboardQuestion]);

  // Auto-open editor and save/restore per-question content
  const prevQuestionRef = useRef(currentQuestion);
  useEffect(() => {
    const prevIdx = prevQuestionRef.current;
    const newIdx = currentQuestion;
    const questionChanged = prevIdx !== newIdx;

    // ── Save outgoing question's content ──
    if (questionChanged) {
      const wb = whiteboardRef.current;
      const ce = codeEditorRef.current;

      const savedDrawings = drawings.map((d, i) => {
        if (i === activeDrawingIdx && wb) {
          return { ...d, snapshotData: wb.getSnapshotData() ?? d.snapshotData };
        }
        return d;
      });
      const savedSnippets = codeSnippets.map((s, i) => {
        if (i === activeSnippetIdx && ce) {
          return { ...s, snapshotData: ce.getSnapshotData() ?? s.snapshotData };
        }
        return s;
      });

      questionContentMapRef.current.set(prevIdx, {
        drawings: savedDrawings,
        activeDrawingIdx,
        codeSnippets: savedSnippets,
        activeSnippetIdx,
      });
    }

    // ── Restore incoming question's content (or create fresh) ──
    if (questionChanged) {
      const saved = questionContentMapRef.current.get(newIdx);
      if (saved) {
        setDrawings(saved.drawings);
        setActiveDrawingIdx(saved.activeDrawingIdx);
        setCodeSnippets(saved.codeSnippets);
        setActiveSnippetIdx(saved.activeSnippetIdx);
        setTimeout(() => {
          const activeD = saved.drawings[saved.activeDrawingIdx];
          if (activeD?.snapshotData) whiteboardRef.current?.loadScene(activeD.snapshotData);
          else whiteboardRef.current?.resetScene();
          const activeS = saved.codeSnippets[saved.activeSnippetIdx];
          if (activeS?.snapshotData) codeEditorRef.current?.loadScene(activeS.snapshotData);
          else codeEditorRef.current?.resetScene();
        }, 150);
      } else {
        const freshDrawings = [{ id: crypto.randomUUID(), label: "Drawing 1", snapshotData: null as string | null }];
        const freshSnippets = [{ id: crypto.randomUUID(), label: "Snippet 1", snapshotData: null as string | null }];
        setDrawings(freshDrawings);
        setActiveDrawingIdx(0);
        setCodeSnippets(freshSnippets);
        setActiveSnippetIdx(0);
        setTimeout(() => {
          whiteboardRef.current?.resetScene();
          codeEditorRef.current?.resetScene();
        }, 150);
      }
    }

    // ── Auto-open the appropriate editor (mutually exclusive) ──
    if (isCodingQuestion) {
      setCodeEditorOpen(true);
      setWhiteboardOpen(false);
    } else if (isWhiteboardQuestion) {
      setWhiteboardOpen(true);
      setCodeEditorOpen(false);
    } else if (questionChanged) {
      setWhiteboardOpen(false);
      setCodeEditorOpen(false);
    }

    // ── Load starter code for fresh coding questions ──
    if (
      isCodingQuestion &&
      questionChanged &&
      currentQ?.starterCode?.code &&
      !questionContentMapRef.current.has(newIdx)
    ) {
      const starterData = JSON.stringify({
        code: currentQ.starterCode.code,
        language: currentQ.starterCode.language,
      });
      setTimeout(() => {
        codeEditorRef.current?.loadScene(starterData);
      }, 300);
    }

    prevQuestionRef.current = newIdx;
  }, [currentQuestion, isCodingQuestion, isWhiteboardQuestion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize: get AI greeting (skip when resuming with existing messages)
  useEffect(() => {
    if (preview || initialMessages?.length) return;
    if (greetingStartedRef.current || aiGreetingRequested.has(sessionId)) return;
    greetingStartedRef.current = true;
    aiGreetingRequested.add(sessionId);
    void getAIResponse([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Scroll to bottom on new messages
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, aiTyping]);

  /** Persist a single drawing to the backend. */
  const persistDrawing = useCallback(
    async (drawing: { id: string; label: string }, snapshotData: string, imageDataUrl?: string) => {
      try {
        await fetch("/api/trpc/session.saveWhiteboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            json: {
              sessionId,
              drawingId: drawing.id,
              label: drawing.label,
              snapshotData,
              imageDataUrl: imageDataUrl ?? undefined,
            },
          }),
        });
      } catch (err) {
        console.error("[chat] Failed to save whiteboard:", err);
      }
    },
    [sessionId],
  );

  /** Save all drawings that have content (with images for final save). */
  const saveAllDrawings = useCallback(async () => {
    const wb = whiteboardRef.current;
    if (!wb) return;

    const currentSnapshot = wb.getSnapshotData();

    const updatedDrawings = drawings.map((d, i) =>
      i === activeDrawingIdx && currentSnapshot ? { ...d, snapshotData: currentSnapshot } : d,
    );

    const persistOps: Promise<void>[] = [];
    for (const drawing of updatedDrawings) {
      if (!drawing.snapshotData) continue;
      const img =
        drawing.id === updatedDrawings[activeDrawingIdx]?.id
          ? await wb.getImageDataUrl()
          : await wb.exportImageFromData(drawing.snapshotData);
      persistOps.push(persistDrawing(drawing, drawing.snapshotData, img ?? undefined));
    }
    await Promise.all(persistOps);
  }, [drawings, activeDrawingIdx, persistDrawing]);

  // Debounced auto-save callback from WhiteboardCanvas
  const lastAutoSave = useRef<string | null>(null);
  const handleWhiteboardAutoSave = useCallback(
    async (snapshotData: string) => {
      if (snapshotData === lastAutoSave.current) return;
      lastAutoSave.current = snapshotData;

      const drawing = drawings[activeDrawingIdx];
      if (!drawing) return;

      setDrawings((prev) =>
        prev.map((d, i) => (i === activeDrawingIdx ? { ...d, snapshotData } : d)),
      );

      await persistDrawing(drawing, snapshotData);
      setSaveStatus("saved");
    },
    [drawings, activeDrawingIdx, persistDrawing],
  );

  // ── Drawing management ────────────────────────────────────────
  const switchDrawing = useCallback(
    (targetIdx: number) => {
      if (targetIdx === activeDrawingIdx) return;
      const wb = whiteboardRef.current;
      if (!wb) return;

      // Snapshot current canvas into drawings state and persist to backend
      const currentSnapshot = wb.getSnapshotData();
      const currentDrawing = drawings[activeDrawingIdx];
      setDrawings((prev) =>
        prev.map((d, i) => (i === activeDrawingIdx ? { ...d, snapshotData: currentSnapshot } : d)),
      );
      if (currentDrawing && currentSnapshot) {
        persistDrawing(currentDrawing, currentSnapshot);
      }

      const target = drawings[targetIdx];
      if (target?.snapshotData) {
        wb.loadScene(target.snapshotData);
      } else {
        wb.resetScene();
      }
      setActiveDrawingIdx(targetIdx);
      lastAutoSave.current = null;
    },
    [activeDrawingIdx, drawings, persistDrawing],
  );

  const addNewDrawing = useCallback(() => {
    const wb = whiteboardRef.current;
    if (!wb) return;

    // Save current canvas to state and persist to backend
    const currentSnapshot = wb.getSnapshotData();
    const currentDrawing = drawings[activeDrawingIdx];
    setDrawings((prev) => {
      const updated = prev.map((d, i) =>
        i === activeDrawingIdx ? { ...d, snapshotData: currentSnapshot } : d,
      );
      return [...updated, {
        id: crypto.randomUUID(),
        label: `Drawing ${updated.length + 1}`,
        snapshotData: null,
      }];
    });
    if (currentDrawing && currentSnapshot) {
      persistDrawing(currentDrawing, currentSnapshot);
    }

    wb.resetScene();
    setActiveDrawingIdx(drawings.length);
    lastAutoSave.current = null;
  }, [activeDrawingIdx, drawings, persistDrawing]);

  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);

  const renameDrawing = useCallback((drawingId: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    setDrawings((prev) => prev.map((d) => (d.id === drawingId ? { ...d, label: trimmed } : d)));
    setEditingDrawingId(null);
  }, []);

  const deleteDrawing = useCallback(
    (idx: number) => {
      if (drawings.length <= 1) return;

      const drawing = drawings[idx];

      if (!window.confirm(`Delete "${drawing.label}"? This cannot be undone.`)) return;

      fetch("/api/trpc/session.deleteWhiteboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { sessionId, drawingId: drawing.id } }),
      }).catch((err) => console.error("[chat] Failed to delete whiteboard:", err));

      setDrawings((prev) => prev.filter((_, i) => i !== idx));

      if (idx === activeDrawingIdx) {
        const newIdx = Math.min(idx, drawings.length - 2);
        setActiveDrawingIdx(newIdx);
        const target = drawings.filter((_, i) => i !== idx)[newIdx];
        const wb = whiteboardRef.current;
        if (wb) {
          if (target?.snapshotData) wb.loadScene(target.snapshotData);
          else wb.resetScene();
        }
      } else if (idx < activeDrawingIdx) {
        setActiveDrawingIdx((prev) => prev - 1);
      }
      lastAutoSave.current = null;
    },
    [drawings, activeDrawingIdx, sessionId],
  );

  // ── Save status tracking (whiteboard) ─────────────────────────
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("saved");

  const handleWhiteboardDirty = useCallback(() => {
    setSaveStatus("idle");
  }, []);

  const handleManualSave = useCallback(async () => {
    const wb = whiteboardRef.current;
    if (!wb || !wb.hasContent()) return;

    const drawing = drawings[activeDrawingIdx];
    if (!drawing) return;

    setSaveStatus("saving");
    const snapshotData = wb.getSnapshotData();
    const imageDataUrl = await wb.getImageDataUrl();
    if (snapshotData) {
      setDrawings((prev) =>
        prev.map((d, i) => (i === activeDrawingIdx ? { ...d, snapshotData } : d)),
      );
      await persistDrawing(drawing, snapshotData, imageDataUrl ?? undefined);
    }
    setSaveStatus("saved");
  }, [drawings, activeDrawingIdx, persistDrawing]);

  // ── Code snippet persistence ────────────────────────────────────
  const persistCodeSnippet = useCallback(
    async (snippet: { id: string; label: string }, snapshotData: string) => {
      try {
        await fetch("/api/trpc/session.saveCode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            json: {
              sessionId,
              snippetId: snippet.id,
              label: snippet.label,
              snapshotData,
            },
          }),
        });
      } catch (err) {
        console.error("[chat] Failed to save code:", err);
      }
    },
    [sessionId],
  );

  const saveAllCodeSnippets = useCallback(async () => {
    const ce = codeEditorRef.current;
    if (!ce) return;

    const currentSnapshot = ce.getSnapshotData();
    const updatedSnippets = codeSnippets.map((s, i) =>
      i === activeSnippetIdx && currentSnapshot ? { ...s, snapshotData: currentSnapshot } : s,
    );

    await Promise.all(
      updatedSnippets
        .filter((s) => s.snapshotData)
        .map((snippet) => persistCodeSnippet(snippet, snippet.snapshotData!))
    );
  }, [codeSnippets, activeSnippetIdx, persistCodeSnippet]);

  const lastCodeAutoSave = useRef<string | null>(null);
  const handleCodeAutoSave = useCallback(
    async (snapshotData: string) => {
      if (snapshotData === lastCodeAutoSave.current) return;
      lastCodeAutoSave.current = snapshotData;

      const snippet = codeSnippets[activeSnippetIdx];
      if (!snippet) return;

      setCodeSnippets((prev) =>
        prev.map((s, i) => (i === activeSnippetIdx ? { ...s, snapshotData } : s)),
      );

      await persistCodeSnippet(snippet, snapshotData);
      setCodeSaveStatus("saved");
    },
    [codeSnippets, activeSnippetIdx, persistCodeSnippet],
  );

  // ── Code snippet management ─────────────────────────────────────
  const switchCodeSnippet = useCallback(
    (targetIdx: number) => {
      if (targetIdx === activeSnippetIdx) return;
      const ce = codeEditorRef.current;
      if (!ce) return;

      const currentSnapshot = ce.getSnapshotData();
      const currentSnippet = codeSnippets[activeSnippetIdx];
      setCodeSnippets((prev) =>
        prev.map((s, i) => (i === activeSnippetIdx ? { ...s, snapshotData: currentSnapshot } : s)),
      );
      if (currentSnippet && currentSnapshot) {
        persistCodeSnippet(currentSnippet, currentSnapshot);
      }

      const target = codeSnippets[targetIdx];
      if (target?.snapshotData) {
        ce.loadScene(target.snapshotData);
      } else {
        ce.resetScene();
      }
      setActiveSnippetIdx(targetIdx);
      lastCodeAutoSave.current = null;
    },
    [activeSnippetIdx, codeSnippets, persistCodeSnippet],
  );

  const addNewCodeSnippet = useCallback(() => {
    const ce = codeEditorRef.current;
    if (!ce) return;

    const currentSnapshot = ce.getSnapshotData();
    const currentSnippet = codeSnippets[activeSnippetIdx];
    setCodeSnippets((prev) => {
      const updated = prev.map((s, i) =>
        i === activeSnippetIdx ? { ...s, snapshotData: currentSnapshot } : s,
      );
      return [...updated, {
        id: crypto.randomUUID(),
        label: `Snippet ${updated.length + 1}`,
        snapshotData: null,
      }];
    });
    if (currentSnippet && currentSnapshot) {
      persistCodeSnippet(currentSnippet, currentSnapshot);
    }

    ce.resetScene();
    setActiveSnippetIdx(codeSnippets.length);
    lastCodeAutoSave.current = null;
  }, [activeSnippetIdx, codeSnippets, persistCodeSnippet]);

  const [editingSnippetId, setEditingSnippetId] = useState<string | null>(null);

  const renameCodeSnippet = useCallback((snippetId: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    setCodeSnippets((prev) => prev.map((s) => (s.id === snippetId ? { ...s, label: trimmed } : s)));
    setEditingSnippetId(null);
  }, []);

  const deleteCodeSnippet = useCallback(
    (idx: number) => {
      if (codeSnippets.length <= 1) return;

      const snippet = codeSnippets[idx];
      if (!window.confirm(`Delete "${snippet.label}"? This cannot be undone.`)) return;

      fetch("/api/trpc/session.deleteCode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { sessionId, snippetId: snippet.id } }),
      }).catch((err) => console.error("[chat] Failed to delete code:", err));

      setCodeSnippets((prev) => prev.filter((_, i) => i !== idx));

      if (idx === activeSnippetIdx) {
        const newIdx = Math.min(idx, codeSnippets.length - 2);
        setActiveSnippetIdx(newIdx);
        const target = codeSnippets.filter((_, i) => i !== idx)[newIdx];
        const ce = codeEditorRef.current;
        if (ce) {
          if (target?.snapshotData) ce.loadScene(target.snapshotData);
          else ce.resetScene();
        }
      } else if (idx < activeSnippetIdx) {
        setActiveSnippetIdx((prev) => prev - 1);
      }
      lastCodeAutoSave.current = null;
    },
    [codeSnippets, activeSnippetIdx, sessionId],
  );

  // ── Code save status tracking ───────────────────────────────────
  const [codeSaveStatus, setCodeSaveStatus] = useState<"idle" | "saving" | "saved">("saved");

  const handleCodeDirty = useCallback(() => {
    setCodeSaveStatus("idle");
  }, []);

  const handleCodeManualSave = useCallback(async () => {
    const ce = codeEditorRef.current;
    if (!ce || !ce.hasContent()) return;

    const snippet = codeSnippets[activeSnippetIdx];
    if (!snippet) return;

    setCodeSaveStatus("saving");
    const snapshotData = ce.getSnapshotData();
    if (snapshotData) {
      setCodeSnippets((prev) =>
        prev.map((s, i) => (i === activeSnippetIdx ? { ...s, snapshotData } : s)),
      );
      await persistCodeSnippet(snippet, snapshotData);
    }
    setCodeSaveStatus("saved");
  }, [codeSnippets, activeSnippetIdx, persistCodeSnippet]);

  async function getAIResponse(
    conversationHistory: Message[],
    questionIndex = currentQuestion,
    options?: { ignoreQuestionAdvance?: boolean },
  ) {
    setAiTyping(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          interviewId: interview.id,
          messages: conversationHistory.map((m) => ({
            role:
              m.role === "ASSISTANT"
                ? "assistant"
                : "user",
            content: m.content,
          })),
          currentQuestionIndex: questionIndex,
          manualNavigation: options?.ignoreQuestionAdvance ?? false,
        }),
      });

      if (!response.ok) {
        console.error("AI response error:", response.status);
        return;
      }

      const data = await response.json();
      const aiContent: string = data.content;
      if (!aiContent?.trim()) return;

      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: "ASSISTANT",
        content: aiContent,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiMessage]);

      if (!options?.ignoreQuestionAdvance && data.questionAdvanced) {
        setCurrentQuestion((prev) =>
          Math.min(prev + 1, interview.questions.length)
        );
      }

      // Check for interview completion signal
      if (data.isComplete) {
        // Save all whiteboard drawings and code snippets before completing
        await Promise.all([saveAllDrawings(), saveAllCodeSnippets()]);

        await fetch(`/api/trpc/session.complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ json: { id: sessionId } }),
        });

        setTimeout(onComplete, 2000);
      }
    } catch (error) {
      console.error("AI response error:", error);
    } finally {
      setAiTyping(false);
    }
  }

  // ── Auto-end when timer expires ──────────────────────────────────
  useEffect(() => {
    if (remainingSeconds !== 0 || timerExpiredRef.current) return;
    timerExpiredRef.current = true;

    (async () => {
      await Promise.all([saveAllDrawings(), saveAllCodeSnippets()]);
      await fetch(`/api/trpc/session.complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { id: sessionId } }),
      });
      onComplete();
    })();
  }, [remainingSeconds, saveAllDrawings, saveAllCodeSnippets, sessionId, onComplete]);

  const handleFinishInterview = useCallback(async () => {
    if (preview || finishing) return;
    setFinishing(true);
    try {
      await Promise.all([saveAllDrawings(), saveAllCodeSnippets()]);
      await fetch(`/api/trpc/session.complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { id: sessionId } }),
      });
      setFinishDialogOpen(false);
      onComplete();
    } finally {
      setFinishing(false);
    }
  }, [preview, finishing, saveAllDrawings, saveAllCodeSnippets, sessionId, onComplete]);

  async function handleQuestionTransition(direction: "next" | "previous") {
    if (preview || sending || aiTyping) return;

    const targetIdx =
      direction === "next" ? currentQuestion + 1 : currentQuestion - 1;
    if (
      targetIdx < 0 ||
      targetIdx >= interview.questions.length ||
      (direction === "next" && currentQuestion >= interview.questions.length - 1) ||
      (direction === "previous" && currentQuestion <= 0)
    ) {
      return;
    }

    const targetQuestionId = interview.questions[targetIdx]?.id;
    const transitionContent =
      direction === "previous"
        ? CHAT_PREVIOUS_TRANSITION
        : CHAT_NEXT_TRANSITION;

    setCurrentQuestion(targetIdx);

    if (targetQuestionId) {
      fetch("/api/trpc/session.updateCurrentQuestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          json: { sessionId, questionId: targetQuestionId },
        }),
      }).catch(() => {});
    }

    const transitionMsg: Message = {
      id: crypto.randomUUID(),
      role: "SYSTEM",
      content: transitionContent,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, transitionMsg];
    setMessages(updatedMessages);
    setSending(true);

    try {
      await fetch("/api/trpc/session.sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          json: {
            sessionId,
            content: transitionContent,
            questionId: targetQuestionId,
            internal: true,
          },
        }),
      });

      await getAIResponse(updatedMessages, targetIdx, {
        ignoreQuestionAdvance: true,
      });
    } catch (error) {
      console.error("Question transition error:", error);
    } finally {
      setSending(false);
    }
  }

  function handleNextQuestion() {
    void handleQuestionTransition("next");
  }

  function handlePreviousQuestion() {
    void handleQuestionTransition("previous");
  }

  async function handleSend() {
    if (preview || !input.trim() || sending) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "USER",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setSending(true);

    try {
      // Save user message to server
      const sendRes = await fetch("/api/trpc/session.sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          json: {
            sessionId,
            content: userMessage.content,
            questionId: interview.questions[currentQuestion]?.id,
          },
        }),
      });

      if (!sendRes.ok) {
        const body = await sendRes.json().catch(() => ({}));
        const errMsg = body?.error?.json?.message ?? body?.error?.message ?? "";
        if (errMsg.includes("session time has been reached") || (body?.error?.json?.data?.code === "FORBIDDEN" && errMsg.includes("time"))) {
          setSending(false);
          onComplete("TIME_LIMIT_EXCEEDED");
          return;
        }
      }

      // Get AI response
      await getAIResponse(updatedMessages);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  const progress =
    interview.questions.length > 0
      ? ((currentQuestion + 1) / interview.questions.length) * 100
      : 0;

  const formatTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };
  const isTimeLow = remainingSeconds !== null && remainingSeconds <= 60;

  // ── Reusable sub-components ────────────────────────────────────

  /** Snippet tabs + save button for the code editor panel */
  const renderCodeSnippetTabs = () => (
    <div className="flex items-center gap-1 border-b bg-card px-3 py-1.5">
      {codeSnippets.map((s, i) => (
        <div
          key={s.id}
          className={`group flex items-center gap-0.5 rounded-md text-xs font-medium transition-colors ${
            i === activeSnippetIdx
              ? "bg-primary text-primary-foreground"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          }`}
        >
          {editingSnippetId === s.id ? (
            <input
              autoFocus
              defaultValue={s.label}
              className="w-20 rounded bg-transparent px-2 py-1 text-xs outline-none ring-1 ring-primary"
              onBlur={(e) => renameCodeSnippet(s.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") renameCodeSnippet(s.id, e.currentTarget.value);
                if (e.key === "Escape") setEditingSnippetId(null);
              }}
            />
          ) : (
            <button
              className="px-2.5 py-1"
              onClick={() => switchCodeSnippet(i)}
              onDoubleClick={() => setEditingSnippetId(s.id)}
              title="Double-click to rename"
            >
              {s.label}
            </button>
          )}
          {codeSnippets.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); deleteCodeSnippet(i); }}
              className={`mr-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
                i === activeSnippetIdx
                  ? "hover:bg-primary-foreground/20"
                  : "hover:bg-muted-foreground/20"
              }`}
              title="Delete snippet"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={addNewCodeSnippet}
        className="flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
        title="New snippet"
      >
        <Plus className="h-3 w-3" />
        New
      </button>
      <div className="ml-auto">
        <button
          onClick={handleCodeManualSave}
          disabled={codeSaveStatus === "saving"}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            codeSaveStatus === "saved"
              ? "text-secondary-600 dark:text-secondary-400"
              : "text-muted-foreground hover:bg-muted"
          }`}
          title="Save snippet"
        >
          {codeSaveStatus === "saving" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : codeSaveStatus === "saved" ? (
            <Check className="h-3 w-3" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          {codeSaveStatus === "saved" ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );

  const previewMessages: Message[] = preview ? [
    { id: "p-1", role: "ASSISTANT", content: `Hi! I'm ${interview.aiName}. Let's start — ${interview.questions[0]?.text ?? "tell me about yourself."}`, timestamp: "" },
    { id: "p-2", role: "USER", content: "Sure, I have been working as a software engineer for...", timestamp: "" },
  ] : [];
  const displayMessages = (preview ? previewMessages : messages).filter(
    (m) => m.role !== "SYSTEM",
  );

  const composerQuestionNav = {
    onPrevious: handlePreviousQuestion,
    onNext: handleNextQuestion,
    canPrevious: currentQuestion > 0,
    canNext: currentQuestion < interview.questions.length - 1,
    disabled: sending || aiTyping || preview || finishing,
  };

  const composerSessionTools = {
    whiteboardOpen,
    onToggleWhiteboard: toggleWhiteboard,
    codeOpen: codeEditorOpen,
    onToggleCode: toggleCodeEditor,
    disabled: sending || aiTyping || preview || finishing,
  };

  const composerSessionActions = {
    onFinish: () => setFinishDialogOpen(true),
    finishDisabled: sending || aiTyping || preview,
    finishLoading: finishing,
  };

  const composerTimer =
    remainingSeconds !== null ? (
      <div
        className={cn(
          "flex items-center gap-1.5 px-1 text-xs font-medium tabular-nums",
          isTimeLow ? "text-destructive" : "text-muted-foreground",
        )}
      >
        <Clock className="h-3.5 w-3.5" />
        <span>{formatTime(remainingSeconds)} left</span>
      </div>
    ) : null;

  const renderSessionHeader = (fullWidth = false) => (
    <div className="shrink-0 border-b bg-card py-2 md:py-3">
      <div
        className={cn(
          fullWidth ? "px-3 md:px-6" : "mx-auto w-full max-w-3xl px-4",
        )}
      >
        <div className="flex items-center justify-between">
          <div className="mr-2 min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold md:text-base">
              {interview.title}
            </h1>
            <p className="hidden text-xs text-muted-foreground md:block">
              Chat Interview with {interview.aiName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <IntervieweeHelpPopover mode="chat" />
          </div>
        </div>
        <div
          className="mt-2 flex items-center gap-3"
          data-tour="chat-progress"
        >
          <Progress value={progress} className="h-1.5 flex-1" />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            Q{Math.min(currentQuestion + 1, interview.questions.length)} /{" "}
            {interview.questions.length}
          </span>
        </div>
        {currentQ?.text && (
          <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">
            {currentQ.text}
          </p>
        )}
      </div>
    </div>
  );

  const renderFinishDialog = () => (
    <AlertDialog open={finishDialogOpen} onOpenChange={setFinishDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Finish interview?</AlertDialogTitle>
          <AlertDialogDescription>
            Your responses will be saved and submitted. You won&apos;t be able to
            continue this session afterward.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={finishing}>Keep going</AlertDialogCancel>
          <AlertDialogAction
            disabled={finishing}
            onClick={(event) => {
              event.preventDefault();
              void handleFinishInterview();
            }}
          >
            {finishing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Finish interview"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const renderFloatingComposer = (compact = false) => (
    <div
      data-tour="chat-input"
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/95 to-transparent",
        compact ? "px-2 pb-2 pt-6" : "px-4 pb-4 pt-10",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto",
          compact ? "" : "mx-auto max-w-3xl",
        )}
      >
        <ChatComposer
          value={input}
          onChange={setInput}
          onSubmit={() => void handleSend()}
          onStop={() => {
            setSending(false);
            setAiTyping(false);
          }}
          isGenerating={sending || aiTyping}
          disabled={preview}
          submitDisabled={preview || !input.trim()}
          placeholder="Type your response..."
          compact={compact}
          textareaRef={inputRef}
          questionNav={composerQuestionNav}
          sessionTools={composerSessionTools}
          sessionActions={composerSessionActions}
          footerLeft={composerTimer}
          className="border bg-card/95 shadow-lg backdrop-blur-sm"
        />
      </div>
    </div>
  );

  /** Messages list (shared between normal and coding layouts) */
  const renderMessages = (compact = false) => (
    <div
      data-tour="chat-question"
      className="flex-1 overflow-y-auto code-scrollbar"
      ref={scrollRef}
    >
      <div
        className={
          compact
            ? "space-y-3 p-3 pb-28"
            : "mx-auto max-w-3xl space-y-4 p-4 pb-36"
        }
      >
        {displayMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "USER" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`${compact ? "max-w-[90%]" : "max-w-[80%]"} rounded-2xl px-4 py-3 ${
                msg.role === "USER"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              <p className={`whitespace-pre-wrap ${compact ? "text-xs" : "text-sm"}`}>{msg.content}</p>
            </div>
          </div>
        ))}
        {(aiTyping || sending) && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-muted px-4 py-3">
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── CODING / WHITEBOARD question: split layout with problem panel ──
  if (isCodingQuestion || isWhiteboardQuestion) {
    const rightPanelIsWhiteboard = whiteboardOpen;

    return (
      <div className="flex h-screen flex-col bg-background">
        {renderSessionHeader(true)}
        {renderFinishDialog()}

        {/* Split view: side-by-side on desktop, stacked on mobile */}
        <div ref={splitContainerRef} className={isMobile ? "flex flex-1 flex-col overflow-hidden" : "flex flex-1 overflow-hidden"}>
          {/* Left panel — question description + chat */}
          <div
            className={`flex min-w-0 shrink-0 flex-col overflow-x-hidden ${isMobile ? "max-h-[45vh] border-b" : ""}`}
            style={isMobile ? undefined : { width: `${splitPercent}%`, minWidth: 260 }}
          >
            <div
              ref={problemChatContainerRef}
              className="flex min-h-0 flex-1 flex-col"
            >
              {/* Question description */}
              <div
                className="min-h-0 overflow-y-auto p-4 code-scrollbar"
                style={{ flex: `0 0 ${problemChatSplitPercent}%` }}
              >
                <div className="mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Problem
                  </span>
                </div>
                <h2 className="mb-3 text-base font-semibold leading-snug">{currentQ?.text}</h2>
                {currentQ?.description && (
                  <p className="mb-3 whitespace-pre-wrap text-sm text-muted-foreground">{currentQ.description}</p>
                )}
                {isCodingQuestion && currentQ?.starterCode?.code && (
                  <div className="overflow-hidden rounded-md border bg-zinc-950">
                    <div className="flex items-center gap-1.5 border-b border-zinc-800 bg-zinc-900 px-3 py-1.5">
                      <Code2 className="h-3 w-3 text-zinc-400" />
                      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                        Starter Code — {currentQ.starterCode.language}
                      </span>
                    </div>
                    <CodeBlock code={currentQ.starterCode.code} language={currentQ.starterCode.language} className="max-h-48" />
                  </div>
                )}
              </div>

              <div
                className="group flex h-1 shrink-0 cursor-row-resize touch-none items-center justify-center border-y border-border bg-muted/30 transition-colors hover:bg-primary/10 active:bg-primary/20"
                onPointerDown={handleProblemChatSplitMouseDown}
              />

              {/* Chat panel */}
              <div className="relative flex min-h-0 flex-1 flex-col">
                <div className="flex items-center gap-1.5 border-b bg-card px-3 py-1.5">
                  <MessageCircle className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Chat</span>
                </div>
                {renderMessages(true)}
                {renderFloatingComposer(true)}
              </div>
            </div>
          </div>

          {/* Draggable divider (desktop only) */}
          {!isMobile && (
            <div
              className="group flex w-1 cursor-col-resize touch-none items-center justify-center border-l border-r border-border bg-muted/30 transition-colors hover:bg-primary/10 active:bg-primary/20"
              onPointerDown={handleSplitMouseDown}
            />
          )}

          {/* Right panel — code editor or whiteboard (mutually exclusive) */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {!rightPanelIsWhiteboard ? (
              <>
                {renderCodeSnippetTabs()}
                <div className="flex-1">
                  <CodeEditorCanvas
                    ref={codeEditorRef}
                    fillParent
                    dark={isDark}
                    onAutoSave={handleCodeAutoSave}
                    autoSaveInterval={5000}
                    onDirty={handleCodeDirty}
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col">
                <div className="flex items-center gap-1 border-b bg-card px-2 py-1">
                  {drawings.map((d, i) => (
                    <div
                      key={d.id}
                      className={`group flex items-center gap-0.5 rounded-md text-xs font-medium transition-colors ${
                        i === activeDrawingIdx
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {editingDrawingId === d.id ? (
                        <input
                          autoFocus
                          defaultValue={d.label}
                          className="w-20 rounded bg-transparent px-2 py-1 text-xs outline-none ring-1 ring-primary"
                          onBlur={(e) => renameDrawing(d.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") renameDrawing(d.id, e.currentTarget.value);
                            if (e.key === "Escape") setEditingDrawingId(null);
                          }}
                        />
                      ) : (
                        <button
                          className="px-2.5 py-1"
                          onClick={() => switchDrawing(i)}
                          onDoubleClick={() => setEditingDrawingId(d.id)}
                          title="Double-click to rename"
                        >
                          {d.label}
                        </button>
                      )}
                      {drawings.length > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteDrawing(i); }}
                          className={`mr-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
                            i === activeDrawingIdx
                              ? "hover:bg-primary-foreground/20"
                              : "hover:bg-muted-foreground/20"
                          }`}
                          title="Delete drawing"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addNewDrawing}
                    className="flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                    title="New drawing"
                  >
                    <Plus className="h-3 w-3" />
                    New
                  </button>
                  <div className="ml-auto">
                    <button
                      onClick={handleManualSave}
                      disabled={saveStatus === "saving"}
                      className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        saveStatus === "saved"
                          ? "text-secondary-600 dark:text-secondary-400"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                      title="Save drawing"
                    >
                      {saveStatus === "saving" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : saveStatus === "saved" ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Save className="h-3 w-3" />
                      )}
                      {saveStatus === "saved" ? "Saved" : "Save"}
                    </button>
                  </div>
                </div>
                <div className="flex-1">
                  <WhiteboardCanvas
                    ref={whiteboardRef}
                    fillParent
                    dark={isDark}
                    onAutoSave={handleWhiteboardAutoSave}
                    autoSaveInterval={5000}
                    onDirty={handleWhiteboardDirty}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Normal (non-coding) layout ────────────────────────────────
  const toolPanelOpen = whiteboardOpen || codeEditorOpen;

  return (
    <div className="flex h-screen flex-col bg-background">
      {renderSessionHeader(toolPanelOpen)}
      {renderFinishDialog()}

      {/* Messages + floating composer (+ optional tool side panel) */}
      <div
        ref={toolSplitContainerRef}
        className={cn(
          "flex min-h-0 flex-1 overflow-hidden",
          isMobile && (whiteboardOpen || codeEditorOpen) && "flex-col",
        )}
      >
        <div className="relative flex min-w-0 flex-1 flex-col">
          {renderMessages()}
          {renderFloatingComposer()}
        </div>

        {(whiteboardOpen || codeEditorOpen) && (
          <>
            {!isMobile ? (
              <div
                className="group flex w-1 shrink-0 cursor-col-resize touch-none items-center justify-center border-l border-r border-border bg-muted/30 transition-colors hover:bg-primary/10 active:bg-primary/20"
                onPointerDown={handleToolSplitMouseDown}
              />
            ) : (
              <div className="h-px shrink-0 bg-border" />
            )}
            <div
              className={cn(
                "flex min-h-0 min-w-0 flex-col overflow-hidden bg-card",
                isMobile ? "h-[45vh] border-t" : "shrink-0 border-l",
              )}
              style={isMobile ? undefined : { width: `${toolSplitPercent}%`, minWidth: 280 }}
            >
              {whiteboardOpen ? (
                <>
                  <div className="flex items-center gap-1 border-b px-2 py-1">
                    {drawings.map((d, i) => (
                      <div
                        key={d.id}
                        className={`group flex items-center gap-0.5 rounded-md text-xs font-medium transition-colors ${
                          i === activeDrawingIdx
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {editingDrawingId === d.id ? (
                          <input
                            autoFocus
                            defaultValue={d.label}
                            className="w-20 rounded bg-transparent px-2 py-1 text-xs outline-none ring-1 ring-primary"
                            onBlur={(e) => renameDrawing(d.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") renameDrawing(d.id, e.currentTarget.value);
                              if (e.key === "Escape") setEditingDrawingId(null);
                            }}
                          />
                        ) : (
                          <button
                            className="px-2.5 py-1"
                            onClick={() => switchDrawing(i)}
                            onDoubleClick={() => setEditingDrawingId(d.id)}
                            title="Double-click to rename"
                          >
                            {d.label}
                          </button>
                        )}
                        {drawings.length > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteDrawing(i); }}
                            className={`mr-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
                              i === activeDrawingIdx
                                ? "hover:bg-primary-foreground/20"
                                : "hover:bg-muted-foreground/20"
                            }`}
                            title="Delete drawing"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={addNewDrawing}
                      className="flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                      title="New drawing"
                    >
                      <Plus className="h-3 w-3" />
                      New
                    </button>
                    <div className="ml-auto">
                      <button
                        onClick={handleManualSave}
                        disabled={saveStatus === "saving"}
                        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          saveStatus === "saved"
                            ? "text-secondary-600 dark:text-secondary-400"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                        title="Save drawing"
                      >
                        {saveStatus === "saving" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : saveStatus === "saved" ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Save className="h-3 w-3" />
                        )}
                        {saveStatus === "saved" ? "Saved" : "Save"}
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1">
                    <WhiteboardCanvas
                      ref={whiteboardRef}
                      fillParent
                      dark={isDark}
                      onAutoSave={handleWhiteboardAutoSave}
                      autoSaveInterval={5000}
                      onDirty={handleWhiteboardDirty}
                    />
                  </div>
                </>
              ) : (
                <>
                  {renderCodeSnippetTabs()}
                  <div className="min-h-0 flex-1">
                    <CodeEditorCanvas
                      ref={codeEditorRef}
                      fillParent
                      dark={isDark}
                      onAutoSave={handleCodeAutoSave}
                      autoSaveInterval={5000}
                      onDirty={handleCodeDirty}
                    />
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
