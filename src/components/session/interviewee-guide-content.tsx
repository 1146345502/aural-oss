"use client";

import { getDictionary, type LangKey } from "@/locales";
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

function VoiceAreaIllustration({ lang = "en" }: { lang?: LangKey }) {
  const t = getDictionary(lang);
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 text-primary">
          <Volume2 className="h-5 w-5 animate-pulse" />
          <span className="text-xs font-medium">{t.guideContent.aiIsSpeaking}</span>
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
          {t.guideContent.speakNaturally}
        </span>
      </div>
    </div>
  );
}

function MicControlIllustration({ lang = "en" }: { lang?: LangKey }) {
  const t = getDictionary(lang);
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-500 text-white">
            <Mic className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-medium text-secondary-600">{t.guideContent.unmuted}</span>
        </div>
        <div className="text-xs text-muted-foreground">→</div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <MicOff className="h-4 w-4" />
          </div>
          <span className="text-[10px] text-muted-foreground">{t.guideContent.muted}</span>
        </div>
      </div>
    </div>
  );
}

function ChatChannelIllustration({ lang = "en" }: { lang?: LangKey }) {
  const t = getDictionary(lang);
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <MessageSquare className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-medium">{t.guideContent.chat}</span>
        </div>
        <div className="w-36 rounded-lg border bg-card p-2">
          <div className="mb-1 text-[9px] font-medium text-muted-foreground">{t.guideContent.chatPanel}</div>
          <div className="space-y-1">
            <div className="rounded bg-muted px-1.5 py-0.5 text-[8px]">{t.guideContent.typeMessagesHere}</div>
            <div className="rounded bg-primary/10 px-1.5 py-0.5 text-[8px] text-primary">{t.guideContent.aiRespondsInText}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolsIllustration({ lang = "en" }: { lang?: LangKey }) {
  const t = getDictionary(lang);
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground">
            <PenLine className="h-4 w-4" />
          </div>
          <span className="text-[10px]">{t.guideContent.whiteboard}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground">
            <Code2 className="h-4 w-4" />
          </div>
          <span className="whitespace-nowrap text-[10px]">{t.guideContent.codeEditor}</span>
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

function TranscriptIllustration({ lang = "en" }: { lang?: LangKey }) {
  const t = getDictionary(lang);
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="w-48 rounded-lg border bg-card p-2.5">
        <div className="mb-2 text-[9px] font-semibold text-muted-foreground">{t.guideContent.transcript}</div>
        <div className="space-y-1.5">
          <div className="flex items-start gap-1">
            <Volume2 className="mt-0.5 h-2.5 w-2.5 shrink-0 text-primary" />
            <div className="text-[8px]"><span className="font-medium text-primary">AI:</span> {t.guideContent.tellMeAboutYourself}</div>
          </div>
          <div className="flex items-start gap-1">
            <Mic className="mt-0.5 h-2.5 w-2.5 shrink-0 text-secondary-500" />
            <div className="text-[8px]"><span className="font-medium text-secondary-600">{t.guideContent.youLabel}</span> {t.guideContent.fiveYearsExperience}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavigationIllustration({ lang = "en" }: { lang?: LangKey }) {
  const t = getDictionary(lang);
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <SkipBack className="h-3.5 w-3.5" />
          </div>
          <span className="text-[9px]">{t.guideContent.previous}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <SkipForward className="h-3.5 w-3.5" />
          </div>
          <span className="text-[9px]">{t.guideContent.next}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <PhoneOff className="h-3.5 w-3.5" />
          </div>
          <span className="text-[9px]">{t.guideContent.end}</span>
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

function ChatQuestionIllustration({ lang = "en" }: { lang?: LangKey }) {
  const t = getDictionary(lang);
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="w-48 space-y-1.5">
        <div className="rounded-2xl bg-muted px-3 py-2 text-[9px]">
          {t.guideContent.sampleQuestion}
        </div>
        <div className="ml-auto w-36 rounded-2xl bg-primary px-3 py-2 text-[9px] text-primary-foreground">
          {t.guideContent.sampleAnswer}
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

function ChatInputIllustration({ lang = "en" }: { lang?: LangKey }) {
  const t = getDictionary(lang);
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="w-52 rounded-lg border bg-card p-2">
        <div className="flex items-end gap-1.5">
          <div className="flex-1 rounded-md border bg-background px-2 py-1.5 text-[9px] text-muted-foreground">
            {t.guideContent.typeYourResponse}
          </div>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4 20-7z"/></svg>
          </div>
        </div>
        <div className="mt-1.5 text-[8px] text-muted-foreground">{t.guideContent.pressEnterToSend}</div>
      </div>
    </div>
  );
}

function ChatProgressIllustration({ lang = "en" }: { lang?: LangKey }) {
  const t = getDictionary(lang);
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="w-48 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium">{t.guideContent.interviewProgress}</span>
          <span className="rounded border px-1.5 py-0.5 text-[9px] font-medium">Q2/5</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div className="h-full w-2/5 rounded-full bg-primary transition-all" />
        </div>
        <div className="text-[8px] text-muted-foreground">{t.guideContent.fortyPercentComplete}</div>
      </div>
    </div>
  );
}

export function getVoiceGuideItems(lang: LangKey = "en"): GuideItem[] {
  const t = getDictionary(lang);
  const items = t.guideContent.voiceItems;
  return [
    {
      title: items.voiceStatus.title,
      description: items.voiceStatus.description,
      illustration: <VoiceAreaIllustration lang={lang} />,
    },
    {
      title: items.voiceMic.title,
      description: items.voiceMic.description,
      illustration: <MicControlIllustration lang={lang} />,
    },
    {
      title: items.voiceChat.title,
      description: items.voiceChat.description,
      illustration: <ChatChannelIllustration lang={lang} />,
    },
    {
      title: items.voiceTools.title,
      description: items.voiceTools.description,
      illustration: <ToolsIllustration lang={lang} />,
    },
    {
      title: items.voiceTranscript.title,
      description: items.voiceTranscript.description,
      illustration: <TranscriptIllustration lang={lang} />,
    },
    {
      title: items.voiceProgress.title,
      description: items.voiceProgress.description,
      illustration: <NavigationIllustration lang={lang} />,
    },
  ];
}

export function getChatGuideItems(lang: LangKey = "en"): GuideItem[] {
  const t = getDictionary(lang);
  const items = t.guideContent.chatItems;
  return [
    {
      title: items.chatQuestion.title,
      description: items.chatQuestion.description,
      illustration: <ChatQuestionIllustration lang={lang} />,
    },
    {
      title: items.chatInput.title,
      description: items.chatInput.description,
      illustration: <ChatInputIllustration lang={lang} />,
    },
    {
      title: items.chatTools.title,
      description: items.chatTools.description,
      illustration: <ToolsIllustration lang={lang} />,
    },
    {
      title: items.chatProgress.title,
      description: items.chatProgress.description,
      illustration: <ChatProgressIllustration lang={lang} />,
    },
  ];
}

export function getStepIllustration(stepId: string, lang: LangKey = "en"): React.ReactNode | null {
  switch (stepId) {
    case "voice-status": return <VoiceAreaIllustration lang={lang} />;
    case "voice-mic": return <MicControlIllustration lang={lang} />;
    case "voice-chat": return <ChatChannelIllustration lang={lang} />;
    case "voice-tools": return <ToolsIllustration lang={lang} />;
    case "voice-transcript": return <TranscriptIllustration lang={lang} />;
    case "voice-progress": return <NavigationIllustration lang={lang} />;
    case "chat-question": return <ChatQuestionIllustration lang={lang} />;
    case "chat-input": return <ChatInputIllustration lang={lang} />;
    case "chat-tools": return <ToolsIllustration lang={lang} />;
    case "chat-progress": return <ChatProgressIllustration lang={lang} />;
    case "chat-timer": return <NavigationIllustration lang={lang} />;
    default: return null;
  }
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
