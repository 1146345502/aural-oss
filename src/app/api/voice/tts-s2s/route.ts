import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/voice/tts-s2s");
import WebSocket from "ws";
import {
  buildStartConnection,
  buildStartSession,
  buildSayHello,
  buildFinishSession,
  buildFinishConnection,
  parseResponse,
  SERVER_ERROR_RESPONSE,
  ServerEvent,
  type TTSOptions,
} from "../../../../../server/volcengine-protocol";

const VOLCENGINE_WS_URL =
  process.env.DOUBAO_WS_URL ||
  "wss://openspeech.bytedance.com/api/v3/realtime/dialogue";
const APP_ID = process.env.DOUBAO_APP_ID || "";
const ACCESS_TOKEN = process.env.DOUBAO_ACCESS_TOKEN || "";
const APP_KEY = process.env.DOUBAO_APP_KEY || "";
const RESOURCE_ID = process.env.DOUBAO_RESOURCE_ID || "";
const TTS_VOICE_ZH = process.env.DOUBAO_VOICE_ZH || "";
const TTS_VOICE_EN = process.env.DOUBAO_VOICE_EN || "";

const BOT_NAME = "Mic Test Agent";
const SYSTEM_TEXT =
  "You are a voice test assistant. Just speak the greeting text provided via SayHello. Do not ask questions or continue the conversation.";

function getTTSOptions(language?: string): TTSOptions | undefined {
  const isZh = language?.toLowerCase().startsWith("zh");
  const voiceType = isZh ? TTS_VOICE_ZH : TTS_VOICE_EN;
  if (!voiceType) return undefined;
  return { voice_type: voiceType };
}

/**
 * POST /api/voice/tts-s2s
 *
 * Synthesize speech via a short-lived Volcengine Doubao S2S session.
 * Streams raw float32 PCM chunks (24 kHz, mono) as they are generated,
 * so the client can begin playback immediately without waiting for
 * the full utterance.
 */
export async function POST(req: Request) {
  const { text, language } = await req.json();

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  if (!APP_ID || !ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "Doubao credentials not configured" },
      { status: 500 }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      let ws: WebSocket | null = null;

      try {
        const connectId = randomUUID();
        const sessionId = randomUUID();
        const headers: Record<string, string> = {
          "X-Api-App-ID": APP_ID,
          "X-Api-Access-Key": ACCESS_TOKEN,
          "X-Api-Resource-Id": RESOURCE_ID,
          "X-Api-Connect-Id": connectId,
        };
        if (APP_KEY) {
          headers["X-Api-App-Key"] = APP_KEY;
        }

        ws = new WebSocket(VOLCENGINE_WS_URL, { headers });

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("WebSocket connection timeout")),
            10000
          );
          ws!.on("open", () => {
            clearTimeout(timeout);
            resolve();
          });
          ws!.on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });

        ws.send(buildStartConnection());
        await waitForEvent(ws, ServerEvent.CONNECTION_STARTED, 5000);

        ws.send(buildStartSession(sessionId, BOT_NAME, SYSTEM_TEXT, getTTSOptions(language)));
        await waitForEvent(ws, ServerEvent.SESSION_STARTED, 5000);

        ws.send(buildSayHello(sessionId, text));

        // Stream audio chunks as they arrive
        await new Promise<void>((resolve, reject) => {
          let sawSayHelloTts = false;

          const timeout = setTimeout(() => {
            ws!.removeListener("message", handler);
            resolve();
          }, 15000);

          const handler = (data: Buffer) => {
            try {
              const resp = parseResponse(Buffer.from(data));

              if (resp.event === ServerEvent.TTS_SENTENCE_START) {
                const p = resp.payload as Record<string, unknown>;
                if (p?.tts_type === "chat_tts_text") {
                  sawSayHelloTts = true;
                }
              }

              if (
                resp.event === ServerEvent.TTS_RESPONSE &&
                sawSayHelloTts &&
                Buffer.isBuffer(resp.payload) &&
                resp.payload.length > 0
              ) {
                controller.enqueue(new Uint8Array(resp.payload));
              }

              if (resp.event === ServerEvent.TTS_ENDED && sawSayHelloTts) {
                clearTimeout(timeout);
                ws!.removeListener("message", handler);
                resolve();
              }

              if (
                resp.messageType === SERVER_ERROR_RESPONSE ||
                resp.event === ServerEvent.SESSION_FAILED
              ) {
                clearTimeout(timeout);
                ws!.removeListener("message", handler);
                reject(
                  new Error(
                    `S2S error: ${JSON.stringify(resp.payload)}`
                  )
                );
              }
            } catch {
              // ignore parse errors
            }
          };

          ws!.on("message", handler);
        });

        // Tear down
        try {
          ws.send(buildFinishSession(sessionId));
          ws.send(buildFinishConnection());
        } catch {
          // ignore
        }
        ws.close();
      } catch (err) {
        log.error("Stream error:", err);
        if (ws) {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}

function waitForEvent(
  ws: WebSocket,
  targetEvent: number,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timeout waiting for event ${targetEvent}`)),
      timeoutMs
    );
    const handler = (data: Buffer) => {
      try {
        const resp = parseResponse(Buffer.from(data));
        if (resp.event === targetEvent) {
          clearTimeout(timeout);
          ws.removeListener("message", handler);
          resolve();
        } else if (
          resp.messageType === SERVER_ERROR_RESPONSE ||
          resp.event === ServerEvent.SESSION_FAILED ||
          resp.event === ServerEvent.CONNECTION_FAILED
        ) {
          clearTimeout(timeout);
          ws.removeListener("message", handler);
          reject(
            new Error(
              `S2S error (event=${resp.event}): ${JSON.stringify(
                resp.payload
              )}`
            )
          );
        }
      } catch {
        // parse errors during handshake
      }
    };
    ws.on("message", handler);
  });
}

