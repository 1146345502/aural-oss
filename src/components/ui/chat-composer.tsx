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
import type { LucideIcon } from "lucide-react";
import {
    ArrowUp,
    ChevronLeft,
    ChevronRight,
    Code2,
    Coins,
    ExternalLink,
    Loader2,
    Mic,
    PenLine,
    Sparkles,
    Square,
    Volume2,
    VolumeX,
    X,
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useRef,
    type MutableRefObject,
    type RefObject,
} from "react";

/** Imperative handle for parents (e.g. start a speaking drill, focus input). */
export type ChatComposerControl = {
  startVoice: () => void;
  focusInput: () => void;
};

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
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  /** Receives an imperative control handle (voice start / focus). */
  controlRef?: MutableRefObject<ChatComposerControl | null>;
  className?: string;
  compact?: boolean;
  voice?: {
    language?: string;
    disabled?: boolean;
    dataTour?: string;
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
    /** When true, coach voice is unavailable (e.g. insufficient AI tokens). */
    coachDisabled?: boolean;
    onFinish?: () => void;
    finishLoading?: boolean;
    finishDisabled?: boolean;
  };
  /** Blocks answer submit / voice input when grading cannot be afforded. */
  aiTokensBlocked?: {
    message: string;
    billingHref?: string;
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
    included?: number;
    creditBalanceCents?: number;
    planTier?: string;
    loading?: boolean;
    href?: string;
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

function formatCreditDollars(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function AiTokensMetricRow({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-1.5 py-1 -mx-1.5",
        warn && "bg-amber-50/90 dark:bg-amber-950/35",
      )}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          warn
            ? "text-amber-600 dark:text-amber-400"
            : "text-muted-foreground/80",
        )}
        aria-hidden
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[11px]",
          warn
            ? "text-amber-700 dark:text-amber-300"
            : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "shrink-0 text-[11px] font-medium tabular-nums",
          warn
            ? "text-amber-600 dark:text-amber-400"
            : "text-foreground/90",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function AiTokensPopover({
  remaining,
  included,
  creditBalanceCents = 0,
  planTier,
  loading,
  billingHref = "/billing",
}: {
  remaining: number;
  included?: number;
  creditBalanceCents?: number;
  planTier?: string;
  loading?: boolean;
  billingHref?: string;
}) {
  const openBilling = () => {
    window.open(billingHref, "_blank", "noopener,noreferrer");
  };
  const tokenRemaining = Math.max(0, remaining);
  const tokenIncluded = Math.max(1, included ?? remaining ?? 1);
  const tokenRemainingPct = Math.min(
    100,
    (tokenRemaining / tokenIncluded) * 100,
  );
  const creditCents = Math.max(0, creditBalanceCents);
  const tokenWarn = tokenRemaining === 0 || tokenRemainingPct <= 30;
  const hasWarning = tokenWarn && creditCents === 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
          disabled={loading}
          aria-label="AI tokens"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          AI tokens
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-56 rounded-xl border border-border/80 bg-card p-3 shadow-lg"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-foreground">AI Balance</p>
          {!loading && planTier ? (
            <span className="shrink-0 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              {planTier} Plan
            </span>
          ) : null}
        </div>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Loading...
          </div>
        ) : (
          <>
            <div className="mt-2.5 space-y-2">
              <AiTokensMetricRow
                icon={Sparkles}
                label="AI Tokens"
                value={`${tokenRemaining.toLocaleString()}/${tokenIncluded.toLocaleString()}`}
                warn={hasWarning}
              />
              <AiTokensMetricRow
                icon={Coins}
                label="Credits"
                value={formatCreditDollars(creditCents)}
                warn={hasWarning}
              />
            </div>
            <p
              className={cn(
                "mt-2.5 text-[10px] leading-snug",
                hasWarning
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground",
              )}
            >
              {hasWarning
                ? "AI tokens are low and no credits are available for overage."
                : "Credits are used automatically when included AI tokens run out."}
            </p>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="mt-3 h-8 w-full gap-1 text-xs font-semibold shadow-sm [&_svg]:!size-3"
              onClick={openBilling}
            >
              Purchase
              <ExternalLink strokeWidth={1.75} aria-hidden />
            </Button>
          </>
        )}
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
  controlRef,
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

  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      startVoice: () => {
        if (!voice || disabled || voice.disabled || isGenerating) return;
        if (voiceCapture.listening) return;
        voice.onBeforeVoiceStart?.();
        void voiceCapture.start(value);
      },
      focusInput: () => {
        ref.current?.focus();
      },
    };
    return () => {
      controlRef.current = null;
    };
  });

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
          {aiTokensBlocked.billingHref ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-7 shrink-0 gap-1 px-2.5 text-[11px] font-semibold shadow-sm [&_svg]:!size-3"
              onClick={() =>
                window.open(aiTokensBlocked.billingHref, "_blank", "noopener,noreferrer")
              }
            >
              Purchase
              <ExternalLink strokeWidth={1.75} aria-hidden />
            </Button>
          ) : null}
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
            ? "Add AI tokens to submit answers and use coach voice…"
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
              data-tour="practice-finish"
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
                  ? "Coach voice requires AI tokens"
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
              included={aiTokenBalance.included}
              creditBalanceCents={aiTokenBalance.creditBalanceCents}
              planTier={aiTokenBalance.planTier}
              loading={aiTokenBalance.loading}
              billingHref={aiTokenBalance.href}
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
              data-tour={voice.dataTour}
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
