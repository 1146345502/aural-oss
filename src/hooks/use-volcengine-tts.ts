"use client";

import {
    prepareCoachTtsText,
    sanitizeTtsText,
} from "@/lib/prep/coach-tts-text";
import { SILENT_MP3_DATA_URL } from "@/lib/prep/silent-audio";
import { useCallback, useEffect, useRef, useState } from "react";

export type TtsSpeakingPhase = "idle" | "loading" | "playing";

export type SpeakOptions = {
  /** When false, only sanitize (no 360-char truncation). Use for interview questions. */
  truncate?: boolean;
};

function prepareTtsText(text: string, options?: SpeakOptions): string {
  if (options?.truncate === false) {
    return sanitizeTtsText(text);
  }
  return prepareCoachTtsText(text);
}

function speakWithBrowser(
  text: string,
  language: string | undefined,
  onStart: () => void,
  onEnd: () => void,
): boolean {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language?.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
  utterance.onstart = onStart;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.speak(utterance);
  return true;
}

function resolveBlobMimeType(
  headerMime: string | null,
  responseFormat: string | null,
): string {
  const fromHeader = headerMime?.split(";")[0]?.trim();
  if (fromHeader && fromHeader.startsWith("audio/")) return fromHeader;
  if (responseFormat === "mp3") return "audio/mpeg";
  if (responseFormat === "wav") return "audio/wav";
  return "audio/mpeg";
}

/**
 * Play coach speech via Volcengine Seed TTS (`POST /api/voice/tts-s2s`).
 */
export function useVolcengineTts(language?: string) {
  /** Dedicated element for coach TTS — never share with muted autoplay priming. */
  const coachAudioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingBlobRef = useRef<Blob | null>(null);
  const speakGenRef = useRef(0);
  const playStartedRef = useRef(false);
  const autoplayPrimedRef = useRef(false);
  const [speakingPhase, setSpeakingPhase] = useState<TtsSpeakingPhase>("idle");

  const getCoachAudio = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!coachAudioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      coachAudioRef.current = audio;
    }
    return coachAudioRef.current;
  }, []);

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stopCoachPlayback = useCallback(() => {
    const audio = coachAudioRef.current;
    if (!audio) return;
    playStartedRef.current = false;
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    audio.volume = 1;
    audio.onended = null;
    audio.onerror = null;
    audio.onplaying = null;
    audio.oncanplaythrough = null;
    audio.removeAttribute("src");
    audio.load();
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    pendingBlobRef.current = null;
    stopCoachPlayback();
    revokeObjectUrl();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeakingPhase("idle");
  }, [revokeObjectUrl, stopCoachPlayback]);

  const playBlob = useCallback(
    async (blob: Blob, generation: number): Promise<boolean> => {
      if (generation !== speakGenRef.current) return false;

      const audio = getCoachAudio();
      if (!audio) return false;

      stopCoachPlayback();
      revokeObjectUrl();
      playStartedRef.current = false;

      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      pendingBlobRef.current = null;

      return new Promise((resolve) => {
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          audio.onended = null;
          audio.onerror = null;
          audio.onplaying = null;
          audio.oncanplaythrough = null;
          resolve(ok);
        };

        const beginPlayback = () => {
          if (playStartedRef.current || generation !== speakGenRef.current) return;
          playStartedRef.current = true;
          audio.muted = false;
          audio.volume = 1;

          const playPromise = audio.play();
          if (!playPromise) {
            finish(true);
            return;
          }

          void playPromise
            .then(() => {
              if (generation !== speakGenRef.current) {
                audio.pause();
                finish(false);
              }
            })
            .catch((err) => {
              console.warn("[useVolcengineTts] play() blocked", err);
              playStartedRef.current = false;
              if (generation === speakGenRef.current) {
                pendingBlobRef.current = blob;
                revokeObjectUrl();
                objectUrlRef.current = null;
                stopCoachPlayback();
                setSpeakingPhase("loading");
              }
              finish(false);
            });
        };

        audio.onplaying = () => {
          if (generation === speakGenRef.current) {
            setSpeakingPhase("playing");
          }
        };

        audio.onended = () => {
          if (generation !== speakGenRef.current) {
            finish(false);
            return;
          }
          setSpeakingPhase("idle");
          revokeObjectUrl();
          finish(true);
        };

        audio.onerror = () => {
          if (generation === speakGenRef.current) {
            console.warn("[useVolcengineTts] audio element error", {
              mime: blob.type,
              size: blob.size,
              networkState: audio.networkState,
              readyState: audio.readyState,
              muted: audio.muted,
            });
            setSpeakingPhase("idle");
            revokeObjectUrl();
          }
          finish(false);
        };

        audio.oncanplaythrough = () => {
          audio.oncanplaythrough = null;
          beginPlayback();
        };

        audio.src = url;
        audio.load();

        if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          beginPlayback();
        }
      });
    },
    [getCoachAudio, revokeObjectUrl, stopCoachPlayback],
  );

  const retryPendingPlayback = useCallback(() => {
    const pending = pendingBlobRef.current;
    if (!pending) return;
    void playBlob(pending, speakGenRef.current);
  }, [playBlob]);

  /** Muted play on a separate element unlocks autoplay without muting coach audio. */
  const primeAutoplayOnMount = useCallback(async () => {
    if (autoplayPrimedRef.current || typeof window === "undefined") return;

    const primeAudio = new Audio();
    primeAudio.muted = true;
    primeAudio.src = SILENT_MP3_DATA_URL;
    primeAudio.load();

    try {
      await primeAudio.play();
      autoplayPrimedRef.current = true;
      primeAudio.pause();
      retryPendingPlayback();
    } catch {
      // Strict browsers: first click will call playPendingFromGesture.
    } finally {
      primeAudio.removeAttribute("src");
      primeAudio.load();
    }
  }, [retryPendingPlayback]);

  useEffect(() => {
    void primeAutoplayOnMount();
  }, [primeAutoplayOnMount]);

  const primeFromUserGesture = useCallback(() => {
    autoplayPrimedRef.current = true;
    retryPendingPlayback();
  }, [retryPendingPlayback]);

  const playPendingFromGesture = useCallback((): boolean => {
    const pending = pendingBlobRef.current;
    if (!pending) return false;
    autoplayPrimedRef.current = true;
    void playBlob(pending, speakGenRef.current);
    return true;
  }, [playBlob]);

  const speak = useCallback(
    async (
      text: string,
      languageOverride?: string,
      options?: SpeakOptions,
    ) => {
      const trimmed = prepareTtsText(text, options);
      if (!trimmed || typeof window === "undefined") return;

      const lang = languageOverride ?? language;
      const generation = ++speakGenRef.current;

      abortRef.current?.abort();
      abortRef.current = null;
      stopCoachPlayback();
      revokeObjectUrl();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      const abort = new AbortController();
      abortRef.current = abort;
      setSpeakingPhase("loading");

      let didTimeout = false;
      const timeoutId = setTimeout(() => {
        didTimeout = true;
        abort.abort();
      }, 12000);

      try {
        const res = await fetch(
          `/api/voice/tts-s2s?format=mp3&t=${Date.now()}`,
          {
            method: "POST",
            cache: "no-store",
            headers: {
              Accept: "audio/mpeg, audio/wav",
              "Content-Type": "application/json",
              "X-Aural-TTS-Format": "mp3",
            },
            body: JSON.stringify({ text: trimmed, language: lang }),
            signal: abort.signal,
          },
        );

        clearTimeout(timeoutId);

        if (abort.signal.aborted && !didTimeout) return;
        if (generation !== speakGenRef.current) return;

        if (res.status === 204 || !res.ok) {
          if (res.status === 502) {
            const used = speakWithBrowser(
              trimmed,
              lang,
              () => setSpeakingPhase("playing"),
              () => stop(),
            );
            if (!used) setSpeakingPhase("idle");
          } else {
            throw new Error(`TTS HTTP ${res.status}`);
          }
          return;
        }

        const mime = resolveBlobMimeType(
          res.headers.get("content-type"),
          res.headers.get("x-aural-tts-format"),
        );
        const buffer = await res.arrayBuffer();
        if ((abort.signal.aborted && !didTimeout) || buffer.byteLength === 0) {
          throw new Error("Empty TTS response");
        }
        if (generation !== speakGenRef.current) return;

        const blob = new Blob([buffer], { type: mime });
        await playBlob(blob, generation);
      } catch (err) {
        clearTimeout(timeoutId);
        if ((err as Error).name === "AbortError" && !didTimeout) return;
        if (generation !== speakGenRef.current) return;

        const useBrowser =
          err instanceof Error &&
          (err.message.includes("502") || err.message.includes("Empty TTS"));

        if (useBrowser) {
          const used = speakWithBrowser(
            trimmed,
            lang,
            () => setSpeakingPhase("playing"),
            () => stop(),
          );
          if (!used) setSpeakingPhase("idle");
        } else {
          console.warn("[useVolcengineTts] TTS failed", err);
          setSpeakingPhase("idle");
        }
      } finally {
        if (abortRef.current === abort) {
          abortRef.current = null;
        }
      }
    },
    [language, playBlob, revokeObjectUrl, stop, stopCoachPlayback],
  );

  useEffect(() => () => stop(), [stop]);

  const speaking = speakingPhase !== "idle";

  return {
    speak,
    stop,
    speaking,
    speakingPhase,
    primeFromUserGesture,
    playPendingFromGesture,
  };
}
