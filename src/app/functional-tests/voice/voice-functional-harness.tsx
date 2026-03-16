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
  | "farewell-complete";

declare global {
  interface Window {
    __functionalRelayConnections?: Array<{ url: string; path: string }>;
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
            },
          },
        },
        { type: "json", delay: 180, message: { type: "tts_ended" } },
        { type: "json", delay: 200, message: { type: "interview_complete" } },
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

  window.__functionalRelayConnections = [];
  window.__functionalRelayScenario = scenario;
  window.sessionStorage.setItem("__functionalRelayConnections", "[]");

  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {},
    });
  }
  navigator.mediaDevices.getUserMedia = async () =>
    ({ getTracks: () => [] }) as unknown as MediaStream;

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
      this.path = normalizePath(new URL(this.url, window.location.href).pathname);
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
    const path = normalizePath(resolved.pathname);
    if (relayPaths.has(path)) {
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
          followUpDepth: "Moderate",
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
