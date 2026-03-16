"use client";

import { QUESTION_TYPE_STYLES, QuestionCard } from "@/components/interview/question-card";
import { useOrg } from "@/components/org-provider";
import { AiButton } from "@/components/ui/ai-button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { AssessmentCriterion, GeneratedInterview, GeneratedQuestion } from "@/lib/ai/types";
import { AI_TONES, FOLLOW_UP_DEPTHS, LANGUAGES } from "@/lib/constants";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
    BrainCircuit,
    Briefcase,
    Check,
    Code2,
    Copy,
    ListOrdered,
    Loader2,
    MessageSquareText,
    Mic,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    ShieldCheck,
    Sparkles,
    Target,
    Trash2,
    Users,
    Video,
    X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PromptSegment = string | { text: string; highlight: true };

interface PromptTemplate {
  label: string;
  icon: React.ElementType;
  segments: PromptSegment[];
}

interface HLRange {
  start: number;
  end: number;
}

function templateToText(segments: PromptSegment[]): string {
  return segments.map((s) => (typeof s === "string" ? s : s.text)).join("");
}

function rangesFromSegments(segments: PromptSegment[]): HLRange[] {
  const ranges: HLRange[] = [];
  let pos = 0;
  for (const seg of segments) {
    const text = typeof seg === "string" ? seg : seg.text;
    if (typeof seg !== "string") ranges.push({ start: pos, end: pos + text.length });
    pos += text.length;
  }
  return ranges;
}

function adjustRanges(ranges: HLRange[], oldText: string, newText: string): HLRange[] {
  if (!ranges.length) return ranges;
  let s = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (s < minLen && oldText[s] === newText[s]) s++;
  let oe = oldText.length;
  let ne = newText.length;
  while (oe > s && ne > s && oldText[oe - 1] === newText[ne - 1]) {
    oe--;
    ne--;
  }
  const delta = (ne - s) - (oe - s);
  return ranges
    .map(({ start: rs, end: re }) => {
      if (re <= s) return { start: rs, end: re };
      if (rs >= oe) return { start: rs + delta, end: re + delta };
      if (rs <= s && re >= oe) return { start: rs, end: re + delta };
      if (rs >= s && re <= oe) return { start: s, end: ne };
      if (rs >= s && rs < oe) return { start: ne, end: re + delta };
      if (re > s && re <= oe) return { start: rs, end: s };
      return { start: rs, end: re };
    })
    .filter((r) => r.start < r.end);
}

function segmentsFromRanges(text: string, ranges: HLRange[]): PromptSegment[] {
  if (!ranges.length || !text) return text ? [text] : [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const result: PromptSegment[] = [];
  let pos = 0;
  for (const { start, end } of sorted) {
    if (start > pos) result.push(text.slice(pos, start));
    if (end > start) result.push({ text: text.slice(start, end), highlight: true });
    pos = end;
  }
  if (pos < text.length) result.push(text.slice(pos));
  return result;
}

const h = (text: string): { text: string; highlight: true } => ({
  text,
  highlight: true,
});

const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    label: "Tech Hiring",
    icon: Code2,
    segments: [
      "Assess ",
      h("Senior Software Engineer"),
      " candidates with ",
      h("8"),
      " questions covering ",
      h("open-ended, coding, multiple-choice, and whiteboard"),
      " types, focusing on ",
      h("practical problem-solving and technical depth"),
      ".",
    ],
  },
  {
    label: "Behavioral",
    icon: Users,
    segments: [
      "Conduct a ",
      h("behavioral interview"),
      " with ",
      h("6"),
      " questions mixing ",
      h("open-ended and single-choice"),
      " formats to evaluate ",
      h("leadership, teamwork, and conflict resolution"),
      ".",
    ],
  },
  {
    label: "User Research",
    icon: Search,
    segments: [
      "Conduct ",
      h("user research interviews"),
      " with ",
      h("6"),
      " ",
      h("open-ended"),
      " questions to understand ",
      h("product usage patterns, pain points, and unmet user needs"),
      ".",
    ],
  },
  {
    label: "Screening Call",
    icon: Briefcase,
    segments: [
      "Design a ",
      h("screening call"),
      " with ",
      h("5"),
      " questions mixing ",
      h("open-ended, single-choice, and coding"),
      " to quickly evaluate ",
      h("technical fundamentals and communication skills"),
      ".",
    ],
  },
  {
    label: "Case Study",
    icon: BrainCircuit,
    segments: [
      "Design a ",
      h("case study interview"),
      " with ",
      h("4"),
      " questions including ",
      h("whiteboard, multiple-choice, and open-ended"),
      " problem analysis.",
    ],
  },
  {
    label: "Expert Interview",
    icon: MessageSquareText,
    segments: [
      "Conduct an ",
      h("expert interview"),
      " with ",
      h("5"),
      " ",
      h("open-ended and research"),
      " questions to explore ",
      h("domain expertise, industry trends, and strategic recommendations"),
      " for the ",
      h("AI industry"),
      ".",
    ],
  },
];

export function AIGenerator({ projectId }: { projectId?: string } = {}) {
  const router = useRouter();
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const [description, setDescription] = useState("");
  const [activeTemplate, setActiveTemplate] = useState<number | null>(null);
  const [hlRanges, setHlRanges] = useState<HLRange[]>([]);
  const prevDescRef = useRef("");
  const [duration, setDuration] = useState("20");
  const [chatEnabled, setChatEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [aiTone, setAiTone] = useState<"CASUAL" | "PROFESSIONAL" | "FORMAL" | "FRIENDLY">("FRIENDLY");
  const [followUpDepth, setFollowUpDepth] = useState<"LIGHT" | "MODERATE" | "DEEP">("MODERATE");
  const [language, setLanguage] = useState("en");
  const [antiCheatingEnabled, setAntiCheatingEnabled] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [streamPhase, setStreamPhase] = useState<"idle" | "thinking" | "writing">("idle");
  const [thinkingText, setThinkingText] = useState("");
  const [contentText, setContentText] = useState("");
  const thinkingRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const streamEndRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<GeneratedInterview | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable state (separate from result so edits don't mutate original)
  const [editableCriteria, setEditableCriteria] = useState<AssessmentCriterion[]>([]);
  const [editableQuestions, setEditableQuestions] = useState<GeneratedQuestion[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingCriterionIndex, setEditingCriterionIndex] = useState<number | null>(null);
  const criterionSnapshotRef = useRef<AssessmentCriterion | null>(null);

  // AI feedback refinement
  const [feedback, setFeedback] = useState("");
  const [refining, setRefining] = useState(false);

  // Auto-scroll streaming panels to bottom and keep card in viewport
  useEffect(() => {
    if (thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
    streamEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [thinkingText]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
    streamEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [contentText]);

  const createMutation = trpc.interview.create.useMutation();
  const createQuestionMutation = trpc.question.create.useMutation();

  /** Consume an SSE stream from generate/refine and return parsed data. */
  const consumeStream = async (response: Response): Promise<GeneratedInterview> => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: GeneratedInterview | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = JSON.parse(line.slice(6));
        if (payload.type === "thinking") {
          setStreamPhase("thinking");
          if (payload.text) {
            setThinkingText((prev) => prev + payload.text);
          }
        } else if (payload.type === "content") {
          setStreamPhase("writing");
          if (payload.text) {
            setContentText((prev) => prev + payload.text);
          }
        } else if (payload.type === "done") {
          result = payload.data as GeneratedInterview;
        } else if (payload.type === "error") {
          throw new Error(payload.message);
        }
      }
    }
    if (!result) throw new Error("No result received");
    return result;
  };

  const handleGenerate = async () => {
    if (!description.trim()) return;

    setGenerating(true);
    setStreamPhase("idle");
    setThinkingText("");
    setContentText("");
    setResult(null);
    setEditableCriteria([]);
    setEditableQuestions([]);
    setEditingIndex(null);
    setEditingCriterionIndex(null);
    setFeedback("");

    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          durationMinutes: Number(duration) || 20,
          language: LANGUAGES.find((l) => l.value === language)?.label ?? language,
          organizationId: currentOrg?.id,
          projectId,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || "Generation failed");
      }

      const data = await consumeStream(response);
      setResult(data);
      setEditableCriteria(data.assessmentCriteria ?? []);
      setEditableQuestions(data.questions.map((q, i) => ({
        ...q,
        order: i + 1,
        starterCode: q.starterCode
          ? { ...q.starterCode, language: q.starterCode.language.toLowerCase() }
          : undefined,
      })));
    } catch {
      toast({ title: "Generation failed", description: "Please try again or create the interview manually.", variant: "destructive" });
    } finally {
      setGenerating(false);
      setStreamPhase("idle");
    }
  };

  const handleRefine = async () => {
    if (!result || !feedback.trim()) return;

    setRefining(true);
    setStreamPhase("idle");
    setThinkingText("");
    setContentText("");
    try {
      const response = await fetch("/api/ai/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interview: {
            title: result.title,
            description: result.description,
            objective: result.objective,
            assessmentCriteria: editableCriteria,
            questions: editableQuestions.map((q) => ({ text: q.text, type: q.type })),
          },
          feedback,
          language: LANGUAGES.find((l) => l.value === language)?.label ?? language,
          organizationId: currentOrg?.id,
          projectId,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || "Refinement failed");
      }

      const data = await consumeStream(response);
      setResult(data);
      setEditableCriteria(data.assessmentCriteria ?? []);
      setEditableQuestions(data.questions.map((q, i) => ({
        ...q,
        order: i + 1,
        starterCode: q.starterCode
          ? { ...q.starterCode, language: q.starterCode.language.toLowerCase() }
          : undefined,
      })));
      setFeedback("");
      setEditingIndex(null);
      setEditingCriterionIndex(null);
      toast({ title: "Interview refined based on your feedback!" });
    } catch {
      toast({ title: "Refinement failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setRefining(false);
      setStreamPhase("idle");
    }
  };

  const handleAccept = async () => {
    if (!result || editableQuestions.length === 0) return;

    setSaving(true);
    try {
      const interview = await createMutation.mutateAsync({
        projectId,
        title: result.title,
        description: result.description,
        objective: result.objective,
        assessmentCriteria: editableCriteria.length > 0 ? editableCriteria : undefined,
        chatEnabled,
        voiceEnabled,
        videoEnabled,
        language,
        aiTone,
        aiName: result.recommendedSettings.aiName,
        followUpDepth,
        antiCheatingEnabled,
        timeLimitMinutes: Number(duration) || undefined,
      });

      await Promise.all(
        editableQuestions.map((q, i) =>
          createQuestionMutation.mutateAsync({
            interviewId: interview.id,
            order: i,
            text: q.text,
            type: q.type as "OPEN_ENDED" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "CODING" | "WHITEBOARD" | "RESEARCH",
            description: q.description ?? undefined,
            timeLimitSeconds: q.timeLimitSeconds ?? undefined,
            isRequired: q.isRequired ?? true,
            options: q.options ?? undefined,
            followUpPrompts: q.followUpPrompts ?? undefined,
            starterCode: q.type === "CODING" && q.starterCode ? q.starterCode : undefined,
          })
        )
      );

      toast({ title: "Interview created!" });
      router.push(`/interviews/${interview.id}/edit/sessions`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error saving interview", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Question editing helpers
  const updateQuestion = useCallback(
    (index: number, updates: Partial<GeneratedQuestion>) => {
      setEditableQuestions((prev) =>
        prev.map((q, i) => (i === index ? { ...q, ...updates } : q))
      );
    },
    []
  );

  const deleteQuestion = useCallback((index: number) => {
    setEditableQuestions((prev) =>
      prev.filter((_, i) => i !== index).map((q, i) => ({ ...q, order: i + 1 }))
    );
    setEditingIndex(null);
  }, []);

  const [importOpen, setImportOpen] = useState(false);

  const addQuestion = useCallback(() => {
    const newQ: GeneratedQuestion = {
      order: editableQuestions.length + 1,
      text: "",
      type: "OPEN_ENDED",
      description: "",
      isRequired: true,
      timeLimitSeconds: undefined,
      followUpPrompts: [],
    };
    setEditableQuestions((prev) => [...prev, newQ]);
    setEditingIndex(editableQuestions.length);
  }, [editableQuestions.length]);

  // Drag-and-drop state
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = "move";
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex) {
      dragIndexRef.current = null;
      setDragOverIndex(null);
      return;
    }
    setEditableQuestions((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(dropIndex, 0, moved);
      return next.map((q, i) => ({ ...q, order: i + 1 }));
    });
    setEditingIndex((prev) => {
      if (prev === null) return null;
      if (prev === fromIndex) return dropIndex;
      // Shift editing index if it was between from and drop
      if (fromIndex < dropIndex && prev > fromIndex && prev <= dropIndex) return prev - 1;
      if (fromIndex > dropIndex && prev >= dropIndex && prev < fromIndex) return prev + 1;
      return prev;
    });
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  return (
    <div className="space-y-6">
      {/* Generator input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Interview Generator
          </CardTitle>
          <CardDescription>
            Describe your goal in natural language and AI will create a complete
            interview structure for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2" data-tour="interview-prompt">
            <Label htmlFor="ai-description">What kind of interview do you need?</Label>
            {(() => {
              const segments = hlRanges.length ? segmentsFromRanges(description, hlRanges) : null;
              const hasHL = segments?.some((s) => typeof s !== "string") ?? false;
              return (
                <>
                  <div className="relative">
                    <Textarea
                      id="ai-description"
                      placeholder="e.g. I want to assess senior React developers for our fintech startup, focusing on system design and problem-solving skills..."
                      value={description}
                      onChange={(e) => {
                        const next = e.target.value;
                        setHlRanges((prev) => adjustRanges(prev, prevDescRef.current, next));
                        prevDescRef.current = next;
                        setDescription(next);
                        setActiveTemplate(null);
                      }}
                      rows={4}
                      className={hasHL ? "text-transparent caret-foreground selection:bg-primary/20" : ""}
                    />
                    {hasHL && segments && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words border border-transparent px-3 py-2 text-sm leading-normal"
                      >
                        {segments.map((seg, j) =>
                          typeof seg === "string" ? (
                            <span key={j}>{seg}</span>
                          ) : (
                            <mark
                              key={j}
                              style={{ backgroundColor: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))", borderRadius: "3px", boxShadow: "-3px 0 0 hsl(var(--primary) / 0.12), 3px 0 0 hsl(var(--primary) / 0.12)", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}
                            >
                              {seg.text}
                            </mark>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PROMPT_TEMPLATES.map((t, i) => (
                      <button
                        key={t.label}
                        type="button"
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                          activeTemplate === i
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                        onClick={() => {
                          const text = templateToText(t.segments);
                          setDescription(text);
                          prevDescRef.current = text;
                          setActiveTemplate(i);
                          setHlRanges(rangesFromSegments(t.segments));
                        }}
                      >
                        <t.icon className="h-3 w-3" />
                        {t.label}
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (min)</Label>
              <Input
                id="duration"
                type="number"
                min={5}
                max={120}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tone</Label>
              <Select value={aiTone} onValueChange={(v) => setAiTone(v as typeof aiTone)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Follow-up Depth</Label>
              <Select value={followUpDepth} onValueChange={(v) => setFollowUpDepth(v as typeof followUpDepth)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOW_UP_DEPTHS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label} ({d.description})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Communication Channels</Label>
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Chat</Label>
                    <p className="text-xs text-muted-foreground">Text messaging</p>
                  </div>
                </div>
                <Switch
                  checked={chatEnabled}
                  onCheckedChange={(v) => {
                    if (!v && !voiceEnabled) return;
                    setChatEnabled(v);
                  }}
                />
              </div>
              <div className="border-t" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Voice</Label>
                    <p className="text-xs text-muted-foreground">Speech conversation</p>
                  </div>
                </div>
                <Switch
                  checked={voiceEnabled}
                  onCheckedChange={(v) => {
                    if (!v && !chatEnabled) return;
                    setVoiceEnabled(v);
                    if (!v) setVideoEnabled(false);
                  }}
                />
              </div>
              <div className="border-t" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Video</Label>
                    <p className="text-xs text-muted-foreground">Camera &amp; screen recording</p>
                  </div>
                </div>
                <Switch
                  checked={videoEnabled}
                  disabled={!voiceEnabled}
                  onCheckedChange={setVideoEnabled}
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Anti-Cheating Mode</Label>
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Enable Anti-Cheating</Label>
                    <p className="text-xs text-muted-foreground">
                      Requires camera, mic & screen sharing. Monitors tab switches, blocks external paste, and detects multiple screens
                    </p>
                  </div>
                </div>
                <Switch
                  checked={antiCheatingEnabled}
                  onCheckedChange={setAntiCheatingEnabled}
                />
              </div>
              {antiCheatingEnabled && (
                <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="font-medium">When enabled, interviewees will experience:</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    <li>Camera, microphone, and screen sharing will be mandatory (cannot be skipped)</li>
                    <li>Tab switching and window focus loss will be tracked and flagged</li>
                    <li>Pasting content from outside the interview page will be blocked</li>
                    <li>Multiple monitor setups will be detected and warned against</li>
                  </ul>
                  <p className="mt-1.5 text-amber-700 dark:text-amber-300">
                    Candidates will be informed of these restrictions before starting.
                  </p>
                </div>
              )}
            </div>
          </div>
          <AiButton
            wrapperClassName="w-full"
            className="w-full"
            data-tour="generate-interview"
            loading={generating}
            disabled={!description.trim()}
            onClick={handleGenerate}
          >
            {!generating && <Sparkles className="mr-2 h-4 w-4" />}
            {generating
              ? streamPhase === "thinking"
                ? "Thinking..."
                : streamPhase === "writing"
                  ? "Writing..."
                  : "Generating..."
              : "Generate Interview"}
          </AiButton>
        </CardContent>
      </Card>

      {/* Streaming display (generation only — refine stream is rendered inside the result card) */}
      {generating && (thinkingText || contentText) && (
        <Card className="border-dashed">
          <CardContent className="space-y-3 pt-4 pb-3">
            {/* Thinking section */}
            {thinkingText && (
              <div>
                <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  {streamPhase === "thinking" && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  <span>{streamPhase === "thinking" ? "Thinking..." : "Thinking complete"}</span>
                </div>
                <div
                  ref={thinkingRef}
                  className={cn(
                    "overflow-y-auto rounded-md bg-muted/50 px-3 py-2 code-scrollbar",
                    streamPhase === "thinking" ? "max-h-40" : "max-h-20"
                  )}
                >
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {thinkingText}
                  </p>
                </div>
              </div>
            )}
            {/* Content / writing section */}
            {contentText && (
              <div>
                <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  {streamPhase === "writing" && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  <span>{streamPhase === "writing" ? "Writing interview..." : "Finalizing..."}</span>
                </div>
                <div ref={contentRef} className="max-h-40 overflow-y-auto rounded-md bg-muted/50 px-3 py-2 code-scrollbar">
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {contentText}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
          <div ref={streamEndRef} />
        </Card>
      )}

      {/* Generated result — editable */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle>{result.title}</CardTitle>
            <CardDescription>{result.objective}</CardDescription>
            <div className="flex gap-2 pt-2">
              {chatEnabled && <Badge>Chat</Badge>}
              {voiceEnabled && <Badge>Voice</Badge>}
              {videoEnabled && <Badge>Video</Badge>}
              <Badge variant="outline">{aiTone}</Badge>
              <Badge variant="secondary">
                ~{result.estimatedDurationMinutes} min
              </Badge>
              <Badge variant="secondary">
                {editableQuestions.length} questions
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Questions sub-section */}
            <div className="space-y-3">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <ListOrdered className="h-4 w-4" />
                Questions ({editableQuestions.length})
              </Label>
              <div className="space-y-1">
                {editableQuestions.map((q, i) => (
                  <QuestionCard
                    key={`q-${i}`}
                    data={q}
                    index={i}
                    editing={editingIndex === i}
                    onStartEdit={() => setEditingIndex(i)}
                    onSave={(updated) => {
                      updateQuestion(i, updated as Partial<GeneratedQuestion>);
                      setEditingIndex(null);
                    }}
                    onCancel={() => setEditingIndex(null)}
                    onDelete={() => deleteQuestion(i)}
                    dragProps={{
                      draggable: editingIndex !== i,
                      onDragStart: (e) => handleDragStart(e, i),
                      onDragOver: (e) => handleDragOver(e, i),
                      onDragLeave: handleDragLeave,
                      onDrop: (e) => handleDrop(e, i),
                      onDragEnd: handleDragEnd,
                    }}
                    className={cn(
                      dragOverIndex === i && dragIndexRef.current !== i
                        ? "border-primary bg-primary/5"
                        : "",
                      dragIndexRef.current === i && "opacity-50",
                    )}
                  />
                ))}
              </div>

              {/* Add question */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addQuestion}
                  className="flex-1 border-dashed"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add New
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 border-dashed"
                  onClick={() => setImportOpen(true)}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Import Existing
                </Button>
              </div>
            </div>

            {/* Import Questions Dialog */}
            <ImportDialog
              open={importOpen}
              onOpenChange={setImportOpen}
              onImport={(imported) => {
                setEditableQuestions((prev) => [
                  ...prev,
                  ...imported.map((q, i) => ({
                    ...q,
                    order: prev.length + i + 1,
                  })),
                ]);
                toast({ title: `${imported.length} question${imported.length > 1 ? "s" : ""} imported` });
              }}
              existingTexts={editableQuestions.map((q) => q.text)}
            />

            {/* Divider */}
            <div className="border-t" />

            {/* Assessment Criteria sub-section */}
            <div className="space-y-3">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <Target className="h-4 w-4" />
                Assessment Criteria ({editableCriteria.length})
              </Label>
              <div className="space-y-1.5">
                {editableCriteria.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    No assessment criteria defined yet.
                  </p>
                ) : (
                  editableCriteria.map((c, i) => (
                    <div key={i} className={`group flex items-start gap-2 rounded-md border px-3 py-2 transition-all ${editingCriterionIndex !== i ? "hover:border-primary/30" : ""}`}>
                      {editingCriterionIndex === i ? (
                        <div className="flex-1 space-y-2">
                          <Input
                            value={c.name}
                            onChange={(e) =>
                              setEditableCriteria((prev) =>
                                prev.map((cr, idx) => idx === i ? { ...cr, name: e.target.value } : cr)
                              )
                            }
                            placeholder="Criterion name..."
                            className="h-8 text-sm font-medium"
                            autoFocus
                          />
                          <Textarea
                            value={c.description}
                            onChange={(e) =>
                              setEditableCriteria((prev) =>
                                prev.map((cr, idx) => idx === i ? { ...cr, description: e.target.value } : cr)
                              )
                            }
                            placeholder="What this criterion measures..."
                            rows={2}
                            className="resize-y text-sm"
                          />
                          <div className="flex justify-end gap-2">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="mr-1 h-3 w-3" />
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete criterion?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently remove this assessment criterion. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => {
                                      setEditableCriteria((prev) => prev.filter((_, idx) => idx !== i));
                                      setEditingCriterionIndex(null);
                                      criterionSnapshotRef.current = null;
                                    }}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-foreground/50 hover:bg-foreground/5"
                              onClick={() => {
                                const snapshot = criterionSnapshotRef.current;
                                criterionSnapshotRef.current = null;
                                if (snapshot) {
                                  setEditableCriteria((prev) =>
                                    prev.map((cr, idx) =>
                                      idx === i ? snapshot : cr,
                                    ),
                                  );
                                } else {
                                  setEditableCriteria((prev) =>
                                    prev.filter((_, idx) => idx !== i),
                                  );
                                }
                                setEditingCriterionIndex(null);
                              }}
                            >
                              <X className="mr-1 h-3 w-3" />
                              Cancel
                            </Button>
                            <Button size="sm" onClick={() => {
                              criterionSnapshotRef.current = null;
                              setEditingCriterionIndex(null);
                            }}>
                              <Check className="mr-1 h-3 w-3" />
                              Done
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div
                            className="flex-1 cursor-pointer"
                            onClick={() => {
                              criterionSnapshotRef.current = structuredClone(editableCriteria[i]);
                              setEditingCriterionIndex(i);
                            }}
                          >
                            <p className="text-sm font-medium">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.description}</p>
                          </div>
                          <div className="flex flex-col gap-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              className="p-0.5 text-muted-foreground/80 hover:text-foreground transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                criterionSnapshotRef.current = structuredClone(editableCriteria[i]);
                                setEditingCriterionIndex(i);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button
                                  type="button"
                                  className="p-0.5 text-muted-foreground/80 hover:text-destructive transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete criterion?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently remove this assessment criterion. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => {
                                      setEditableCriteria((prev) => prev.filter((_, idx) => idx !== i));
                                      setEditingCriterionIndex(null);
                                      criterionSnapshotRef.current = null;
                                    }}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full border-dashed"
                onClick={() => {
                  setEditableCriteria((prev) => [...prev, { name: "", description: "" }]);
                  setEditingCriterionIndex(editableCriteria.length);
                }}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Criterion
              </Button>
            </div>

            {/* Divider */}
            <div className="border-t" />

            {/* AI feedback refinement */}
            <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <MessageSquareText className="h-4 w-4" />
                Refine with AI
              </Label>
              <p className="text-xs text-muted-foreground">
                Describe what you&apos;d like to change and AI will update the questions.
              </p>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder='e.g. "Make the questions harder", "Add more behavioral questions", "Remove the ice-breaker"...'
                rows={2}
                className="resize-none bg-background"
              />
              <AiButton
                wrapperClassName="w-fit"
                size="sm"
                loading={refining}
                disabled={!feedback.trim()}
                onClick={handleRefine}
              >
                {!refining && <Sparkles className="mr-2 h-3.5 w-3.5" />}
                {refining
                  ? streamPhase === "thinking"
                    ? "Thinking..."
                    : streamPhase === "writing"
                      ? "Writing..."
                      : "Refining..."
                  : "Refine Questions"}
              </AiButton>

              {/* Refine streaming display */}
              {refining && (thinkingText || contentText) && (
                <Card className="border-dashed">
                  <CardContent className="space-y-3 pt-4 pb-3">
                    {thinkingText && (
                      <div>
                        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          {streamPhase === "thinking" && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          <span>{streamPhase === "thinking" ? "Thinking..." : "Thinking complete"}</span>
                        </div>
                        <div
                          ref={thinkingRef}
                          className={cn(
                            "overflow-y-auto rounded-md bg-muted/50 px-3 py-2 code-scrollbar",
                            streamPhase === "thinking" ? "max-h-40" : "max-h-20"
                          )}
                        >
                          <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                            {thinkingText}
                          </p>
                        </div>
                      </div>
                    )}
                    {contentText && (
                      <div>
                        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          {streamPhase === "writing" && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          <span>{streamPhase === "writing" ? "Writing interview..." : "Finalizing..."}</span>
                        </div>
                        <div ref={contentRef} className="max-h-40 overflow-y-auto rounded-md bg-muted/50 px-3 py-2 code-scrollbar">
                          <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                            {contentText}
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <div ref={streamEndRef} />
                </Card>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 border-t pt-4">
              <Button data-tour="accept-create" onClick={handleAccept} disabled={saving || editableQuestions.length === 0}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Accept & Create
              </Button>
              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={generating}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Import Dialog (local-state variant for Create Interview)           */
/* ------------------------------------------------------------------ */

function ImportDialog({
  open,
  onOpenChange,
  onImport,
  existingTexts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (questions: GeneratedQuestion[]) => void;
  existingTexts: string[];
}) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allQuestions = trpc.question.listAll.useQuery(
    { limit: 200 },
    { enabled: open },
  );

  const existing = useMemo(
    () => new Set(existingTexts.map((t) => t.toLowerCase())),
    [existingTexts],
  );

  const filteredQuestions = useMemo(() => {
    let result = (allQuestions.data?.questions ?? []).filter(
      (q) => !existing.has(q.text.toLowerCase()),
    );
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(
        (q) =>
          q.text.toLowerCase().includes(s) ||
          (q.description ?? "").toLowerCase().includes(s) ||
          q.interview.title.toLowerCase().includes(s),
      );
    }
    return result;
  }, [allQuestions.data, existing, search]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = () => {
    const selected = filteredQuestions.filter((q) => selectedIds.has(q.id));
    const mapped: GeneratedQuestion[] = selected.map((q) => ({
      order: 0,
      text: q.text,
      type: q.type as GeneratedQuestion["type"],
      description: q.description ?? "",
      isRequired: true,
      options: q.options as GeneratedQuestion["options"],
      starterCode: q.starterCode as GeneratedQuestion["starterCode"],
    }));
    onImport(mapped);
    setSelectedIds(new Set());
    setSearch("");
    onOpenChange(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setSelectedIds(new Set());
      setSearch("");
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Existing Questions</DialogTitle>
          <DialogDescription>
            Select questions from your existing interviews to add here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search questions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="max-h-[400px] overflow-y-auto rounded-lg border code-scrollbar">
            {allQuestions.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredQuestions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {search.trim()
                  ? "No questions match your search."
                  : "No questions available to import."}
              </p>
            ) : (
              <div className="divide-y">
                {filteredQuestions.map((q) => {
                  const style =
                    QUESTION_TYPE_STYLES[q.type] ??
                    QUESTION_TYPE_STYLES.OPEN_ENDED;
                  const TypeIcon = style.icon;
                  return (
                    <label
                      key={q.id}
                      className="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedIds.has(q.id)}
                        onCheckedChange={() => toggleSelect(q.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug">
                          {q.text}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", style.badgeClass)}
                          >
                            <TypeIcon className="mr-0.5 h-2.5 w-2.5" />
                            {style.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {q.interview.title}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={selectedIds.size === 0}
          >
            <Copy className="mr-2 h-4 w-4" />
            Import ({selectedIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
