"use client";

import { VoiceInterface } from "@/components/session/voice-interface";
import { useEffect, useState } from "react";

type FunctionalRelayEvent =
  | { type: "ready"; delay?: number; sessionId?: string }
  | { type: "close"; delay?: number; code?: number; reason?: string }
  | { type: "json"; delay?: number; message: Record<string, unknown> };

type FunctionalScenario = Record<string, { events: FunctionalRelayEvent[] }>;

type FunctionalScenarioId =
  | "default"
  | "english-failover"
  | "chinese-failover"
  | "farewell-complete"
  | "thinking-after-asr"
  | "thinking-until-response"
  | "asr-cancelled"
  | "qwen-transcript-revision"
  | "qwen-caption-stability"
  | "listening-feedback"
  | "long-transcript-layout";

const LONG_FUNCTIONAL_TRANSCRIPT = Array.from(
  { length: 320 },
  (_, index) => `project-detail-${index + 1}`,
).join(" ");

declare global {
  interface Window {
    __functionalRelayConnections?: Array<{ url: string; path: string }>;
    __functionalRelayMessages?: Array<{
      path: string;
      message: Record<string, unknown>;
    }>;
    __functionalRelayScenario?: FunctionalScenario;
    __functionalRelayMockInstalled?: boolean;
  }
}

const functionalScenarios: Record<FunctionalScenarioId, FunctionalScenario> = {
  default: {
    "/ws/voice": {
      events: [{ type: "ready", delay: 30 }],
    },
    "/ws/openai-voice": {
      events: [{ type: "close", delay: 30 }],
    },
  },
  "english-failover": {
    "/ws/voice": {
      events: [{ type: "close", delay: 30 }],
    },
    "/ws/openai-voice": {
      events: [{ type: "ready", delay: 30 }],
    },
  },
  "chinese-failover": {
    "/ws/voice": {
      events: [{ type: "close", delay: 30 }],
    },
    "/ws/openai-voice": {
      events: [{ type: "ready", delay: 30 }],
    },
  },
  "farewell-complete": {
    "/ws/voice": {
      events: [
        { type: "ready", delay: 20 },
        {
          type: "json",
          delay: 120,
          message: {
            type: "tts_text",
            data: {
              text: "Understood, we're all set. Thanks for your time today and take care.",
              utteranceId: "functional-farewell-1",
            },
          },
        },
        {
          type: "json",
          delay: 180,
          message: {
            type: "tts_ended",
            utteranceId: "functional-farewell-1",
          },
        },
        { type: "json", delay: 200, message: { type: "interview_complete" } },
      ],
    },
    "/ws/openai-voice": {
      events: [{ type: "close", delay: 30 }],
    },
  },
  "thinking-after-asr": {
    "/ws/voice": {
      events: [
        { type: "ready", delay: 20 },
        {
          type: "json",
          delay: 100,
          message: {
            type: "asr",
            data: {
              results: [{ text: "I led a reporting dashboard project" }],
            },
          },
        },
        {
          type: "json",
          delay: 220,
          message: {
            type: "asr_ended",
            text: "I led a reporting dashboard project",
          },
        },
      ],
    },
    "/ws/openai-voice": {
      events: [{ type: "close", delay: 30 }],
    },
  },
  "thinking-until-response": {
    "/ws/voice": {
      events: [
        { type: "ready", delay: 20 },
        {
          type: "json",
          delay: 100,
          message: {
            type: "asr",
            data: {
              results: [{ text: "I led a reporting dashboard project" }],
            },
          },
        },
        {
          type: "json",
          delay: 220,
          message: {
            type: "asr_ended",
            text: "I led a reporting dashboard project",
          },
        },
        { type: "json", delay: 260, message: { type: "response_started" } },
        { type: "json", delay: 320, message: { type: "interrupt" } },
        {
          type: "json",
          delay: 1_000,
          message: {
            type: "tts_text",
            data: {
              text: "Thanks for explaining that project.",
            },
          },
        },
        { type: "json", delay: 1_050, message: { type: "tts_ended" } },
      ],
    },
    "/ws/openai-voice": {
      events: [{ type: "close", delay: 30 }],
    },
  },
  "asr-cancelled": {
    "/ws/voice": {
      events: [
        { type: "ready", delay: 20 },
        {
          type: "json",
          delay: 5_000,
          message: {
            type: "asr_pending",
            text: "Yes. And so I think communication is critical.",
            delayMs: 50,
          },
        },
        {
          type: "json",
          delay: 5_800,
          message: {
            type: "asr_cancelled",
            reason: "duplicate",
          },
        },
      ],
    },
    "/ws/openai-voice": {
      events: [{ type: "close", delay: 30 }],
    },
  },
  "qwen-transcript-revision": {
    "/ws/voice": {
      events: [
        { type: "ready", delay: 20 },
        { type: "json", delay: 5_000, message: { type: "asr_pending", transcriptMode: "replace", text: "Thank you Hello we can hello", delayMs: 50 } },
        { type: "json", delay: 5_500, message: { type: "asr", transcriptMode: "replace", data: { results: [{ text: "Hello. Can you hear me?", definite: false }] } } },
        { type: "json", delay: 5_550, message: { type: "asr_pending", transcriptMode: "replace", text: "Hello. Can you hear me?", delayMs: 50 } },
        { type: "json", delay: 6_000, message: { type: "asr_ended", transcriptMode: "replace", text: "Hello. Can you hear me?" } },
        { type: "json", delay: 6_500, message: { type: "asr", transcriptMode: "replace", data: { results: [{ text: "phantom revision", definite: false }] } } },
        { type: "json", delay: 6_550, message: { type: "asr_pending", transcriptMode: "replace", text: "phantom revision", delayMs: 50 } },
        { type: "json", delay: 7_000, message: { type: "asr_ended", transcriptMode: "replace", text: "" } },
      ],
    },
    "/ws/openai-voice": { events: [{ type: "close", delay: 30 }] },
  },
  "qwen-caption-stability": {
    "/ws/voice": {
      events: [
        { type: "ready", delay: 20 },
        { type: "json", delay: 5_000, message: { type: "asr_ended", transcriptMode: "replace", text: "My earlier answer." } },
        { type: "json", delay: 5_200, message: { type: "response_started" } },
        { type: "json", delay: 5_800, message: { type: "asr", transcriptMode: "replace", data: { results: [{ text: "I start by understanding the problem.", definite: false }] } } },
        { type: "json", delay: 6_300, message: { type: "asr_pending", transcriptMode: "replace", text: "I start by understanding the problem.", delayMs: 50 } },
        { type: "json", delay: 6_900, message: { type: "asr", transcriptMode: "replace", data: { results: [{ text: "I start by understanding the problem. Then I define success and test scalability.", definite: false }] } } },
        { type: "json", delay: 7_400, message: { type: "asr_pending", transcriptMode: "replace", text: "I start by understanding the problem. Then I define success and test scalability.", delayMs: 50 } },
        { type: "json", delay: 8_100, message: { type: "asr_ended", transcriptMode: "replace", text: "I start by understanding the problem. Then I define success and test scalability." } },
      ],
    },
    "/ws/openai-voice": { events: [{ type: "close", delay: 30 }] },
  },
  "listening-feedback": {
    "/ws/voice": {
      events: [
        { type: "ready", delay: 20 },
        { type: "json", delay: 5_000, message: { type: "asr", transcriptMode: "replace", data: { results: [{ text: "I start by understanding the problem.", definite: false }] } } },
        { type: "json", delay: 6_500, message: { type: "asr_pending", transcriptMode: "replace", text: "I start by understanding the problem.", delayMs: 50 } },
        { type: "json", delay: 7_500, message: { type: "asr", transcriptMode: "replace", data: { results: [{ text: "I start by understanding the problem. Then I test scalability.", definite: false }] } } },
        { type: "json", delay: 8_500, message: { type: "asr_pending", transcriptMode: "replace", text: "I start by understanding the problem. Then I test scalability.", delayMs: 50 } },
        { type: "json", delay: 10_000, message: { type: "asr_ended", transcriptMode: "replace", text: "I start by understanding the problem. Then I test scalability." } },
      ],
    },
    "/ws/openai-voice": { events: [{ type: "close", delay: 30 }] },
  },
  "long-transcript-layout": {
    "/ws/voice": {
      events: [
        { type: "ready", delay: 20 },
        {
          type: "json",
          // Let the interface finish its async recording/session startup, which
          // clears any transcript delivered before the microphone is ready.
          delay: 5_000,
          message: {
            type: "asr_ended",
            text: LONG_FUNCTIONAL_TRANSCRIPT,
          },
        },
      ],
    },
    "/ws/openai-voice": {
      events: [{ type: "close", delay: 30 }],
    },
  },
};

function installFunctionalRelayMocks(scenario: FunctionalScenario) {
  const normalizePath = (pathname: string) => pathname.replace(/\/+$/, "") || "/";
  const relayPaths = new Set(["/ws/voice", "/ws/openai-voice"]);
  const relayPathForUrl = (url: URL) => {
    const path = normalizePath(url.pathname);
    if (relayPaths.has(path)) return path;
    // The manually opened harness must also mock the configured local relays,
    // so a UI preview cannot accidentally start a real interview connection.
    const primary = process.env.NEXT_PUBLIC_VOICE_RELAY_URL;
    const fallback = process.env.NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL;
    if (primary && url.href === new URL(primary, window.location.href).href) return "/ws/voice";
    if (fallback && url.href === new URL(fallback, window.location.href).href) return "/ws/openai-voice";
    return null;
  };

  window.__functionalRelayConnections = [];
  window.__functionalRelayMessages = [];
  window.__functionalRelayScenario = scenario;
  window.sessionStorage.setItem("__functionalRelayConnections", "[]");
  window.sessionStorage.setItem("__functionalRelayMessages", "[]");

  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {},
    });
  }
  navigator.mediaDevices.getUserMedia = async () => {
    if (scenario === functionalScenarios["listening-feedback"]) {
      // A real silent audio track exercises microphone state without accessing
      // the user's microphone or sending audio to a provider.
      const audio = new AudioContext();
      window.addEventListener("pagehide", () => { void audio.close(); }, { once: true });
      return audio.createMediaStreamDestination().stream;
    }
    return ({ getTracks: () => [] }) as unknown as MediaStream;
  };

  if (window.__functionalRelayMockInstalled) {
    return;
  }

  const realWebSocket = window.WebSocket;

  class MockRelaySocket {
    readonly url: string;
    readonly path: string;
    readonly events: FunctionalRelayEvent[];
    readyState = 0;
    binaryType = "arraybuffer";
    onopen: ((event?: unknown) => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event?: unknown) => void) | null = null;
    onclose: ((event?: unknown) => void) | null = null;
    private scheduled = false;

    constructor(url: string | URL) {
      this.url = String(url);
      const resolved = new URL(this.url, window.location.href);
      this.path = relayPathForUrl(resolved) ?? normalizePath(resolved.pathname);
      this.events = window.__functionalRelayScenario?.[this.path]?.events ?? [];

      const nextConnections = [
        ...(window.__functionalRelayConnections ?? []),
        { url: this.url, path: this.path },
      ];
      window.__functionalRelayConnections = nextConnections;
      window.sessionStorage.setItem(
        "__functionalRelayConnections",
        JSON.stringify(nextConnections),
      );

      setTimeout(() => {
        if (this.readyState === 3) return;
        this.readyState = 1;
        this.onopen?.({});
      }, 0);
    }

    send(data: string): void {
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(data) as Record<string, unknown>;
      } catch {
        parsed = null;
      }

      if (parsed) {
        const nextMessages = [
          ...(window.__functionalRelayMessages ?? []),
          { path: this.path, message: parsed },
        ];
        window.__functionalRelayMessages = nextMessages;
        window.sessionStorage.setItem(
          "__functionalRelayMessages",
          JSON.stringify(nextMessages),
        );
      }

      if (parsed?.type === "init" && !this.scheduled) {
        this.scheduled = true;
        for (const event of this.events) {
          setTimeout(() => {
            if (this.readyState === 3) return;

            if (event.type === "ready") {
              this.onmessage?.({
                data: JSON.stringify({
                  type: "ready",
                  sessionId: event.sessionId ?? "functional-session",
                }),
              });
              return;
            }

            if (event.type === "json") {
              this.onmessage?.({
                data: JSON.stringify(event.message),
              });
              return;
            }

            if (event.type === "close") {
              this.readyState = 3;
              this.onclose?.({
                code: event.code ?? 1006,
                reason: event.reason ?? "functional close",
              });
            }
          }, event.delay ?? 0);
        }
      }
    }

    close(code?: number, reason?: string): void {
      this.readyState = 3;
      this.onclose?.({ code: code ?? 1000, reason: reason ?? "" });
    }
  }

  window.WebSocket = function functionalWebSocket(url: string | URL, protocols?: string | string[]) {
    const resolved = new URL(String(url), window.location.href);
    if (relayPathForUrl(resolved)) {
      return new MockRelaySocket(resolved.toString()) as unknown as WebSocket;
    }
    return new realWebSocket(url, protocols);
  } as unknown as typeof WebSocket;

  window.WebSocket.prototype = realWebSocket.prototype;
  window.__functionalRelayMockInstalled = true;
}

export function VoiceFunctionalHarness({
  language,
  scenario,
}: {
  language: string;
  scenario: string;
}) {
  const [parentCompleted, setParentCompleted] = useState(false);
  const [mocksReady, setMocksReady] = useState(false);

  useEffect(() => {
    const activeScenario =
      functionalScenarios[scenario as FunctionalScenarioId] ??
      functionalScenarios.default;
    installFunctionalRelayMocks(activeScenario);
    setMocksReady(true);
  }, [scenario]);

  return (
    <div className="relative min-h-screen bg-background">
      <div
        data-testid="parent-complete"
        className="sr-only"
        aria-live="polite"
      >
        {parentCompleted ? "true" : "false"}
      </div>
      <div data-testid="harness-language" className="sr-only">
        {language}
      </div>
      <div data-testid="harness-ready" className="sr-only">
        {mocksReady ? "true" : "false"}
      </div>
      <VoiceInterface
        sessionId="functional-session"
        interviewId="functional-interview"
        interviewTitle="Functional Voice Interview"
        aiName="TestInterviewer"
        questionCount={1}
        durationMinutes={15}
        interviewContext={{
          title: "Functional Voice Interview",
          objective: "Exercise the core voice interview flow in browser tests.",
          aiName: "TestInterviewer",
          aiTone: "Professional",
          language,
          followUpDepth: "MODERATE",
          questions: [
            {
              text: "Tell me about a project you are proud of.",
              type: "OPEN_ENDED",
              description: "Functional test prompt",
              order: 0,
            },
          ],
        }}
        chatEnabled={false}
        onComplete={() => setParentCompleted(true)}
      />
    </div>
  );
}
