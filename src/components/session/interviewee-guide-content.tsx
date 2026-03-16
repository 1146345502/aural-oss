"use client";

import { cn } from "@/lib/utils";
import {
    Code2,
    MessageSquare,
    Mic,
    MicOff,
    PenLine,
    PhoneOff,
    SkipBack,
    SkipForward,
    Volume2,
} from "lucide-react";

interface GuideItem {
  title: string;
  description: string;
  illustration: React.ReactNode;
}

function VoiceAreaIllustration() {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 text-primary">
          <Volume2 className="h-5 w-5 animate-pulse" />
          <span className="text-xs font-medium">AI is speaking...</span>
        </div>
        <div className="flex items-center gap-[2px]">
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-primary/60"
              style={{ height: `${6 + (i % 3) * 8}px` }}
            />
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">
          Speak naturally — AI responds automatically
        </span>
      </div>
    </div>
  );
}

function MicControlIllustration() {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-500 text-white">
            <Mic className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-medium text-secondary-600">Unmuted</span>
        </div>
        <div className="text-xs text-muted-foreground">→</div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <MicOff className="h-4 w-4" />
          </div>
          <span className="text-[10px] text-muted-foreground">Muted</span>
        </div>
      </div>
    </div>
  );
}

function ChatChannelIllustration() {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <MessageSquare className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-medium">Chat</span>
        </div>
        <div className="w-36 rounded-lg border bg-card p-2">
          <div className="mb-1 text-[9px] font-medium text-muted-foreground">Chat Panel</div>
          <div className="space-y-1">
            <div className="rounded bg-muted px-1.5 py-0.5 text-[8px]">Type messages here...</div>
            <div className="rounded bg-primary/10 px-1.5 py-0.5 text-[8px] text-primary">AI responds in text</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolsIllustration() {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground">
            <PenLine className="h-4 w-4" />
          </div>
          <span className="text-[10px]">Whiteboard</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground">
            <Code2 className="h-4 w-4" />
          </div>
          <span className="whitespace-nowrap text-[10px]">Code Editor</span>
        </div>
        <div className="ml-2 w-28 rounded border bg-card p-1.5">
          <div className="mb-1 h-1 w-12 rounded bg-muted-foreground/20" />
          <div className="space-y-0.5">
            <div className="h-1 w-full rounded bg-muted-foreground/10" />
            <div className="h-1 w-20 rounded bg-muted-foreground/10" />
            <div className="h-1 w-24 rounded bg-muted-foreground/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TranscriptIllustration() {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="w-48 rounded-lg border bg-card p-2.5">
        <div className="mb-2 text-[9px] font-semibold text-muted-foreground">Transcript</div>
        <div className="space-y-1.5">
          <div className="flex items-start gap-1">
            <Volume2 className="mt-0.5 h-2.5 w-2.5 shrink-0 text-primary" />
            <div className="text-[8px]"><span className="font-medium text-primary">AI:</span> Tell me about yourself</div>
          </div>
          <div className="flex items-start gap-1">
            <Mic className="mt-0.5 h-2.5 w-2.5 shrink-0 text-secondary-500" />
            <div className="text-[8px]"><span className="font-medium text-secondary-600">You:</span> I have 5 years of...</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavigationIllustration() {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <SkipBack className="h-3.5 w-3.5" />
          </div>
          <span className="text-[9px]">Previous</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <SkipForward className="h-3.5 w-3.5" />
          </div>
          <span className="text-[9px]">Next</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <PhoneOff className="h-3.5 w-3.5" />
          </div>
          <span className="text-[9px]">End</span>
        </div>
        <div className="ml-2 flex flex-col gap-1">
          <div className="h-1.5 w-20 rounded-full bg-muted">
            <div className="h-full w-8 rounded-full bg-primary" />
          </div>
          <span className="text-[9px] text-muted-foreground">Q1 / 5</span>
        </div>
      </div>
    </div>
  );
}

function ChatQuestionIllustration() {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="w-48 space-y-1.5">
        <div className="rounded-2xl bg-muted px-3 py-2 text-[9px]">
          Tell me about a time when you had to solve a complex problem.
        </div>
        <div className="ml-auto w-36 rounded-2xl bg-primary px-3 py-2 text-[9px] text-primary-foreground">
          In my previous role, I...
        </div>
        <div className="flex items-center gap-1">
          <div className="h-0.5 w-0.5 animate-bounce rounded-full bg-muted-foreground/50" />
          <div className="h-0.5 w-0.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
          <div className="h-0.5 w-0.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

function ChatInputIllustration() {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="w-52 rounded-lg border bg-card p-2">
        <div className="flex items-end gap-1.5">
          <div className="flex-1 rounded-md border bg-background px-2 py-1.5 text-[9px] text-muted-foreground">
            Type your response...
          </div>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4 20-7z"/></svg>
          </div>
        </div>
        <div className="mt-1.5 text-[8px] text-muted-foreground">Press Enter to send</div>
      </div>
    </div>
  );
}

function ChatProgressIllustration() {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="w-48 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium">Interview Progress</span>
          <span className="rounded border px-1.5 py-0.5 text-[9px] font-medium">Q2/5</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div className="h-full w-2/5 rounded-full bg-primary transition-all" />
        </div>
        <div className="text-[8px] text-muted-foreground">40% complete</div>
      </div>
    </div>
  );
}

export function getVoiceGuideItems(): GuideItem[] {
  return [
    {
      title: "Your AI Interviewer",
      description:
        "The center area shows the AI interviewer status. It speaks to you and listens to your responses in real time.",
      illustration: <VoiceAreaIllustration />,
    },
    {
      title: "Microphone Control",
      description:
        "Click the mic button to mute or unmute. Speak naturally when unmuted — the AI will respond automatically.",
      illustration: <MicControlIllustration />,
    },
    {
      title: "Text Chat Channel",
      description:
        "Prefer typing? Toggle the chat panel to send text messages alongside the voice conversation.",
      illustration: <ChatChannelIllustration />,
    },
    {
      title: "Whiteboard & Code Editor",
      description:
        "Use the Whiteboard for diagrams or the Code Editor for coding questions. They open as side panels.",
      illustration: <ToolsIllustration />,
    },
    {
      title: "Conversation Transcript",
      description:
        "Your full conversation transcript appears on the right. Use it to review what was said.",
      illustration: <TranscriptIllustration />,
    },
    {
      title: "Question Navigation",
      description:
        "Use Previous/Next to navigate between questions. The progress bar shows how far along you are. Click End when finished.",
      illustration: <NavigationIllustration />,
    },
  ];
}

export function getChatGuideItems(): GuideItem[] {
  return [
    {
      title: "Chat with the AI",
      description:
        "Questions appear as chat messages. The AI will guide you through each one and may ask follow-ups based on your answers.",
      illustration: <ChatQuestionIllustration />,
    },
    {
      title: "Type Your Response",
      description:
        "Type your answer in the text box and press Enter or click Send. Take your time to compose thoughtful responses.",
      illustration: <ChatInputIllustration />,
    },
    {
      title: "Whiteboard & Code Editor",
      description:
        "Use the Whiteboard for diagrams or the Code Editor for coding questions. They appear above the chat area.",
      illustration: <ToolsIllustration />,
    },
    {
      title: "Track Your Progress",
      description:
        "The progress bar and question counter show how far along you are. Use the back arrow to revisit previous questions.",
      illustration: <ChatProgressIllustration />,
    },
  ];
}

const STEP_ILLUSTRATION_MAP: Record<string, React.ReactNode> = {
  "voice-status": <VoiceAreaIllustration />,
  "voice-mic": <MicControlIllustration />,
  "voice-chat": <ChatChannelIllustration />,
  "voice-tools": <ToolsIllustration />,
  "voice-transcript": <TranscriptIllustration />,
  "voice-progress": <NavigationIllustration />,
  "chat-question": <ChatQuestionIllustration />,
  "chat-input": <ChatInputIllustration />,
  "chat-tools": <ToolsIllustration />,
  "chat-progress": <ChatProgressIllustration />,
  "chat-timer": <NavigationIllustration />,
};

export function getStepIllustration(stepId: string): React.ReactNode | null {
  return STEP_ILLUSTRATION_MAP[stepId] ?? null;
}

export function GuideStepCard({
  item,
  index,
  compact = false,
}: {
  item: GuideItem;
  index: number;
  compact?: boolean;
}) {
  return (
    <div className={cn(
      "overflow-hidden rounded-lg",
      compact ? "border bg-card p-3" : "p-0",
    )}>
      {!compact && item.illustration}
      <div className={cn("flex items-start gap-3", !compact && "mt-3")}>
        <div className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold",
          compact ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-xs",
        )}>
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("font-semibold", compact ? "text-xs" : "text-sm")}>
            {item.title}
          </p>
          <p className={cn(
            "mt-0.5 leading-relaxed text-muted-foreground",
            compact ? "text-[11px]" : "text-xs",
          )}>
            {item.description}
          </p>
        </div>
      </div>
    </div>
  );
}
