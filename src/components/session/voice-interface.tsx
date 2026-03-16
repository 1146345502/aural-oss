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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import {
    WhiteboardCanvas,
    type WhiteboardCanvasRef,
} from "@/components/whiteboard/whiteboard-canvas";
import { useInterviewRecording } from "@/hooks/use-interview-recording";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useVoice, type InterviewContext } from "@/hooks/use-voice";
import {
    AlertCircle,
    Check,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    Clock,
    Code2,
    FileText,
    Loader2,
    MessageSquare,
    Mic,
    MicOff,
    PenLine,
    PhoneOff,
    Plus,
    Save,
    Send,
    SkipBack,
    SkipForward,
    Video,
    Volume2,
    X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  source?: "voice" | "chat";
}
function normalizeTranscript(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasRecentAssistantTranscript(messages: Message[], text: string): boolean {
  const normalized = normalizeTranscript(text);
  if (!normalized) return false;

  for (let i = messages.length - 1; i >= Math.max(0, messages.length - 6); i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    if (normalizeTranscript(message.content) === normalized) return true;
  }

  return false;
}

function isExpandedTranscript(previous: string, next: string): boolean {
  const prev = normalizeTranscript(previous);
  const curr = normalizeTranscript(next);
  if (!prev || !curr || prev === curr) return false;
  if (curr.length <= prev.length) return false;
  if (curr.includes(prev)) return true;

  const maxPrefix = Math.min(prev.length, curr.length);
  let prefixLen = 0;
  while (prefixLen < maxPrefix && prev[prefixLen] === curr[prefixLen]) {
    prefixLen++;
  }

  return prefixLen >= Math.min(24, Math.floor(prev.length * 0.7));
}

function looksLikeInterviewFarewell(text: string): boolean {
  const normalized = normalizeTranscript(text);
  if (!normalized || /[?？]/.test(normalized)) return false;

  return [
    /\bgood\s*bye\b/,
    /\bgoodbye\b/,
    /\bbye for now\b/,
    /\bhave a great day\b/,
    /\btake care\b/,
    /\bwrap up here\b/,
    /\bthat'?s all for now\b/,
    /\bthank(?:s| you)(?: so much)? for your time\b/,
    /\bi wish you all the best\b/,
    /\bbest moving forward\b/,
    /\bthat wraps up\b/,
    /\bwraps up our\b/,
    /\bbest in your .*journey\b/,
    /再见/,
    /保重/,
    /祝你/,
  ].some((pattern) => pattern.test(normalized));
}

function isBriefStandaloneVoiceUtterance(text: string): boolean {
  const normalized = normalizeTranscript(text);
  if (!normalized) return false;
  const words = normalized.split(" ").filter(Boolean);
  return words.length <= 3 && normalized.length <= 16;
}

function findRecentVoiceTranscriptMatch(
  messages: Message[],
  nextText: string,
): { kind: "expanded" | "duplicate"; index: number } | null {
  const nextNormalized = normalizeTranscript(nextText);
  const nextIsBriefStandalone = isBriefStandaloneVoiceUtterance(nextText);
  if (!nextNormalized) return null;

  for (let i = messages.length - 1; i >= Math.max(0, messages.length - 8); i--) {
    const message = messages[i];
    if (message.role !== "user" || message.source !== "voice") continue;
    const existingNormalized = normalizeTranscript(message.content);
    const existingIsBriefStandalone = isBriefStandaloneVoiceUtterance(message.content);
    if (!existingNormalized) continue;
    if (existingNormalized === nextNormalized) {
      return { kind: "duplicate", index: i };
    }
    if (nextIsBriefStandalone || existingIsBriefStandalone) {
      continue;
    }
    if (
      nextNormalized.includes(existingNormalized) ||
      existingNormalized.includes(nextNormalized)
    ) {
      return {
        kind: nextNormalized.length >= existingNormalized.length ? "expanded" : "duplicate",
        index: i,
      };
    }
    if (isExpandedTranscript(message.content, nextText)) {
      return { kind: "expanded", index: i };
    }
  }

  return null;
}

function findTrailingVoiceDuplicateCluster(
  messages: Message[],
  nextText: string,
): { start: number; end: number } | null {
  const nextNormalized = normalizeTranscript(nextText);
  if (!nextNormalized || isBriefStandaloneVoiceUtterance(nextText)) return null;

  let start = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user" || message.source !== "voice") break;
    if (isBriefStandaloneVoiceUtterance(message.content)) return null;
    start = i;
  }

  if (start >= messages.length || messages.length - start < 2) return null;

  for (let i = start; i < messages.length; i++) {
    const candidate = normalizeTranscript(messages[i].content);
    if (!candidate) return null;
    if (!nextNormalized.includes(candidate)) return null;
  }

  return { start, end: messages.length - 1 };
}

function upsertFinalVoiceTranscript(messages: Message[], text: string): Message[] {
  const nextMessage = {
    id: crypto.randomUUID(),
    role: "user" as const,
    content: text,
    source: "voice" as const,
  };

  const duplicateCluster = findTrailingVoiceDuplicateCluster(messages, text);
  if (duplicateCluster) {
    return [...messages.slice(0, duplicateCluster.start), nextMessage];
  }

  const recentMatch = findRecentVoiceTranscriptMatch(messages, text);
  if (recentMatch?.kind === "duplicate") {
    const prior = messages[recentMatch.index];
    const replacement =
      text.length > prior.content.length ? { ...prior, content: text } : prior;
    return [
      ...messages.slice(0, recentMatch.index),
      replacement,
      ...messages.slice(recentMatch.index + 1),
    ];
  }

  if (recentMatch?.kind === "expanded") {
    const prior = messages[recentMatch.index];
    const replacement =
      text.length >= prior.content.length
        ? { ...prior, content: text }
        : prior;
    return [
      ...messages.slice(0, recentMatch.index),
      replacement,
      ...messages.slice(recentMatch.index + 1),
    ];
  }

  const last = messages[messages.length - 1];
  if (last?.role === "user" && last.source === "voice") {
    if (
      !isBriefStandaloneVoiceUtterance(last.content) &&
      !isBriefStandaloneVoiceUtterance(text) &&
      isExpandedTranscript(last.content, text)
    ) {
      const replacement =
        text.length >= last.content.length ? nextMessage : { ...last };
      return [...messages.slice(0, -1), replacement];
    }
  }

  const assistantIdx = messages.length - 1;
  const priorUserIdx = messages.length - 2;
  if (
    assistantIdx >= 0 &&
    priorUserIdx >= 0 &&
    messages[assistantIdx]?.role === "assistant" &&
    messages[priorUserIdx]?.role === "user" &&
    messages[priorUserIdx]?.source === "voice" &&
    !isBriefStandaloneVoiceUtterance(messages[priorUserIdx].content) &&
    !isBriefStandaloneVoiceUtterance(text) &&
    isExpandedTranscript(messages[priorUserIdx].content, text)
  ) {
    const replacement =
      text.length >= messages[priorUserIdx].content.length
        ? { ...messages[priorUserIdx], content: text }
        : messages[priorUserIdx];
    return [
      ...messages.slice(0, priorUserIdx),
      replacement,
      ...messages.slice(priorUserIdx + 1),
    ];
  }

  return [...messages, nextMessage];
}

function svgToPngDataUrl(svgDataUrl: string, maxWidth = 1024): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) { resolve(null); return; }
      ctx2d.fillStyle = "#fff";
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = svgDataUrl;
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

function DraggablePip({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const [pos, setPos] = useState({ right: 16, bottom: 64 });
  const [isDragging, setIsDragging] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    container.setPointerCapture(e.pointerId);
    dragState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.right,
      origY: pos.bottom,
    };
    setIsDragging(true);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.dragging) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPos({
      right: Math.max(0, dragState.current.origX - dx),
      bottom: Math.max(0, dragState.current.origY - dy),
    });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.dragging) return;
    dragState.current.dragging = false;
    containerRef.current?.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute z-40 overflow-hidden rounded-lg border bg-black shadow-lg select-none"
      style={{
        right: pos.right,
        bottom: pos.bottom,
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {children}
    </div>
  );
}

interface VoiceInterfaceProps {
  sessionId: string;
  interviewId: string;
  interviewTitle: string;
  aiName: string;
  questionCount: number;
  interviewContext: InterviewContext;
  durationMinutes?: number;
  initialMessages?: Array<{ id: string; role: string; content: string }>;
  initialDrawings?: Array<{ id: string; label: string; snapshotData: string }>;
  chatEnabled?: boolean;
  onComplete?: () => void;
  videoMode?: boolean;
  /** Render in static preview mode — shows full layout without connecting */
  preview?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────
const MIN_PANEL_WIDTH = 260;
const DEFAULT_RIGHT_WIDTH = 380;
const COLLAPSED_RIGHT_DOCK_WIDTH = 56;

export function VoiceInterface({
  sessionId,
  interviewId,
  interviewTitle,
  aiName,
  interviewContext,
  durationMinutes,
  initialMessages,
  initialDrawings,
  chatEnabled = false,
  onComplete,
  videoMode = false,
  preview = false,
}: VoiceInterfaceProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const isMobile = useIsMobile();

  const [messages, setMessages] = useState<Message[]>(
    () =>
      initialMessages?.map((m) => ({
        id: m.id,
        role: (m.role === "USER" ? "user" : "assistant") as "user" | "assistant",
        content: m.content,
      })) ?? [],
  );
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [locallyCompleted, setLocallyCompleted] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [isStartingInterview, setIsStartingInterview] = useState(false);
  const [desktopTranscriptCollapsed, setDesktopTranscriptCollapsed] = useState(false);
  const [mobileTranscriptCollapsed, setMobileTranscriptCollapsed] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [whiteboardActive, setWhiteboardActive] = useState(false);
  const [codeEditorActive, setCodeEditorActive] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [splitPercent, setSplitPercent] = useState(35);
  const splitDragging = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const voiceSplitContainerRef = useRef<HTMLDivElement>(null);
  const whiteboardRef = useRef<WhiteboardCanvasRef>(null);
  const codeEditorRef = useRef<CodeEditorCanvasRef>(null);
  const liveCodeSnapshotRef = useRef<string | null>(null);
  const lastFinalTranscriptRef = useRef("");
  const handleEndInterviewRef = useRef<() => void>(() => {});

  // ── Countdown timer state ────────────────────────────────────────
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const timerExpiredRef = useRef(false);
  const timerStartedRef = useRef(false);

  // ── Multiple drawings state ───────────────────────────────────
  interface Drawing {
    id: string;
    label: string;
    snapshotData: string | null;
  }
  const [drawings, setDrawings] = useState<Drawing[]>(
    () =>
      initialDrawings?.length
        ? initialDrawings.map((d) => ({
            id: d.id,
            label: d.label,
            snapshotData: d.snapshotData,
          }))
        : [{ id: crypto.randomUUID(), label: "Drawing 1", snapshotData: null }],
  );
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

  // ── Load saved whiteboard data when canvas first opens ────────
  const initialDrawingsLoadedRef = useRef(false);
  useEffect(() => {
    if (whiteboardActive && !initialDrawingsLoadedRef.current) {
      initialDrawingsLoadedRef.current = true;
      const activeDrawing = drawings[activeDrawingIdx];
      if (activeDrawing?.snapshotData) {
        // Small delay to let the Excalidraw canvas fully initialize
        const timer = setTimeout(() => {
          whiteboardRef.current?.loadScene(activeDrawing.snapshotData!);
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whiteboardActive]);

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
      const active = drawingsRef.current[activeDrawingIdxRef.current];
      if (active) {
        const wb = whiteboardRef.current;
        const snapshotData = wb?.getSnapshotData() ?? active.snapshotData;
        if (snapshotData) {
          const payload = { json: { sessionId, drawingId: active.id, label: active.label, snapshotData } };
          const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
          navigator.sendBeacon("/api/trpc/session.saveWhiteboard", blob);
        }
      }

      const activeSnippet = codeSnippetsRef.current[activeSnippetIdxRef.current];
      if (activeSnippet) {
        const ce = codeEditorRef.current;
        const codeSnapshot = ce?.getSnapshotData() ?? activeSnippet.snapshotData;
        if (codeSnapshot) {
          const payload = { json: { sessionId, snippetId: activeSnippet.id, label: activeSnippet.label, snapshotData: codeSnapshot } };
          const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
          navigator.sendBeacon("/api/trpc/session.saveCode", blob);
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [sessionId, preview]);

  // ── Draggable divider state (vertical — left/right panels) ──────
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // ── Draggable divider state (horizontal — transcript/chat) ─────
  const [chatSplitPercent, setChatSplitPercent] = useState(50);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const chatDragging = useRef(false);

  const onDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    dragging.current = true;

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newRight = rect.right - ev.clientX;
      setRightWidth(Math.max(MIN_PANEL_WIDTH, Math.min(newRight, rect.width - MIN_PANEL_WIDTH)));
    };

    const onUp = () => {
      dragging.current = false;
      target.releasePointerCapture?.(e.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const onChatDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    chatDragging.current = true;

    const onMove = (ev: PointerEvent) => {
      if (!chatDragging.current || !rightPanelRef.current) return;
      const rect = rightPanelRef.current.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setChatSplitPercent(Math.min(Math.max(pct, 20), 80));
    };

    const onUp = () => {
      chatDragging.current = false;
      target.releasePointerCapture?.(e.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  // ── Recording hook (video mode) ──────────────────────────────────
  const recording = useInterviewRecording({
    sessionId,
    enabled: videoMode,
  });

  const cameraPipRef = useRef<HTMLVideoElement>(null);

  // Bind camera stream to PIP video element
  useEffect(() => {
    const video = cameraPipRef.current;
    if (video && recording.cameraStream) {
      video.srcObject = recording.cameraStream;
      video.play().catch(() => {});
    }
    return () => {
      if (video) video.srcObject = null;
    };
  }, [recording.cameraStream]);

  // ── Voice hooks ─────────────────────────────────────────────────
  const handleTranscript = useCallback(
    (text: string, isFinal: boolean) => {
      if (isFinal && text.trim()) {
        const normalized = normalizeTranscript(text);
        if (normalized === lastFinalTranscriptRef.current) return;
        lastFinalTranscriptRef.current = normalized;
        setMessages((prev) => upsertFinalVoiceTranscript(prev, text));
      } else if (!isFinal && text.trim()) {
        lastFinalTranscriptRef.current = "";
      }
    },
    [],
  );

  const handleAIResponse = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => {
      if (hasRecentAssistantTranscript(prev, trimmed)) {
        return prev;
      }
      const last = prev[prev.length - 1];
      if (last?.role !== "assistant") {
        return [...prev, { id: crypto.randomUUID(), role: "assistant", content: trimmed, source: "voice" }];
      }
      const lastNorm = last.content.replace(/\s+/g, " ").trim();
      const newNorm = trimmed.replace(/\s+/g, " ").trim();
      if (lastNorm === newNorm) return prev;
      // Replace if new is superset (tts_ended has more than chat_ended)
      if (newNorm.startsWith(lastNorm) && newNorm.length > lastNorm.length) {
        return [...prev.slice(0, -1), { ...last, content: trimmed }];
      }
      return [...prev, { id: crypto.randomUUID(), role: "assistant", content: trimmed, source: "voice" }];
    });
  }, []);

  const handleError = useCallback((err: string) => {
    setError(err);
    setTimeout(() => setError(""), 5000);
  }, []);

  const voice = useVoice({
    interviewId,
    sessionId,
    interviewContext,
    onTranscript: handleTranscript,
    onAIResponse: handleAIResponse,
    onError: handleError,
    onTtsChunk: videoMode ? recording.addTtsChunk : undefined,
    onInterrupt: videoMode ? recording.cancelTts : undefined,
  });

  useEffect(() => {
    if (voice.isConnected) {
      setIsStartingInterview(false);
    }
  }, [voice.isConnected]);

  useEffect(() => {
    if (error) {
      setIsStartingInterview(false);
    }
  }, [error]);

  // ── Start recording when voice connects (video mode) ───────────
  const recordingStartedRef = useRef(false);
  useEffect(() => {
    if (!videoMode || !voice.isConnected || recordingStartedRef.current) return;
    recordingStartedRef.current = true;
    const micStream = voice.mediaStreamRef.current;
    recording.start(micStream ?? undefined);
  }, [videoMode, voice.isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Attach mic stream to recording when it becomes available
  useEffect(() => {
    if (!videoMode || !voice.isListening) return;
    const micStream = voice.mediaStreamRef.current;
    if (micStream) {
      recording.attachMicStream(micStream);
    }
  }, [videoMode, voice.isListening]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Countdown timer (starts when voice connects) ────────────────
  useEffect(() => {
    if (!voice.isConnected || timerStartedRef.current || !durationMinutes) return;
    timerStartedRef.current = true;
    setRemainingSeconds(durationMinutes * 60);
  }, [voice.isConnected, durationMinutes]);

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

  // ── Whiteboard persistence ──────────────────────────────────────
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
        console.error("[voice] Failed to save whiteboard:", err);
      }
    },
    [sessionId],
  );

  /** Save all drawings that have content (with images for final save). */
  const saveAllDrawings = useCallback(async () => {
    const wb = whiteboardRef.current;
    if (!wb) return;

    // Capture the active drawing's live state from the canvas
    const currentSnapshot = wb.getSnapshotData();

    const updatedDrawings = drawings.map((d, i) =>
      i === activeDrawingIdx && currentSnapshot ? { ...d, snapshotData: currentSnapshot } : d,
    );

    // Generate images sequentially (shared wb instance) but persist in parallel
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

      // Update local snapshot cache
      setDrawings((prev) =>
        prev.map((d, i) => (i === activeDrawingIdx ? { ...d, snapshotData } : d)),
      );

      await persistDrawing(drawing, snapshotData);
      setSaveStatus("saved");

      // Send whiteboard image as PNG to relay for agent context
      // (Vision LLMs don't support SVG; we convert on the client)
      const wb = whiteboardRef.current;
      if (wb) {
        wb.getImageDataUrl().then((svgUrl) => {
          if (!svgUrl) return;
          svgToPngDataUrl(svgUrl).then((pngUrl) => {
            if (pngUrl) voice.sendWhiteboardUpdate(pngUrl);
          }).catch(() => {});
        }).catch(() => {});
      }
    },
    [drawings, activeDrawingIdx, persistDrawing, voice],
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

      // Load the target drawing
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
      const newDrawing = {
        id: crypto.randomUUID(),
        label: `Drawing ${updated.length + 1}`,
        snapshotData: null,
      };
      return [...updated, newDrawing];
    });
    if (currentDrawing && currentSnapshot) {
      persistDrawing(currentDrawing, currentSnapshot);
    }

    wb.resetScene();
    setActiveDrawingIdx(drawings.length); // index of the new drawing
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
      if (drawings.length <= 1) return; // keep at least one

      const drawing = drawings[idx];

      if (!window.confirm(`Delete "${drawing.label}"? This cannot be undone.`)) return;

      // Delete from backend
      fetch("/api/trpc/session.deleteWhiteboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { sessionId, drawingId: drawing.id } }),
      }).catch((err) => console.error("[voice] Failed to delete whiteboard:", err));

      setDrawings((prev) => prev.filter((_, i) => i !== idx));

      // Adjust active index
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

  // ── Save status tracking ───────────────────────────────────────
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
            json: { sessionId, snippetId: snippet.id, label: snippet.label, snapshotData },
          }),
        });
      } catch (err) {
        console.error("[voice] Failed to save code:", err);
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

      // Send code content to relay for agent context
      try {
        const parsed = JSON.parse(snapshotData);
        if (parsed.code) {
          voice.sendCodeUpdate(parsed.code, parsed.language || "plaintext");
        }
      } catch { /* ignore */ }
    },
    [codeSnippets, activeSnippetIdx, persistCodeSnippet, voice],
  );

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
      if (currentSnippet && currentSnapshot) persistCodeSnippet(currentSnippet, currentSnapshot);
      const target = codeSnippets[targetIdx];
      if (target?.snapshotData) ce.loadScene(target.snapshotData);
      else ce.resetScene();
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
      return [...updated, { id: crypto.randomUUID(), label: `Snippet ${updated.length + 1}`, snapshotData: null }];
    });
    if (currentSnippet && currentSnapshot) persistCodeSnippet(currentSnippet, currentSnapshot);
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
      }).catch((err) => console.error("[voice] Failed to delete code:", err));
      setCodeSnippets((prev) => prev.filter((_, i) => i !== idx));
      if (idx === activeSnippetIdx) {
        const newIdx = Math.min(idx, codeSnippets.length - 2);
        setActiveSnippetIdx(newIdx);
        const target = codeSnippets.filter((_, i) => i !== idx)[newIdx];
        const ce = codeEditorRef.current;
        if (ce) { if (target?.snapshotData) ce.loadScene(target.snapshotData); else ce.resetScene(); }
      } else if (idx < activeSnippetIdx) {
        setActiveSnippetIdx((prev) => prev - 1);
      }
      lastCodeAutoSave.current = null;
    },
    [codeSnippets, activeSnippetIdx, sessionId],
  );

  const [codeSaveStatus, setCodeSaveStatus] = useState<"idle" | "saving" | "saved">("saved");

  const handleCodeDirty = useCallback(() => {
    setCodeSaveStatus("idle");
    const ce = codeEditorRef.current;
    if (ce) liveCodeSnapshotRef.current = ce.getSnapshotData();
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

  // ── Save-before-navigate wrappers ───────────────────────────────
  const saveCurrentContent = useCallback(async () => {
    const wb = whiteboardRef.current;
    if (wb) {
      const snapshot = wb.getSnapshotData();
      const drawing = drawings[activeDrawingIdx];
      if (drawing && snapshot) {
        setDrawings((prev) =>
          prev.map((d, i) => (i === activeDrawingIdx ? { ...d, snapshotData: snapshot } : d)),
        );
        await persistDrawing(drawing, snapshot);
      }
    }
    const ce = codeEditorRef.current;
    if (ce) {
      const snapshot = ce.getSnapshotData();
      const snippet = codeSnippets[activeSnippetIdx];
      if (snippet && snapshot) {
        setCodeSnippets((prev) =>
          prev.map((s, i) => (i === activeSnippetIdx ? { ...s, snapshotData: snapshot } : s)),
        );
        await persistCodeSnippet(snippet, snapshot);
      }
    }
  }, [drawings, activeDrawingIdx, persistDrawing, codeSnippets, activeSnippetIdx, persistCodeSnippet]);

  const handlePreviousQuestion = useCallback(async () => {
    await saveCurrentContent();
    voice.previousQuestion();
  }, [saveCurrentContent, voice]);

  const handleNextQuestion = useCallback(async () => {
    await saveCurrentContent();
    voice.nextQuestion();
  }, [saveCurrentContent, voice]);

  // ── Editor toggle helpers (save before deactivate, restore on activate)
  const saveCodeEditorState = useCallback(() => {
    const ce = codeEditorRef.current;
    if (ce) {
      const snapshot = ce.getSnapshotData();
      if (snapshot) {
        setCodeSnippets((prev) =>
          prev.map((s, i) => (i === activeSnippetIdx ? { ...s, snapshotData: snapshot } : s)),
        );
      }
    }
  }, [activeSnippetIdx]);

  const saveWhiteboardState = useCallback(() => {
    const wb = whiteboardRef.current;
    if (wb) {
      const snapshot = wb.getSnapshotData();
      if (snapshot) {
        setDrawings((prev) =>
          prev.map((d, i) => (i === activeDrawingIdx ? { ...d, snapshotData: snapshot } : d)),
        );
      }
    }
  }, [activeDrawingIdx]);

  const handleToggleCodeEditor = useCallback(() => {
    if (codeEditorActive) {
      saveCodeEditorState();
      setCodeEditorActive(false);
    } else {
      if (whiteboardActive) saveWhiteboardState();
      setCodeEditorActive(true);
      setWhiteboardActive(false);
    }
  }, [codeEditorActive, whiteboardActive, saveCodeEditorState, saveWhiteboardState]);

  const handleToggleWhiteboard = useCallback(() => {
    if (whiteboardActive) {
      saveWhiteboardState();
      setWhiteboardActive(false);
    } else {
      if (codeEditorActive) saveCodeEditorState();
      setWhiteboardActive(true);
      setCodeEditorActive(false);
    }
  }, [whiteboardActive, codeEditorActive, saveWhiteboardState, saveCodeEditorState]);

  // Restore editor/whiteboard content when reactivated after toggle
  useEffect(() => {
    if (!codeEditorActive) return;
    const snippet = codeSnippets[activeSnippetIdx];
    if (snippet?.snapshotData) {
      const timer = setTimeout(() => {
        codeEditorRef.current?.loadScene(snippet.snapshotData!);
      }, 400);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeEditorActive]);

  useEffect(() => {
    if (!whiteboardActive) return;
    const drawing = drawings[activeDrawingIdx];
    if (drawing?.snapshotData) {
      const timer = setTimeout(() => {
        whiteboardRef.current?.loadScene(drawing.snapshotData!);
      }, 400);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whiteboardActive]);

  // ── Common save-and-end logic ───────────────────────────────────
  const endingRef = useRef(false);
  const handleEndInterview = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setLocallyCompleted(true);
    setIsSaving(true);

    voice.stopListening();

    try {
      await Promise.allSettled([
        withTimeout(saveAllDrawings(), 5000, "save drawings"),
        withTimeout(saveAllCodeSnippets(), 5000, "save code snippets"),
      ]);

      try {
        // Stop recording and save artifacts (video mode)
        if (videoMode && recording.isRecording) {
          const result = await withTimeout(recording.stop(), 8000, "stop recording");
          await withTimeout(
            fetch("/api/trpc/session.saveRecording", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                json: {
                  sessionId,
                  audioRecordingUrl: result.audioUrl,
                  audioDuration: result.audioDuration,
                  screenshots: result.screenshots,
                },
              }),
            }),
            8000,
            "save recording",
          );
        }
      } catch (err) {
        console.error("[voice] Failed to save recording:", err);
      }

      await withTimeout(voice.disconnect(), 8000, "voice disconnect");
    } catch (err) {
      console.error("[voice] Failed to end interview cleanly:", err);
    } finally {
      onComplete?.();
    }
  }, [saveAllDrawings, saveAllCodeSnippets, videoMode, recording, sessionId, voice, onComplete]);

  useEffect(() => {
    handleEndInterviewRef.current = handleEndInterview;
  }, [handleEndInterview]);

  // ── Auto-end when timer expires ──────────────────────────────────
  useEffect(() => {
    if (remainingSeconds !== 0 || timerExpiredRef.current) return;
    timerExpiredRef.current = true;
    handleEndInterviewRef.current();
  }, [remainingSeconds]);

  // ── Scroll transcript to bottom ─────────────────────────────────
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, voice.aiTranscript, voice.userTranscript, voice.isProcessing]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMessages]);

  // ── Send chat message helper ──────────────────────────────────
  const handleSendChat = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    voice.interruptPlayback();
    const msg: Message = { id: crypto.randomUUID(), role: "user", content: trimmed, source: "chat" };
    setMessages((prev) => [...prev, msg]);
    setChatMessages((prev) => [...prev, msg]);
    voice.sendTextMessage(trimmed);
  }, [voice]);

  // ── Derived state ───────────────────────────────────────────────
  const progress =
    voice.totalQuestions > 0
      ? ((voice.currentQuestionIndex + 1) / voice.totalQuestions) * 100
      : 0;
  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant") ?? null,
    [messages],
  );
  const latestAssistantFarewellCandidate = useMemo(() => {
    const liveTranscript = voice.aiTranscript.trim();
    if (liveTranscript) return liveTranscript;
    return lastAssistantMessage?.content ?? "";
  }, [voice.aiTranscript, lastAssistantMessage]);
  const hasVisibleFarewell =
    !!latestAssistantFarewellCandidate &&
    looksLikeInterviewFarewell(latestAssistantFarewellCandidate);
  const farewellReadyToClose =
    hasVisibleFarewell &&
    voice.lastAssistantUtteranceEndedAt > 0 &&
    !voice.isSpeaking;
  const shouldShowCompletionScreen =
    !preview &&
    locallyCompleted;

  const formatTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };
  const isTimeLow = remainingSeconds !== null && remainingSeconds <= 60;

  useEffect(() => {
    if (!farewellReadyToClose || locallyCompleted) return;
    const timer = setTimeout(() => {
      handleEndInterviewRef.current();
    }, 2000);
    return () => clearTimeout(timer);
  }, [farewellReadyToClose, locallyCompleted]);

  useEffect(() => {
    if (!voice.isInterviewComplete || locallyCompleted || hasVisibleFarewell) return;
    const timer = setTimeout(() => {
      handleEndInterviewRef.current();
    }, 8000);
    return () => clearTimeout(timer);
  }, [voice.isInterviewComplete, locallyCompleted, hasVisibleFarewell]);
  const completionScreen = (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="py-12 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-secondary-500" />
          <h2 className="mt-4 text-2xl font-bold">Thank you!</h2>
          <p className="mt-2 text-muted-foreground">
            Your interview has been completed successfully. We appreciate your
            time and thoughtful responses.
          </p>
        </CardContent>
      </Card>
    </div>
  );

  const sortedQuestions = interviewContext.questions.slice().sort((a, b) => a.order - b.order);
  const currentQVoice = sortedQuestions[voice.currentQuestionIndex];
  const currentQuestionText = currentQVoice?.text || "";
  const isCodingQuestion = currentQVoice?.type === "CODING";
  const isWhiteboardQuestion = currentQVoice?.type === "WHITEBOARD";

  const codeEditorInitialData = useMemo(() => {
    const snippet = codeSnippets[activeSnippetIdx];
    if (snippet?.snapshotData) return snippet.snapshotData;
    if (currentQVoice?.starterCode?.code) {
      return JSON.stringify({
        code: currentQVoice.starterCode.code,
        language: currentQVoice.starterCode.language,
      });
    }
    return undefined;
  }, [codeSnippets, activeSnippetIdx, currentQVoice]);

  // ── Draggable split handlers ──────────────────────────────
  const handleSplitDividerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    splitDragging.current = true;
    const onPointerMove = (ev: PointerEvent) => {
      if (!splitDragging.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = isMobile
        ? ((ev.clientY - rect.top) / rect.height) * 100
        : ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(Math.max(pct, 20), 70));
    };
    const onPointerUp = () => {
      splitDragging.current = false;
      target.releasePointerCapture?.(e.pointerId);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, [isMobile]);

  // Voice view: vertical split (voice vs transcript) on mobile
  const handleVoiceTranscriptSplitDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    splitDragging.current = true;
    const onPointerMove = (ev: PointerEvent) => {
      if (!splitDragging.current || !voiceSplitContainerRef.current) return;
      const rect = voiceSplitContainerRef.current.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setSplitPercent(Math.min(Math.max(pct, 20), 70));
    };
    const onPointerUp = () => {
      splitDragging.current = false;
      target.releasePointerCapture?.(e.pointerId);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, []);

  // Auto-activate editor and save/restore per-question content
  const prevQIndexRef = useRef(voice.currentQuestionIndex);
  useEffect(() => {
    const prevIdx = prevQIndexRef.current;
    const newIdx = voice.currentQuestionIndex;
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
        if (i === activeSnippetIdx) {
          const snapshot = ce?.getSnapshotData() ?? liveCodeSnapshotRef.current ?? s.snapshotData;
          return { ...s, snapshotData: snapshot };
        }
        return s;
      });
      liveCodeSnapshotRef.current = null;

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
        }, 400);
      } else {
        const freshDrawings = [{ id: crypto.randomUUID(), label: "Drawing 1", snapshotData: null as string | null }];
        const freshSnippets = [{ id: crypto.randomUUID(), label: "Snippet 1", snapshotData: null as string | null }];
        setDrawings(freshDrawings);
        setActiveDrawingIdx(0);
        setCodeSnippets(freshSnippets);
        setActiveSnippetIdx(0);
        setTimeout(() => {
          whiteboardRef.current?.resetScene();
        }, 150);
      }
    }

    // ── Auto-activate/deactivate the appropriate editor on question change ──
    if (questionChanged) {
      if (isCodingQuestion) {
        setCodeEditorActive(true);
        setWhiteboardActive(false);
      } else if (isWhiteboardQuestion) {
        setWhiteboardActive(true);
        setCodeEditorActive(false);
      } else {
        setCodeEditorActive(false);
        setWhiteboardActive(false);
      }
    }

    // ── Load starter code for fresh coding questions ──
    if (
      isCodingQuestion &&
      questionChanged &&
      currentQVoice?.starterCode?.code &&
      !questionContentMapRef.current.has(newIdx)
    ) {
      const starterData = JSON.stringify({
        code: currentQVoice.starterCode.code,
        language: currentQVoice.starterCode.language,
      });
      setTimeout(() => {
        codeEditorRef.current?.loadScene(starterData);
      }, 300);
    }

    prevQIndexRef.current = newIdx;
  }, [voice.currentQuestionIndex, isCodingQuestion, isWhiteboardQuestion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-activate the correct editor when voice first connects
  const initialEditorSetRef = useRef(false);
  useEffect(() => {
    if (!voice.isConnected || initialEditorSetRef.current) return;
    initialEditorSetRef.current = true;
    if (isCodingQuestion) {
      setCodeEditorActive(true);
      setWhiteboardActive(false);
    } else if (isWhiteboardQuestion) {
      setWhiteboardActive(true);
      setCodeEditorActive(false);
    }
  }, [voice.isConnected, isCodingQuestion, isWhiteboardQuestion]);

  // ── Render ──────────────────────────────────────────────────────
  return shouldShowCompletionScreen ? completionScreen : (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background">
      {/* Saving overlay */}
      {isSaving && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="mt-4 text-lg font-medium">Saving interview data...</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This will only take a moment.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 border-b bg-card px-3 py-2 md:px-6 md:py-3">
        <div className="flex items-center justify-between">
          <div className="mr-2 min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold md:text-base">{interviewTitle}</h1>
            <p className="hidden text-xs text-muted-foreground md:block">
              Voice Interview with {aiName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {videoMode && recording.isRecording && (
              <div className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5">
                <div className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                <span className="text-[10px] font-medium text-destructive">REC</span>
              </div>
            )}
            <Badge variant={preview ? "outline" : voice.isConnected ? "default" : "secondary"}>
              {preview ? "Preview" : voice.isConnected ? "Connected" : "Disconnected"}
            </Badge>
            <IntervieweeHelpPopover mode="voice" />
          </div>
        </div>
        {/* Question progress + timer (mobile: timer in header to avoid blocking bottom buttons) */}
        <div className="mt-2 flex items-center gap-3">
          <Progress value={progress} className="h-1.5 flex-1" />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            Q{voice.currentQuestionIndex + 1} / {voice.totalQuestions}
          </span>
          {remainingSeconds !== null && isMobile && (
            <div className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${isTimeLow ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
              <Clock className="h-3 w-3" />
              <span>{formatTime(remainingSeconds)} left</span>
            </div>
          )}
        </div>
        {/* Current question text */}
        {voice.isConnected && currentQuestionText && (
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-1">
            {currentQuestionText}
          </p>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-6 mt-2 flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Main content: left (voice / whiteboard) + draggable divider + right (transcript) */}
      <div ref={containerRef} className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left panel — voice visualization or whiteboard */}
        <div className="flex min-h-0 flex-1 flex-col" style={isMobile ? undefined : { minWidth: MIN_PANEL_WIDTH }}>
          {(whiteboardActive || codeEditorActive) ? (
            /* ── Whiteboard or Code Editor main view ────────────── */
            <div className="relative flex min-h-0 flex-1 flex-col">
              {/* Minimized voice status bar */}
              <div className="flex items-center gap-3 border-b bg-card px-4 py-2">
                {voice.isSpeaking && (
                  <div className="flex items-center gap-1.5 text-primary">
                    <Volume2 className="h-4 w-4 animate-pulse" />
                    <span className="text-xs font-medium">{aiName} speaking</span>
                  </div>
                )}
                {voice.isListening && (
                  <div className="flex items-center gap-1.5 text-secondary-500">
                    <div className="relative h-4 w-4">
                      <Mic className="absolute inset-0 h-full w-full text-muted-foreground/30" />
                      <div
                        className="absolute inset-0 overflow-hidden transition-[clip-path] duration-150 ease-out"
                        style={{ clipPath: `inset(${(1 - voice.audioLevel) * 100}% 0 0 0)` }}
                      >
                        <Mic className="h-full w-full text-secondary-400" />
                      </div>
                    </div>
                    <span className="text-xs font-medium">Listening</span>
                  </div>
                )}
                {voice.isProcessing && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs font-medium">Thinking</span>
                  </div>
                )}
                {voice.isTransitioning && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs font-medium">
                      {voice.transitionDirection === "previous" ? "Previous question..." : "Next question..."}
                    </span>
                  </div>
                )}
                {!voice.isSpeaking && !voice.isListening && !voice.isProcessing && !voice.isTransitioning && (
                  <span className="text-xs text-muted-foreground">
                    {voice.isConnected
                      ? `Voice active — ${whiteboardActive ? "draw" : "code"} freely`
                      : "Voice disconnected"}
                  </span>
                )}
                {voice.isListening && voice.userTranscript && (
                  <span className="ml-auto max-w-[50%] truncate text-xs text-muted-foreground italic">
                    &ldquo;{voice.userTranscript}&rdquo;
                  </span>
                )}
              </div>
              {/* Tabs — conditional on whiteboard or code editor */}
              {whiteboardActive ? (
              <div className="flex items-center gap-1 border-b bg-card px-3 py-1.5">
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
              ) : (
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
              )}
              {/* Canvas — fills remaining space */}
              <div className="flex-1 min-h-0">
                {whiteboardActive && isWhiteboardQuestion && currentQVoice ? (
                  /* Side-by-side on desktop, stacked on mobile */
                  <div ref={splitContainerRef} className={isMobile ? "flex h-full flex-col" : "flex h-full"}>
                    {/* Problem panel */}
                    <div
                      className={`min-w-0 shrink-0 overflow-y-auto overflow-x-hidden p-4 code-scrollbar ${isMobile ? "border-b" : ""}`}
                      style={isMobile ? { height: `${splitPercent}%`, minHeight: 80 } : { width: `${splitPercent}%`, minWidth: 180 }}
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Problem</span>
                      </div>
                      <p className="mb-3 text-sm font-medium leading-snug">{currentQVoice.text}</p>
                      {currentQVoice.description && (
                        <p className="mb-3 text-xs text-muted-foreground whitespace-pre-wrap">{currentQVoice.description}</p>
                      )}
                    </div>
                    {/* Draggable divider */}
                    <div
                      className={`group flex items-center justify-center border-border bg-muted/30 transition-colors hover:bg-primary/10 active:bg-primary/20 ${isMobile ? "h-1 cursor-row-resize border-t border-b touch-none" : "w-1 cursor-col-resize border-l border-r touch-none"}`}
                      onPointerDown={handleSplitDividerDown}
                    />
                    {/* Whiteboard */}
                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
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
                ) : whiteboardActive ? (
                  <WhiteboardCanvas
                    ref={whiteboardRef}
                    fillParent
                    dark={isDark}
                    onAutoSave={handleWhiteboardAutoSave}
                    autoSaveInterval={5000}
                    onDirty={handleWhiteboardDirty}
                  />
                ) : codeEditorActive && isCodingQuestion && currentQVoice ? (
                  /* Side-by-side on desktop, stacked on mobile */
                  <div ref={splitContainerRef} className={isMobile ? "flex h-full flex-col" : "flex h-full"}>
                    {/* Problem panel */}
                    <div
                      className={`min-w-0 shrink-0 overflow-y-auto overflow-x-hidden p-4 code-scrollbar ${isMobile ? "border-b" : ""}`}
                      style={isMobile ? { height: `${splitPercent}%`, minHeight: 80 } : { width: `${splitPercent}%`, minWidth: 180 }}
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Problem</span>
                      </div>
                      <p className="mb-3 text-sm font-medium leading-snug">{currentQVoice.text}</p>
                      {currentQVoice.description && (
                        <p className="mb-3 text-xs text-muted-foreground">{currentQVoice.description}</p>
                      )}
                      {currentQVoice.starterCode?.code && (
                        <div className="overflow-hidden rounded-md border bg-zinc-950">
                          <div className="flex items-center gap-1.5 border-b border-zinc-800 bg-zinc-900 px-3 py-1.5">
                            <Code2 className="h-3 w-3 text-zinc-400" />
                            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                              Starter Code — {currentQVoice.starterCode.language}
                            </span>
                          </div>
                          <CodeBlock code={currentQVoice.starterCode.code} language={currentQVoice.starterCode.language} />
                        </div>
                      )}
                    </div>
                    {/* Draggable divider */}
                    <div
                      className={`group flex items-center justify-center border-border bg-muted/30 transition-colors hover:bg-primary/10 active:bg-primary/20 ${isMobile ? "h-1 cursor-row-resize border-t border-b touch-none" : "w-1 cursor-col-resize border-l border-r touch-none"}`}
                      onPointerDown={handleSplitDividerDown}
                    />
                    {/* Code editor */}
                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                      <CodeEditorCanvas
                        key={`code-${voice.currentQuestionIndex}`}
                        ref={codeEditorRef}
                        fillParent
                        dark={isDark}
                        initialData={codeEditorInitialData}
                        onAutoSave={handleCodeAutoSave}
                        autoSaveInterval={5000}
                        onDirty={handleCodeDirty}
                      />
                    </div>
                  </div>
                ) : (
                  <CodeEditorCanvas
                    key={`code-${voice.currentQuestionIndex}`}
                    ref={codeEditorRef}
                    fillParent
                    dark={isDark}
                    initialData={codeEditorInitialData}
                    onAutoSave={handleCodeAutoSave}
                    autoSaveInterval={5000}
                    onDirty={handleCodeDirty}
                  />
                )}
              </div>
            </div>
          ) : (
            /* ── Voice visualization (mobile: show transcript below when no editor) ── */
            <div
              ref={voiceSplitContainerRef}
              data-tour="voice-status"
              className={`flex flex-1 flex-col ${isMobile ? "min-h-0" : ""}`}
            >
              <div
                className={`flex flex-col items-center justify-center gap-8 ${
                  isMobile
                    ? mobileTranscriptCollapsed
                      ? "min-h-0 flex-1 py-4"
                      : "min-h-0 shrink-0 py-4"
                    : "flex-1"
                }`}
                style={
                  isMobile
                    ? mobileTranscriptCollapsed
                      ? { minHeight: 80 }
                      : { height: `${splitPercent}%`, minHeight: 80 }
                    : undefined
                }
              >
              {/* Status indicator */}
              <div className="flex flex-col items-center gap-4">
                {voice.isTransitioning && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm font-medium">
                      {voice.transitionDirection === "previous" ? "Preparing previous question..." : "Preparing next question..."}
                    </span>
                  </div>
                )}
                {voice.isProcessing && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm font-medium">Thinking...</span>
                  </div>
                )}
                {voice.isSpeaking && (
                  <div className="flex items-center gap-2 text-primary">
                    <Volume2 className="h-5 w-5 animate-pulse" />
                    <span className="text-sm font-medium">{aiName} is speaking...</span>
                  </div>
                )}
                {voice.isListening && (
                  <div className="flex flex-col items-center gap-3">
                    {/* Mic icon with fill level */}
                    <div className="relative h-10 w-10">
                      <Mic className="absolute inset-0 h-full w-full text-muted-foreground/30" />
                      <div
                        className="absolute inset-0 overflow-hidden transition-[clip-path] duration-150 ease-out"
                        style={{ clipPath: `inset(${(1 - voice.audioLevel) * 100}% 0 0 0)` }}
                      >
                        <Mic className="h-full w-full text-secondary-400" />
                      </div>
                    </div>
                    <span className="text-sm font-medium text-secondary-500">Listening...</span>
                  </div>
                )}

                {/* Live transcript while listening */}
                {voice.isListening && voice.userTranscript && (
                  <p className="max-w-md text-center text-sm text-muted-foreground">
                    &ldquo;{voice.userTranscript}&rdquo;
                  </p>
                )}

                {/* Audio waveform — driven by real audio level */}
                {(voice.isSpeaking || voice.isListening) && (
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 20 }).map((_, i) => {
                      const level = voice.isSpeaking ? 0.5 : voice.audioLevel;
                      const barVariance = Math.sin((i + Date.now() / 200) * 0.7) * 0.3 + 0.7;
                      return (
                        <div
                          key={i}
                          className={`w-1 rounded-full transition-all duration-150 ${
                            level > 0.02 ? "bg-primary" : "bg-muted"
                          }`}
                          style={{
                            height: `${8 + level * barVariance * 32}px`,
                          }}
                        />
                      );
                    })}
                  </div>
                )}

                {/* AI response text */}
                {voice.aiTranscript && !voice.isListening && (
                  <p className="max-w-md text-center text-sm text-muted-foreground italic">
                    {voice.aiTranscript.length > 200
                      ? voice.aiTranscript.slice(0, 200) + "..."
                      : voice.aiTranscript}
                  </p>
                )}
              </div>

              {!voice.isConnected && !preview && (
                <Button
                  size="lg"
                  disabled={isStartingInterview}
                  onClick={async () => {
                    setError("");
                    setIsStartingInterview(true);
                    try {
                      await voice.connect();
                    } catch {
                      setIsStartingInterview(false);
                    }
                  }}
                  className="gap-2 rounded-full px-8"
                >
                  {isStartingInterview ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                  {isStartingInterview ? "Connecting..." : "Start Voice Interview"}
                </Button>
              )}

              {!voice.isConnected && !preview && isStartingInterview && (
                <p className="text-sm text-muted-foreground">
                  Connecting to the interview. This can take a few seconds.
                </p>
              )}

              {preview && (
                <p className="text-sm text-muted-foreground">
                  This is where the voice conversation happens
                </p>
              )}
              {voice.isConnected && !voice.isListening && (
                <p className="text-sm text-muted-foreground">
                  Click the mic to start speaking
                </p>
              )}
              {voice.isConnected && voice.isListening && !voice.isSpeaking && (
                <p className="text-sm text-muted-foreground">
                  Speak naturally — AI will respond automatically
                </p>
              )}
              </div>

              {/* Mobile: draggable divider between voice and transcript */}
              {isMobile && !mobileTranscriptCollapsed && (
                <div
                  className="group flex h-1 shrink-0 cursor-row-resize items-center justify-center border-t border-b border-border bg-muted/30 transition-colors hover:bg-primary/10 active:bg-primary/20 touch-none"
                  onPointerDown={handleVoiceTranscriptSplitDown}
                />
              )}

              {/* Mobile: transcript below voice when no whiteboard/code editor */}
              {isMobile && (
                <div
                  className={
                    mobileTranscriptCollapsed
                      ? "mt-auto shrink-0 border-t bg-card"
                      : "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card"
                  }
                >
                  <button
                    type="button"
                    className="flex shrink-0 items-center justify-between border-b px-4 py-2 text-left"
                    onClick={() => setMobileTranscriptCollapsed((prev) => !prev)}
                  >
                    <p className="text-xs font-medium text-muted-foreground">Transcript</p>
                    {mobileTranscriptCollapsed ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {!mobileTranscriptCollapsed && (
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="space-y-3 p-4">
                        {preview ? (
                          <>
                            <div className="flex items-start gap-1.5 text-sm">
                              <Volume2 className="mt-0.5 h-3 w-3 shrink-0 text-primary/60" />
                              <div>
                                <span className="font-medium text-primary">{aiName}:</span>{" "}
                                Welcome! Let&apos;s begin the interview. Could you start by telling me about yourself?
                              </div>
                            </div>
                            <div className="flex items-start gap-1.5 text-sm">
                              <Mic className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                              <div>
                                <span className="font-medium text-secondary-600 dark:text-secondary-400">You:</span>{" "}
                                Sure, I have been working as a software engineer for...
                              </div>
                            </div>
                            <p className="text-center text-xs text-muted-foreground italic">(sample transcript)</p>
                          </>
                        ) : messages.length === 0 && !voice.aiTranscript && !voice.userTranscript ? (
                          <p className="py-8 text-center text-sm text-muted-foreground">
                            Transcript will appear here once the conversation starts.
                          </p>
                        ) : (
                          <>
                            {messages.map((msg) => (
                              <div key={msg.id} className="flex items-start gap-1.5 text-sm">
                                {msg.role === "user" ? (
                                  msg.source === "chat"
                                    ? <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                    : <Mic className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                ) : (
                                  <Volume2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                )}
                                <div>
                                  <span
                                    className={`font-medium ${
                                      msg.role === "user"
                                        ? "text-secondary-600 dark:text-secondary-400"
                                        : "text-primary"
                                    }`}
                                  >
                                    {msg.role === "user" ? "You" : aiName}:
                                  </span>{" "}
                                  {msg.content}
                                </div>
                              </div>
                            ))}
                            {voice.userTranscript && (
                              <div className="flex items-start gap-1.5 text-sm animate-pulse">
                                <Mic className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                <div>
                                  <span className="font-medium text-secondary-600 dark:text-secondary-400">You:</span>{" "}
                                  <span className="text-muted-foreground">{voice.userTranscript}</span>
                                </div>
                              </div>
                            )}
                            {voice.isProcessing && !voice.aiTranscript && (
                              <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                                <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-primary/60" />
                                <span className="text-xs italic">Thinking...</span>
                              </div>
                            )}
                            {voice.aiTranscript && (() => {
                              const alreadyInMessages = hasRecentAssistantTranscript(messages, voice.aiTranscript);
                              if (alreadyInMessages) return null;
                              return (
                                <div className="flex items-start gap-1.5 text-sm">
                                  <Volume2 className="mt-0.5 h-3 w-3 shrink-0 text-primary/60" />
                                  <div>
                                    <span className="font-medium text-primary">{aiName}:</span>{" "}
                                    <span className="text-muted-foreground">{voice.aiTranscript}</span>
                                  </div>
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Draggable divider (desktop only) ────────────────── */}
        {!isMobile && !desktopTranscriptCollapsed && (
          <div
            className="group flex w-1 cursor-col-resize touch-none items-center justify-center border-l border-r border-border bg-muted/30 transition-colors hover:bg-primary/10 active:bg-primary/20"
            onPointerDown={onDragStart}
          />
        )}

        {/* ── Right panel — Transcript + optional Chat (desktop only) ── */}
        {!isMobile && (
        <div
          ref={rightPanelRef}
          className="flex min-h-0 shrink-0 flex-col border-l bg-card"
          style={{ width: desktopTranscriptCollapsed ? COLLAPSED_RIGHT_DOCK_WIDTH : rightWidth }}
        >
          {desktopTranscriptCollapsed ? (
            <button
              type="button"
              className="flex h-full w-full flex-col items-center justify-start gap-3 px-2 py-4 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              onClick={() => setDesktopTranscriptCollapsed(false)}
            >
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span
                className="text-[11px] font-medium uppercase tracking-[0.2em]"
                style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
              >
                Transcript
              </span>
            </button>
          ) : (
            <>
              {/* Transcript section */}
              <div
                data-tour="voice-transcript"
                className="flex min-h-0 flex-col overflow-hidden"
                style={
                  chatOpen && chatEnabled
                    ? { height: `${chatSplitPercent}%` }
                    : { flex: 1 }
                }
              >
                <button
                  type="button"
                  className="flex items-center justify-between border-b px-4 py-2 text-left"
                  onClick={() => setDesktopTranscriptCollapsed(true)}
                >
                  <p className="text-xs font-medium text-muted-foreground">Transcript</p>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-3 p-4">
                    {preview ? (
                      <>
                        <div className="flex items-start gap-1.5 text-sm">
                          <Volume2 className="mt-0.5 h-3 w-3 shrink-0 text-primary/60" />
                          <div>
                            <span className="font-medium text-primary">{aiName}:</span>{" "}
                            Welcome! Let&apos;s begin the interview. Could you start by telling me about yourself?
                          </div>
                        </div>
                        <div className="flex items-start gap-1.5 text-sm">
                          <Mic className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                          <div>
                            <span className="font-medium text-secondary-600 dark:text-secondary-400">You:</span>{" "}
                            Sure, I have been working as a software engineer for...
                          </div>
                        </div>
                        <p className="text-center text-xs text-muted-foreground italic">(sample transcript)</p>
                      </>
                    ) : messages.length === 0 && !voice.aiTranscript && !voice.userTranscript ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Transcript will appear here once the conversation starts.
                      </p>
                    ) : (
                      <>
                        {messages.map((msg) => (
                          <div key={msg.id} className="flex items-start gap-1.5 text-sm">
                            {msg.role === "user" ? (
                              msg.source === "chat"
                                ? <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                : <Mic className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                            ) : (
                              <Volume2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                            )}
                            <div>
                              <span
                                className={`font-medium ${
                                  msg.role === "user"
                                    ? "text-secondary-600 dark:text-secondary-400"
                                    : "text-primary"
                                }`}
                              >
                                {msg.role === "user" ? "You" : aiName}:
                              </span>{" "}
                              {msg.content}
                            </div>
                          </div>
                        ))}
                        {voice.userTranscript && (
                          <div className="flex items-start gap-1.5 text-sm animate-pulse">
                            <Mic className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                            <div>
                              <span className="font-medium text-secondary-600 dark:text-secondary-400">You:</span>{" "}
                              <span className="text-muted-foreground">{voice.userTranscript}</span>
                            </div>
                          </div>
                        )}
                        {voice.isProcessing && !voice.aiTranscript && (
                          <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                            <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-primary/60" />
                            <span className="text-xs italic">Thinking...</span>
                          </div>
                        )}
                        {voice.aiTranscript && (() => {
                          const alreadyInMessages = hasRecentAssistantTranscript(messages, voice.aiTranscript);
                          if (alreadyInMessages) return null;
                          return (
                            <div className="flex items-start gap-1.5 text-sm">
                              <Volume2 className="mt-0.5 h-3 w-3 shrink-0 text-primary/60" />
                              <div>
                                <span className="font-medium text-primary">{aiName}:</span>{" "}
                                <span className="text-muted-foreground">{voice.aiTranscript}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                    <div ref={transcriptEndRef} />
                  </div>
                </ScrollArea>
              </div>

              {/* Draggable horizontal divider */}
              {chatOpen && chatEnabled && (
                <div
                  className="group flex h-1 cursor-row-resize touch-none items-center justify-center border-t border-b border-border bg-muted/30 transition-colors hover:bg-primary/10 active:bg-primary/20"
                  onPointerDown={onChatDragStart}
                />
              )}

              {/* Chat section (toggled via control bar) */}
              {chatOpen && chatEnabled && (
                <div
                  className="flex min-h-0 flex-col overflow-hidden"
                  style={{ height: `${100 - chatSplitPercent}%` }}
                >
                  <div className="flex items-center border-b px-4 py-2">
                    <p className="text-xs font-medium text-muted-foreground">Chat</p>
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="space-y-3 p-4">
                      {chatMessages.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">
                          Send a message to start chatting.
                        </p>
                      ) : (
                        chatMessages.map((msg) => (
                          <div key={msg.id} className="flex items-start gap-1.5 text-sm">
                            <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                            <p className="text-foreground">{msg.content}</p>
                          </div>
                        ))
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  </ScrollArea>
                  <div className="flex items-center gap-2 border-t px-3 py-2">
                    <Input
                      ref={chatInputRef}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Type a message..."
                      className="h-8 flex-1 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && chatInput.trim()) {
                          e.preventDefault();
                          handleSendChat(chatInput);
                          setChatInput("");
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      disabled={!chatInput.trim()}
                      onClick={() => {
                        handleSendChat(chatInput);
                        setChatInput("");
                        chatInputRef.current?.focus();
                      }}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        )}
      </div>

      {/* ── Bottom control bar (Zoom-like) ──────────────────── */}
      {(voice.isConnected || preview) && (
        <div className={`relative flex items-center justify-center gap-2 border-t bg-card px-3 py-2 md:gap-6 md:px-6${preview ? " pointer-events-none" : ""}`}>
          {/* Timer — right-aligned on desktop only (mobile shows it in header) */}
          {remainingSeconds !== null && !isMobile && (
            <div className={`absolute right-3 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium tabular-nums md:right-6 md:px-2.5 ${isTimeLow ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
              <Clock className="h-3.5 w-3.5" />
              <span>{formatTime(remainingSeconds)} left</span>
            </div>
          )}
          {/* Mic toggle */}
          <div data-tour="voice-mic" className="flex flex-col items-center gap-0.5">
            <Button
              size="icon"
              variant={voice.isListening ? "default" : "secondary"}
              className={`h-9 w-9 rounded-full transition-all ${
                voice.isListening
                  ? "bg-secondary-500 hover:bg-secondary-600 border-secondary-500"
                  : ""
              }`}
              onClick={() => {
                if (voice.isListening) {
                  voice.stopListening();
                } else {
                  voice.startListening();
                }
              }}
            >
              {voice.isListening ? (
                <Mic className="h-4 w-4" />
              ) : (
                <MicOff className="h-4 w-4" />
              )}
            </Button>
            <span className="hidden text-[10px] text-muted-foreground md:block">
              {voice.isListening ? "Mute" : "Unmute"}
            </span>
          </div>

          {/* Chat toggle (mobile: opens transcript+chat sheet; same layout as other icon buttons) */}
          {chatEnabled && (
            <div data-tour="voice-chat" className="flex flex-col items-center gap-0.5">
              <Button
                size="icon"
                variant={chatOpen ? "default" : "secondary"}
                className="h-9 w-9 rounded-full"
                onClick={() => setChatOpen((prev) => !prev)}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
              <span className="hidden text-[10px] text-muted-foreground md:block">Chat</span>
            </div>
          )}

          {/* Whiteboard + Code Editor toggles */}
          <div data-tour="voice-tools" className="flex items-center gap-2 md:gap-6">
            <div className="flex flex-col items-center gap-0.5">
              <Button
                size="icon"
                variant={whiteboardActive ? "default" : "secondary"}
                className="h-9 w-9 rounded-full"
                onClick={handleToggleWhiteboard}
              >
                <PenLine className="h-4 w-4" />
              </Button>
              <span className="hidden text-[10px] text-muted-foreground md:block">Whiteboard</span>
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <Button
                size="icon"
                variant={codeEditorActive ? "default" : "secondary"}
                className="h-9 w-9 rounded-full"
                onClick={handleToggleCodeEditor}
              >
                <Code2 className="h-4 w-4" />
              </Button>
              <span className="hidden text-[10px] text-muted-foreground md:block">Code</span>
            </div>
          </div>

          {/* Previous / Next / End */}
          <div data-tour="voice-progress" className="flex items-center gap-2 md:gap-6">
            <div className="flex flex-col items-center gap-0.5">
              <Button
                size="icon"
                variant="secondary"
                className="h-9 w-9 rounded-full"
                onClick={handlePreviousQuestion}
                disabled={
                  voice.isTransitioning ||
                  voice.currentQuestionIndex <= 0
                }
              >
                {voice.isTransitioning && voice.transitionDirection === "previous" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SkipBack className="h-4 w-4" />
                )}
              </Button>
              <span className="hidden text-[10px] text-muted-foreground md:block">Previous</span>
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <Button
                size="icon"
                variant="secondary"
                className="h-9 w-9 rounded-full"
                onClick={handleNextQuestion}
                disabled={
                  voice.isTransitioning ||
                  voice.currentQuestionIndex >= voice.totalQuestions - 1
                }
              >
                {voice.isTransitioning && voice.transitionDirection !== "previous" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SkipForward className="h-4 w-4" />
                )}
              </Button>
              <span className="hidden text-[10px] text-muted-foreground md:block">Next</span>
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <Button
                size="icon"
                variant="destructive"
                className="h-9 w-9 rounded-full"
                onClick={() => setShowEndDialog(true)}
              >
                <PhoneOff className="h-4 w-4" />
              </Button>
              <span className="hidden text-[10px] text-muted-foreground md:block">End</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Camera PIP overlay (video mode) — draggable ────── */}
      {videoMode && recording.cameraStream && (
        <DraggablePip>
          <video
            ref={cameraPipRef}
            autoPlay
            playsInline
            muted
            className="h-28 w-36 object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5">
            <Video className="h-2.5 w-2.5 text-white" />
            <span className="text-[9px] text-white">Camera</span>
          </div>
        </DraggablePip>
      )}

      {/* ── End interview confirmation dialog ─────────────── */}
      <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End interview?</AlertDialogTitle>
            <AlertDialogDescription>
              This will save your progress and end the current interview session. You won&apos;t be able to continue after this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleEndInterview}
            >
              End Interview
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Mobile transcript + chat sheet (replaces separate transcript button) ── */}
      {isMobile && chatEnabled && (
        <Sheet open={chatOpen} onOpenChange={setChatOpen}>
          <SheetContent
            side="bottom"
            className="flex h-[60vh] flex-col p-0"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <SheetHeader className="shrink-0 border-b px-4 py-3">
              <SheetTitle className="text-sm">Chat</SheetTitle>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-4">
                {messages.length === 0 && !voice.aiTranscript && !voice.userTranscript ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Transcript will appear here once the conversation starts.
                  </p>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <div key={msg.id} className="flex items-start gap-1.5 text-sm">
                        {msg.role === "user" ? (
                          msg.source === "chat"
                            ? <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                            : <Mic className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                        ) : (
                          <Volume2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        <div>
                          <span
                            className={`font-medium ${
                              msg.role === "user"
                                ? "text-secondary-600 dark:text-secondary-400"
                                : "text-primary"
                            }`}
                          >
                            {msg.role === "user" ? "You" : aiName}:
                          </span>{" "}
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {voice.userTranscript && (
                      <div className="flex items-start gap-1.5 text-sm animate-pulse">
                        <Mic className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                        <div>
                          <span className="font-medium text-secondary-600 dark:text-secondary-400">You:</span>{" "}
                          <span className="text-muted-foreground">{voice.userTranscript}</span>
                        </div>
                      </div>
                    )}
                    {voice.aiTranscript && (() => {
                      const alreadyInMessages = hasRecentAssistantTranscript(messages, voice.aiTranscript);
                      if (alreadyInMessages) return null;
                      return (
                        <div className="flex items-start gap-1.5 text-sm">
                          <Volume2 className="mt-0.5 h-3 w-3 shrink-0 text-primary/60" />
                          <div>
                            <span className="font-medium text-primary">{aiName}:</span>{" "}
                            <span className="text-muted-foreground">{voice.aiTranscript}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>
            <div className="flex shrink-0 items-center gap-2 border-t px-3 py-2">
              <Input
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
                className="h-8 flex-1 text-base md:text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && chatInput.trim()) {
                    e.preventDefault();
                    handleSendChat(chatInput);
                    setChatInput("");
                  }
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                disabled={!chatInput.trim()}
                onClick={() => {
                  handleSendChat(chatInput);
                  setChatInput("");
                  chatInputRef.current?.focus();
                }}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
