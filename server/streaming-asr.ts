/** Provider transport only; the voice relay continues to own interview turn state. */
import { WebSocket } from "ws";
import {
  BIGMODEL_ASR_URL, buildBigModelHeaders, buildBigModelFullRequest,
  buildBigModelAudioRequest, parseAsrResponse, type BigModelAsrConfig, type AsrResponse,
} from "./volcengine-asr";
import {
  QWEN_ASR_URL, buildQwenSessionUpdate, buildQwenAudioAppend, buildQwenSessionFinish,
  createQwenAsrState, parseQwenAsrResponse,
} from "./qwen-asr";
import {
  QWEN_AUDIO_ASR_URL, buildQwenAudioTask, buildQwenAudioTaskFinish,
  createQwenAudioAsrState, parseQwenAudioAsrResponse,
} from "./qwen-audio-asr";

export type AsrProvider = "seed" | "qwen" | "qwen-audio";

export function resolveAsrProvider(value?: string): AsrProvider {
  const provider = value?.trim().toLowerCase() || "seed";
  if (provider !== "seed" && provider !== "qwen" && provider !== "qwen-audio") {
    throw new Error("VOICE_ASR_PROVIDER must be seed, qwen or qwen-audio");
  }
  return provider;
}

interface StreamingAsrOptions {
  provider: AsrProvider;
  apiKey: string;
  appId?: string;
  accessToken?: string;
  resourceId?: string;
  requestId: string;
  config: BigModelAsrConfig;
  noiseThreshold?: number;
}

type SocketFactory = (url: string, options: WebSocket.ClientOptions) => WebSocket;
const createSocket: SocketFactory = (url, options) => new WebSocket(url, options);

export class StreamingAsrConnection {
  readonly socket: WebSocket;
  readonly on: WebSocket["on"];
  readonly removeAllListeners: WebSocket["removeAllListeners"];
  private readonly qwenState;
  private readonly qwenAudioState;
  private sequence = 1;
  private finishing = false;

  constructor(private readonly options: StreamingAsrOptions, socketFactory: SocketFactory = createSocket) {
    this.qwenState = createQwenAsrState(options.config.language);
    this.qwenAudioState = createQwenAudioAsrState(options.config.language);
    if (!options.apiKey.trim()) throw new Error(`Missing ${options.provider !== "seed" ? "QWEN_ASR_API_KEY" : "DOUBAO_API_KEY"}`);
    this.socket = socketFactory(options.provider === "qwen" ? QWEN_ASR_URL : options.provider === "qwen-audio" ? QWEN_AUDIO_ASR_URL : BIGMODEL_ASR_URL, {
      headers: options.provider !== "seed"
        ? { Authorization: `Bearer ${options.apiKey}`, "OpenAI-Beta": "realtime=v1" }
        : buildBigModelHeaders(options.appId || "", options.accessToken || "", options.requestId, options.resourceId, options.apiKey),
      handshakeTimeout: 10_000,
    });
    this.on = this.socket.on.bind(this.socket);
    this.removeAllListeners = this.socket.removeAllListeners.bind(this.socket);
  }

  get readyState() { return this.socket.readyState; }

  async initialize(): Promise<void> {
    const socket = this.socket;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error("ASR connect/configuration timeout")), 10_000);
      const finish = (error?: Error) => {
        clearTimeout(timer);
        socket.off("open", opened).off("message", configured).off("error", failed)
          .off("close", closed).off("unexpected-response", rejected);
        if (error) {
          // Keep teardown errors handled while terminating a failed handshake.
          socket.on("error", () => {});
          socket.terminate();
          reject(new Error(error.message.replaceAll(this.options.apiKey, "[redacted]")));
        } else {
          resolve();
        }
      };
      const failed = (error: Error) => finish(error);
      const closed = () => finish(new Error("ASR closed before configuration completed"));
      const rejected = (_request: unknown, response: { statusCode?: number; resume(): void }) => {
        response.resume();
        finish(new Error(`ASR handshake rejected: HTTP ${response.statusCode}`));
      };
      const opened = () => {
        try {
          if (this.options.provider === "qwen") {
            socket.send(JSON.stringify(buildQwenSessionUpdate(this.options.config.language, this.options.config.endWindowSize, this.options.noiseThreshold)));
          } else if (this.options.provider === "qwen-audio") {
            socket.send(JSON.stringify(buildQwenAudioTask(this.options.requestId, this.options.config.language, this.options.config.endWindowSize, this.options.config.corpus, this.options.noiseThreshold)));
          } else {
            socket.send(buildBigModelFullRequest(this.options.config, this.options.requestId));
            finish();
          }
        } catch (error) { finish(error instanceof Error ? error : new Error("ASR configuration failed")); }
      };
      const configured = (data: Buffer) => {
        if (this.options.provider === "seed") return;
        try {
          const event = JSON.parse(data.toString());
          if (this.options.provider === "qwen") {
            if (event.type === "session.updated") finish();
            else if (event.type === "error") finish(new Error(event.error?.message || "Qwen ASR configuration rejected"));
          } else if (event.header?.task_id === this.options.requestId) {
            if (event.header.event === "task-started") finish();
            else if (event.header.event === "task-failed") finish(new Error(event.header.error_message || "Qwen Audio ASR task rejected"));
          }
        } catch { finish(new Error("Invalid Qwen ASR configuration response")); }
      };
      socket.on("open", opened).on("message", configured).on("error", failed)
        .on("close", closed).on("unexpected-response", rejected);
    });
  }

  sendAudio(audio: Buffer): void {
    if (this.finishing || this.readyState !== WebSocket.OPEN) return;
    this.socket.send(this.options.provider === "qwen"
      ? JSON.stringify(buildQwenAudioAppend(audio))
      : this.options.provider === "qwen-audio" ? audio : buildBigModelAudioRequest(audio, ++this.sequence));
  }

  finish(): void {
    if (this.finishing || this.readyState !== WebSocket.OPEN) return;
    this.finishing = true;
    this.socket.send(this.options.provider === "qwen"
      ? JSON.stringify(buildQwenSessionFinish())
      : this.options.provider === "qwen-audio" ? JSON.stringify(buildQwenAudioTaskFinish(this.options.requestId))
        : buildBigModelAudioRequest(Buffer.alloc(0), ++this.sequence, true));
  }

  parseMessage(data: Buffer): AsrResponse | null {
    const response = this.options.provider === "qwen"
      ? parseQwenAsrResponse(this.qwenState, JSON.parse(data.toString()))
      : this.options.provider === "qwen-audio"
        ? parseQwenAudioAsrResponse(this.qwenAudioState, JSON.parse(data.toString()), this.options.requestId)
        : parseAsrResponse(data);
    if (response?.errorMessage) response.errorMessage = response.errorMessage.replaceAll(this.options.apiKey, "[redacted]");
    return response;
  }

  close(): void {
    if (this.socket.listenerCount("error") === 0) this.socket.on("error", () => {});
    if (this.readyState === WebSocket.CONNECTING) this.socket.terminate();
    else this.socket.close();
  }
}

export async function connectStreamingAsr(options: StreamingAsrOptions, socketFactory?: SocketFactory): Promise<StreamingAsrConnection> {
  const connection = new StreamingAsrConnection(options, socketFactory);
  await connection.initialize();
  return connection;
}
