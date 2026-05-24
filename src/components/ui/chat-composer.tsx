"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RecordingWaveform } from "@/components/ui/recording-waveform";
import { Textarea } from "@/components/ui/textarea";
import {
  usePrepVoiceCapture,
  type PrepVoiceRecording,
} from "@/hooks/use-prep-voice-capture";
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Code2,
  Loader2,
  Mic,
  PenLine,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, type RefObject } from "react";

export type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (ctx?: { recording?: PrepVoiceRecording | null }) => void | Promise<void>;
  onStop?: () => void;
  isGenerating?: boolean;
  placeholder?: string;
  disabled?: boolean;
  submitDisabled?: boolean;
  minLength?: number;
  textareaRef?: RefObject<HTMLTextAreaElement>;
  className?: string;
  compact?: boolean;
  voice?: {
    language?: string;
    disabled?: boolean;
    pendingAudioUrl?: string | null;
    pendingAudioDurationMs?: number;
    onRecordingComplete?: (recording: PrepVoiceRecording) => void;
    onClearPendingAudio?: () => void;
    /** Runs in the mic click handler (user gesture) — use to unlock coach TTS playback. */
    onBeforeVoiceStart?: () => void;
  };
  footerLeft?: React.ReactNode;
  sessionActions?: {
    coachMuted?: boolean;
    onToggleCoachMute?: () => void;
    showCoachMute?: boolean;
    /** When true, coach voice is unavailable. */
    coachDisabled?: boolean;
    onFinish?: () => void;
    finishLoading?: boolean;
    finishDisabled?: boolean;
  };
  /** Blocks answer submit / voice input when grading cannot be afforded. */
  aiTokensBlocked?: {
    message: string;
  };
  questionNav?: {
    onBeforeNavigate?: () => void;
    onPrevious?: () => void;
    onNext?: () => void;
    canPrevious?: boolean;
    canNext?: boolean;
    disabled?: boolean;
  };
  aiTokenBalance?: {
    remaining: number;
    loading?: boolean;
  };
  sessionTools?: {
    whiteboardOpen?: boolean;
    onToggleWhiteboard?: () => void;
    codeOpen?: boolean;
    onToggleCode?: () => void;
    disabled?: boolean;
  };
};

const MIN_TEXTAREA_PX = 44;
const MAX_TEXTAREA_PX = 176;

function AiTokensPopover({
  remaining,
  loading,
}: {
  remaining: number;
  loading?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
          disabled={loading}
          aria-label="Model usage"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          Usage
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-[12rem] rounded-xl border border-border bg-card p-3 shadow-xl backdrop-blur-sm"
      >
        <div className="flex flex-col gap-2 text-left">
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              Available budget
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-semibold tabular-nums text-foreground leading-none">
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  remaining.toLocaleString()
                )}
              </span>
              <span className="text-[10px] text-muted-foreground">units</span>
            </div>
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground">
            Used for practice grading cards and suggested answers.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Unified chat input: auto-growing textarea + in-box toolbar (mic + send/stop).
 */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  isGenerating = false,
  placeholder = "Type your message...",
  disabled = false,
  submitDisabled,
  minLength = 1,
  textareaRef,
  className,
  compact = false,
  voice,
  footerLeft,
  sessionActions,
  questionNav,
  aiTokenBalance,
  aiTokensBlocked,
  sessionTools,
}: ChatComposerProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? internalRef;
  const trimmed = value.trim();
  const canSubmit =
    !submitDisabled && trimmed.length >= minLength && !disabled && !isGenerating;

  const voiceCapture = usePrepVoiceCapture({
    language: voice?.language,
    onTranscript: onChange,
    onRecordingComplete: voice?.onRecordingComplete,
  });
  const isRecording = voiceCapture.listening;

  const resizeTextarea = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, MIN_TEXTAREA_PX), MAX_TEXTAREA_PX);
    el.style.height = `${next}px`;
    el.style.overflowY =
      el.scrollHeight > MAX_TEXTAREA_PX || value.includes("\n") ? "auto" : "hidden";
  }, [ref, value]);

  useEffect(() => {
    const frame = requestAnimationFrame(resizeTextarea);
    return () => cancelAnimationFrame(frame);
  }, [resizeTextarea, isRecording]);

  const handlePrimary = async () => {
    if (isGenerating) {
      onStop?.();
      return;
    }
    let recording: PrepVoiceRecording | null = null;
    if (isRecording) {
      recording = await voiceCapture.stop({ notify: false });
      if (recording && voice?.onRecordingComplete) {
        await voice.onRecordingComplete(recording);
      }
    }
    const textOk =
      !submitDisabled && value.trim().length >= minLength && !disabled;
    if (textOk) {
      await onSubmit({ recording });
    }
  };

  const voiceDisabled = disabled || voice?.disabled || isGenerating;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-muted/30 shadow-sm",
        compact ? "p-2" : "p-3",
        className,
      )}
    >
      {voice?.pendingAudioUrl ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border bg-background/80 px-2 py-1.5">
          <audio
            controls
            src={voice.pendingAudioUrl}
            className="h-8 max-w-[min(100%,280px)] flex-1"
            preload="metadata"
          />
          {voice.pendingAudioDurationMs ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {Math.round(voice.pendingAudioDurationMs / 1000)}s
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={voice.onClearPendingAudio}
            aria-label="Remove recording"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
      {aiTokensBlocked ? (
        <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-left">
          <p className="min-w-0 flex-1 text-xs leading-snug text-destructive">
            {aiTokensBlocked.message}
          </p>
        </div>
      ) : null}
      <Textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            handlePrimary();
          }
        }}
        placeholder={
          aiTokensBlocked
            ? "Answer submission is unavailable right now..."
            : placeholder
        }
        disabled={disabled || Boolean(aiTokensBlocked) || (isGenerating && !onStop)}
        rows={1}
        className={cn(
          "resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
          "!min-h-0 text-sm leading-relaxed text-foreground",
          "placeholder:text-muted-foreground/60",
          "disabled:placeholder:text-muted-foreground/60",
          "overflow-y-auto code-scrollbar",
        )}
        style={{ minHeight: MIN_TEXTAREA_PX, maxHeight: MAX_TEXTAREA_PX }}
      />

      <div
        className={cn(
          "flex items-center justify-between gap-2 pt-1",
          isRecording && "pl-2",
        )}
      >
        {isRecording ? (
          <>
            <RecordingWaveform
              inline
              className="min-w-0 flex-1"
              level={voiceCapture.audioLevel}
              elapsedMs={voiceCapture.elapsedMs}
              onStop={() => void voiceCapture.stop()}
            />
            <Button
              type="button"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full"
              disabled={isGenerating ? !onStop : !canSubmit}
              onClick={handlePrimary}
              aria-label={isGenerating ? "Stop generation" : "Send message"}
            >
              {isGenerating ? (
                <Square className="h-3.5 w-3.5 fill-current" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          </>
        ) : (
          <>
        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-1">
          {footerLeft}
          {questionNav ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs"
                disabled={
                  questionNav.disabled ||
                  !questionNav.canPrevious ||
                  !questionNav.onPrevious
                }
                onClick={() => {
                  questionNav.onBeforeNavigate?.();
                  questionNav.onPrevious?.();
                }}
                onPointerDown={() => questionNav.onBeforeNavigate?.()}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs"
                disabled={
                  questionNav.disabled ||
                  !questionNav.canNext ||
                  !questionNav.onNext
                }
                onClick={() => {
                  questionNav.onBeforeNavigate?.();
                  questionNav.onNext?.();
                }}
                onPointerDown={() => questionNav.onBeforeNavigate?.()}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : null}
          {sessionActions?.onFinish ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
              disabled={sessionActions.finishDisabled || sessionActions.finishLoading}
              onClick={sessionActions.onFinish}
            >
              {sessionActions.finishLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              Finish
            </Button>
          ) : null}
          {sessionTools?.onToggleWhiteboard ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 gap-1 px-2 text-xs",
                sessionTools.whiteboardOpen
                  ? "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              disabled={sessionTools.disabled}
              onClick={sessionTools.onToggleWhiteboard}
            >
              <PenLine className="h-3.5 w-3.5" />
              Whiteboard
            </Button>
          ) : null}
          {sessionTools?.onToggleCode ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 gap-1 px-2 text-xs",
                sessionTools.codeOpen
                  ? "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              disabled={sessionTools.disabled}
              onClick={sessionTools.onToggleCode}
            >
              <Code2 className="h-3.5 w-3.5" />
              Code
            </Button>
          ) : null}
          {sessionActions?.showCoachMute ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
              onClick={sessionActions.onToggleCoachMute}
              disabled={
                sessionActions.finishLoading || sessionActions.coachDisabled
              }
              title={
                sessionActions.coachDisabled
                  ? "Coach voice is unavailable"
                  : undefined
              }
            >
              {sessionActions.coachMuted || sessionActions.coachDisabled ? (
                <VolumeX className="h-3.5 w-3.5" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
              {sessionActions.coachDisabled
                ? "Coach off"
                : sessionActions.coachMuted
                  ? "Muted"
                  : "Coach"}
            </Button>
          ) : null}
          {aiTokenBalance ? (
            <AiTokensPopover
              remaining={aiTokenBalance.remaining}
              loading={aiTokenBalance.loading}
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1" aria-hidden />
        <div className="flex shrink-0 items-center gap-1.5">
          {voice ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              disabled={voiceDisabled}
              onClick={() => {
                voice?.onBeforeVoiceStart?.();
                void voiceCapture.start(value);
              }}
              aria-label="Start voice input"
            >
              <Mic className="h-4 w-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon"
            className={cn(
              "h-8 w-8 rounded-full",
              isGenerating
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "",
            )}
            disabled={isGenerating ? !onStop : !canSubmit}
            onClick={handlePrimary}
            aria-label={isGenerating ? "Stop generation" : "Send message"}
          >
            {isGenerating ? (
              <Square className="h-3.5 w-3.5 fill-current" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
