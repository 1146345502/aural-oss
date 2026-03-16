/**
 * Volcengine S2S (Speech-to-Speech) binary protocol implementation.
 * Ported from the official Python reference:
 *   https://github.com/MarkShawn2020/volcengine-s2s-demo-py
 */
import { gzipSync, gunzipSync } from "zlib";

// ── Protocol constants ──────────────────────────────────────────────

const PROTOCOL_VERSION = 0b0001;

// Message types (upper 4 bits of byte 1)
export const CLIENT_FULL_REQUEST = 0b0001;
export const CLIENT_AUDIO_ONLY_REQUEST = 0b0010;
export const SERVER_FULL_RESPONSE = 0b1001;
export const SERVER_AUDIO_ONLY_RESPONSE = 0b1011;
export const SERVER_ERROR_RESPONSE = 0b1111;

// Flags (lower 4 bits of byte 1)
const MSG_WITH_EVENT = 0b0100;

// Serialization (upper 4 bits of byte 2)
const NO_SERIALIZATION = 0b0000;
const JSON_SERIALIZATION = 0b0001;

// Compression (lower 4 bits of byte 2)
const GZIP = 0b0001;

// ── Server event IDs ────────────────────────────────────────────────

export enum ServerEvent {
  CONNECTION_STARTED = 50,
  CONNECTION_FAILED = 51,
  CONNECTION_FINISHED = 52,
  SESSION_STARTED = 150,
  SESSION_FINISHED = 152,
  SESSION_FAILED = 153,
  TTS_SENTENCE_START = 350,
  TTS_SENTENCE_END = 351,
  TTS_RESPONSE = 352,
  TTS_ENDED = 359,
  ASR_INFO = 450,
  ASR_RESPONSE = 451,
  ASR_ENDED = 459,
  CHAT_RESPONSE = 550,
  CHAT_ENDED = 559,
}

// ── Header generation ───────────────────────────────────────────────

function generateHeader(
  messageType = CLIENT_FULL_REQUEST,
  serialMethod = JSON_SERIALIZATION,
  compressionType = GZIP
): Buffer {
  const headerSize = 1; // 1 unit = 4 bytes
  const header = Buffer.alloc(4);
  header[0] = (PROTOCOL_VERSION << 4) | headerSize;
  header[1] = (messageType << 4) | MSG_WITH_EVENT;
  header[2] = (serialMethod << 4) | compressionType;
  header[3] = 0x00; // reserved
  return header;
}

// ── Client message builders ─────────────────────────────────────────

/** Event 1: StartConnection */
export function buildStartConnection(): Buffer {
  const header = generateHeader();
  const eventId = Buffer.alloc(4);
  eventId.writeUInt32BE(1);
  const payload = gzipSync(Buffer.from("{}"));
  const payloadSize = Buffer.alloc(4);
  payloadSize.writeUInt32BE(payload.length);
  return Buffer.concat([header, eventId, payloadSize, payload]);
}

/** Event 2: FinishConnection */
export function buildFinishConnection(): Buffer {
  const header = generateHeader();
  const eventId = Buffer.alloc(4);
  eventId.writeUInt32BE(2);
  const payload = gzipSync(Buffer.from("{}"));
  const payloadSize = Buffer.alloc(4);
  payloadSize.writeUInt32BE(payload.length);
  return Buffer.concat([header, eventId, payloadSize, payload]);
}

export interface TTSOptions {
  voice_type?: string;
  speed_ratio?: number;
  pitch_ratio?: number;
  volume_ratio?: number;
  emotion?: string;
  language?: string;
}

/** Event 100: StartSession */
export function buildStartSession(
  sessionId: string,
  botName: string,
  systemText?: string,
  ttsOptions?: TTSOptions
): Buffer {
  const header = generateHeader();
  const eventId = Buffer.alloc(4);
  eventId.writeUInt32BE(100);

  const sessionIdBuf = Buffer.from(sessionId);
  const sessionIdLen = Buffer.alloc(4);
  sessionIdLen.writeUInt32BE(sessionIdBuf.length);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dialog: Record<string, any> = { bot_name: botName.slice(0, 20) };
  if (systemText) {
    dialog.system_text = systemText;
    dialog.context = systemText;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audioConfig: Record<string, any> = {
    format: "pcm",
    sample_rate: 24000,
  };
  if (ttsOptions?.voice_type) audioConfig.voice_type = ttsOptions.voice_type;
  if (ttsOptions?.speed_ratio != null) audioConfig.speed_ratio = ttsOptions.speed_ratio;
  if (ttsOptions?.pitch_ratio != null) audioConfig.pitch_ratio = ttsOptions.pitch_ratio;
  if (ttsOptions?.volume_ratio != null) audioConfig.volume_ratio = ttsOptions.volume_ratio;
  if (ttsOptions?.emotion) audioConfig.emotion = ttsOptions.emotion;
  if (ttsOptions?.language) audioConfig.language = ttsOptions.language;

  const payloadObj = {
    dialog,
    tts: {
      audio_config: audioConfig,
    },
  };
  const payload = gzipSync(Buffer.from(JSON.stringify(payloadObj)));
  const payloadSize = Buffer.alloc(4);
  payloadSize.writeUInt32BE(payload.length);

  return Buffer.concat([
    header,
    eventId,
    sessionIdLen,
    sessionIdBuf,
    payloadSize,
    payload,
  ]);
}

/** Event 102: FinishSession */
export function buildFinishSession(sessionId: string): Buffer {
  const header = generateHeader();
  const eventId = Buffer.alloc(4);
  eventId.writeUInt32BE(102);

  const sessionIdBuf = Buffer.from(sessionId);
  const sessionIdLen = Buffer.alloc(4);
  sessionIdLen.writeUInt32BE(sessionIdBuf.length);

  const payload = gzipSync(Buffer.from("{}"));
  const payloadSize = Buffer.alloc(4);
  payloadSize.writeUInt32BE(payload.length);

  return Buffer.concat([
    header,
    eventId,
    sessionIdLen,
    sessionIdBuf,
    payloadSize,
    payload,
  ]);
}

/** Event 200: SendAudio (PCM data, gzip compressed) */
export function buildSendAudio(
  sessionId: string,
  audioData: Buffer
): Buffer {
  const header = generateHeader(CLIENT_AUDIO_ONLY_REQUEST, NO_SERIALIZATION, GZIP);
  const eventId = Buffer.alloc(4);
  eventId.writeUInt32BE(200);

  const sessionIdBuf = Buffer.from(sessionId);
  const sessionIdLen = Buffer.alloc(4);
  sessionIdLen.writeUInt32BE(sessionIdBuf.length);

  const payload = gzipSync(audioData);
  const payloadSize = Buffer.alloc(4);
  payloadSize.writeUInt32BE(payload.length);

  return Buffer.concat([
    header,
    eventId,
    sessionIdLen,
    sessionIdBuf,
    payloadSize,
    payload,
  ]);
}

/** Event 300: SayHello (text prompt to start conversation) */
export function buildSayHello(
  sessionId: string,
  content: string
): Buffer {
  const header = generateHeader();
  const eventId = Buffer.alloc(4);
  eventId.writeUInt32BE(300);

  const sessionIdBuf = Buffer.from(sessionId);
  const sessionIdLen = Buffer.alloc(4);
  sessionIdLen.writeUInt32BE(sessionIdBuf.length);

  const payloadObj = { content };
  const payload = gzipSync(Buffer.from(JSON.stringify(payloadObj)));
  const payloadSize = Buffer.alloc(4);
  payloadSize.writeUInt32BE(payload.length);

  return Buffer.concat([
    header,
    eventId,
    sessionIdLen,
    sessionIdBuf,
    payloadSize,
    payload,
  ]);
}

// ── Response parser ─────────────────────────────────────────────────

export interface ParsedResponse {
  messageType: number;
  event?: number;
  sessionId?: string;
  payload: Buffer | Record<string, unknown> | null;
}

export function parseResponse(data: Buffer): ParsedResponse {
  if (!data || data.length < 4) {
    return { messageType: 0, payload: null };
  }

  const headerSize = data[0] & 0x0f;
  const messageType = data[1] >> 4;
  const flags = data[1] & 0x0f;
  const serializationMethod = data[2] >> 4;
  const compressionMethod = data[2] & 0x0f;

  const payloadStart = headerSize * 4;
  const body = data.subarray(payloadStart);

  const result: ParsedResponse = { messageType, payload: null };
  let offset = 0;

  // Error responses (type 0xF) have a different format: error_code(4) + payload_size(4) + payload
  if (messageType === SERVER_ERROR_RESPONSE) {
    if (body.length >= 4) {
      const errorCode = body.readUInt32BE(0);
      offset = 4;
      // Try to read payload
      if (body.length >= offset + 4) {
        const payloadSize = body.readUInt32BE(offset);
        offset += 4;
        let payloadBuf = body.subarray(offset, offset + payloadSize);
        if (compressionMethod === GZIP && payloadBuf.length > 0) {
          try { payloadBuf = gunzipSync(payloadBuf); } catch { /* use raw */ }
        }
        try {
          result.payload = { errorCode, ...JSON.parse(payloadBuf.toString("utf-8")) };
        } catch {
          result.payload = { errorCode, raw: payloadBuf.toString("utf-8") };
        }
      } else {
        result.payload = { errorCode };
      }
    }
    return result;
  }

  // Read event ID if MSG_WITH_EVENT flag is set
  if (flags & MSG_WITH_EVENT) {
    if (body.length < offset + 4) return result;
    result.event = body.readUInt32BE(offset);
    offset += 4;

    // Read session ID
    if (body.length < offset + 4) return result;
    const sessionIdLen = body.readUInt32BE(offset);
    offset += 4;

    if (sessionIdLen > 0 && body.length >= offset + sessionIdLen) {
      result.sessionId = body.subarray(offset, offset + sessionIdLen).toString("utf-8");
      offset += sessionIdLen;
    }
  }

  // Read payload
  if (body.length < offset + 4) return result;
  const payloadSize = body.readUInt32BE(offset);
  offset += 4;

  if (payloadSize === 0) return result;
  let payloadBuf = body.subarray(offset, offset + payloadSize);

  // Event 352 (TTS_RESPONSE) = raw audio bytes, skip decompression
  if (result.event === ServerEvent.TTS_RESPONSE) {
    result.payload = payloadBuf;
    return result;
  }

  // Decompress if needed
  if (compressionMethod === GZIP && payloadBuf.length > 0) {
    try {
      payloadBuf = gunzipSync(payloadBuf);
    } catch {
      // If decompression fails, use raw bytes
    }
  }

  // Parse JSON if applicable
  if (serializationMethod === JSON_SERIALIZATION && payloadBuf.length > 0) {
    try {
      result.payload = JSON.parse(payloadBuf.toString("utf-8"));
    } catch {
      result.payload = payloadBuf;
    }
  } else {
    result.payload = payloadBuf;
  }

  return result;
}
