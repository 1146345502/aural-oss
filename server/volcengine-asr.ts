/**
 * Volcengine Big-Model streaming ASR (Speech-to-Text) binary protocol.
 *
 * Endpoint: wss://openspeech.bytedance.com/api/v3/sauc/bigmodel
 * Docs:     https://www.volcengine.com/docs/6561/1354869
 *
 * Key differences from the standard /api/v2/asr:
 *   - Auth via X-Api-Resource-Id / X-Api-Access-Key / X-Api-App-Key headers
 *   - Sequence numbers in both client and server packets
 *   - SERVER_ACK (0b1011) message type
 *   - No app.appid/token/cluster in JSON; uses model_name in request
 */
import { gunzipSync, gzipSync } from "zlib";

const PROTOCOL_VERSION = 0b0001;
const HEADER_SIZE_UNITS = 0b0001;

const CLIENT_FULL_REQUEST = 0b0001;
const CLIENT_AUDIO_ONLY = 0b0010;
const SERVER_FULL_RESPONSE = 0b1001;
const SERVER_ACK = 0b1011;
const SERVER_ERROR = 0b1111;

const FLAG_POS_SEQ = 0b0001;
const FLAG_NEG_WITH_SEQ = 0b0011;

const SERIAL_NONE = 0b0000;
const SERIAL_JSON = 0b0001;

const COMP_GZIP = 0b0001;

export const BIGMODEL_ASR_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel";

export interface BigModelAsrConfig {
  language?: string;
  format?: string;
  rate?: number;
  bits?: number;
  channels?: number;
  codec?: string;
  modelName?: string;
  enableItn?: boolean;
  enablePunc?: boolean;
  enableDdc?: boolean;
  showUtterance?: boolean;
  resultType?: string;
  vadSegmentDuration?: number;
  endWindowSize?: number;
  forceToSpeechTime?: number;
}

export function buildBigModelHeaders(
  appId: string,
  accessToken: string,
  reqid: string,
  sourceType: "duration" | "concurrent" = "duration",
): Record<string, string> {
  return {
    "X-Api-Resource-Id": sourceType === "duration"
      ? "volc.bigasr.sauc.duration"
      : "volc.bigasr.sauc.concurrent",
    "X-Api-Access-Key": accessToken,
    "X-Api-App-Key": appId,
    "X-Api-Request-Id": reqid,
  };
}

function buildHeader(
  messageType: number,
  flags: number,
  serialMethod: number,
  compression: number,
): Buffer {
  const buf = Buffer.alloc(4);
  buf[0] = (PROTOCOL_VERSION << 4) | HEADER_SIZE_UNITS;
  buf[1] = (messageType << 4) | flags;
  buf[2] = (serialMethod << 4) | compression;
  buf[3] = 0x00;
  return buf;
}

export function buildBigModelFullRequest(config: BigModelAsrConfig, uid: string): Buffer {
  const header = buildHeader(CLIENT_FULL_REQUEST, FLAG_POS_SEQ, SERIAL_JSON, COMP_GZIP);

  const payload = {
    user: { uid },
    audio: {
      format: config.format || "pcm",
      rate: config.rate || 16000,
      bits: config.bits || 16,
      channels: config.channels || 1,
      codec: config.codec || "raw",
    },
    request: {
      model_name: config.modelName || "bigmodel",
      enable_itn: config.enableItn ?? false,
      enable_punc: config.enablePunc ?? true,
      enable_ddc: config.enableDdc ?? false,
      show_utterance: config.showUtterance ?? true,
      result_type: config.resultType || "single",
      vad_segment_duration: config.vadSegmentDuration ?? 3000,
      end_window_size: config.endWindowSize ?? 500,
      force_to_speech_time: config.forceToSpeechTime ?? 1000,
    },
  };

  const compressed = gzipSync(Buffer.from(JSON.stringify(payload)));

  const seqBuf = Buffer.alloc(4);
  seqBuf.writeInt32BE(1);

  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32BE(compressed.length);

  return Buffer.concat([header, seqBuf, sizeBuf, compressed]);
}

/**
 * Wraps PCM audio in a Big-Model audio-only request with sequence number.
 * The final packet should set `isLast=true` and the sequence will be negated.
 */
export function buildBigModelAudioRequest(
  audioData: Buffer,
  sequence: number,
  isLast = false,
): Buffer {
  const flags = isLast ? FLAG_NEG_WITH_SEQ : FLAG_POS_SEQ;
  const header = buildHeader(CLIENT_AUDIO_ONLY, flags, SERIAL_NONE, COMP_GZIP);

  const compressed = gzipSync(audioData);

  const seqBuf = Buffer.alloc(4);
  seqBuf.writeInt32BE(isLast ? -sequence : sequence);

  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32BE(compressed.length);

  return Buffer.concat([header, seqBuf, sizeBuf, compressed]);
}

export interface AsrUtterance {
  text: string;
  definite: boolean;
  start_time?: number;
  end_time?: number;
}

export interface AsrResponse {
  messageType: number;
  isLastPackage?: boolean;
  sequence?: number;
  reqid?: string;
  code?: number;
  message?: string;
  text?: string;
  utterances?: AsrUtterance[];
  errorCode?: number;
  errorMessage?: string;
}

export function parseAsrResponse(data: Buffer): AsrResponse {
  if (!data || data.length < 4) return { messageType: 0 };

  const messageType = data[1] >> 4;
  const flags = data[1] & 0x0f;
  const compressionMethod = data[2] & 0x0f;
  const headerBytes = (data[0] & 0x0f) * 4;

  let body = data.subarray(headerBytes);
  const hasSeq = !!(flags & 0x01);
  const isLast = !!(flags & 0x02);

  let sequence: number | undefined;
  if (hasSeq && body.length >= 4) {
    sequence = body.readInt32BE(0);
    body = body.subarray(4);
  }

  if (messageType === SERVER_ACK) {
    let ackPayload: Record<string, unknown> | undefined;
    if (body.length >= 4) {
      const payloadSize = body.readUInt32BE(0);
      if (payloadSize > 0) {
        let payloadBuf = body.subarray(4, 4 + payloadSize);
        if (compressionMethod === COMP_GZIP && payloadBuf.length > 0) {
          try { payloadBuf = gunzipSync(payloadBuf); } catch { /* use raw */ }
        }
        try { ackPayload = JSON.parse(payloadBuf.toString("utf-8")); } catch { /* ignore */ }
      }
    }
    return {
      messageType,
      sequence,
      isLastPackage: isLast,
      code: ackPayload?.code as number | undefined,
      message: ackPayload?.message as string | undefined,
    };
  }

  if (messageType === SERVER_ERROR) {
    if (body.length >= 8) {
      const errorCode = body.readUInt32BE(0);
      const msgSize = body.readUInt32BE(4);
      let msgBuf = body.subarray(8, 8 + msgSize);
      if (compressionMethod === COMP_GZIP && msgBuf.length > 0) {
        try { msgBuf = gunzipSync(msgBuf); } catch { /* use raw */ }
      }
      return { messageType, errorCode, errorMessage: msgBuf.toString("utf-8"), sequence };
    }
    return { messageType, errorCode: -1, sequence };
  }

  if (messageType === SERVER_FULL_RESPONSE && body.length >= 4) {
    const payloadSize = body.readUInt32BE(0);
    let payloadBuf = body.subarray(4, 4 + payloadSize);

    if (compressionMethod === COMP_GZIP && payloadBuf.length > 0) {
      try { payloadBuf = gunzipSync(payloadBuf); } catch {
        return { messageType, errorCode: -2, errorMessage: "gzip decompression failed", sequence };
      }
    }

    try {
      const json = JSON.parse(payloadBuf.toString("utf-8"));
      return {
        messageType,
        isLastPackage: isLast,
        sequence,
        reqid: json.reqid,
        code: json.code,
        message: typeof json.message === "string" ? json.message : JSON.stringify(json.message),
        text: json.result?.text,
        utterances: json.result?.utterances,
      };
    } catch {
      return { messageType, errorCode: -3, errorMessage: `unparseable payload (${payloadBuf.length}B)`, sequence };
    }
  }

  return { messageType, sequence, isLastPackage: isLast };
}
