export const MIC_AUDIO_SAMPLE_RATE = 16_000;
/** Capture granularity, kept small so audio-level metering stays smooth. */
export const MIC_AUDIO_CHUNK_SAMPLES = 1_024;
/**
 * Uplink packet size. Volcengine asks for 100-200ms of audio per packet and performs best at
 * 200ms for bidirectional streaming; packets outside that range degrade recognition.
 */
export const MIC_AUDIO_FRAME_SAMPLES = 3_200;
/** Roughly 10s of frames held while a relay is still becoming ready. */
export const MIC_AUDIO_MAX_BUFFERED_CHUNKS = 50;

const BYTE_TO_HEX = Array.from({ length: 256 }, (_, value) =>
  value.toString(16).padStart(2, "0"),
);

/** Encode normalized mono samples as little-endian PCM16 hex for the relay protocol. */
export function encodeMicAudioChunk(input: Float32Array): string {
  const pcm = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    pcm[i] = Math.max(-32_768, Math.min(32_767, input[i] * 32_768));
  }

  const bytes = new Uint8Array(pcm.buffer);
  const parts = new Array<string>(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    parts[i] = BYTE_TO_HEX[bytes[i]];
  }
  return parts.join("");
}

/**
 * Regroup capture buffers into fixed-size uplink frames. Web Audio hands us power-of-two
 * buffer sizes that do not divide into the frame size the ASR provider wants, so samples
 * carry over between calls rather than being padded or dropped.
 */
export function createMicFrameChunker(
  frameSamples = MIC_AUDIO_FRAME_SAMPLES,
): (input: Float32Array, emit: (frame: Float32Array) => void) => void {
  let frame = new Float32Array(frameSamples);
  let filled = 0;

  return (input, emit) => {
    let offset = 0;
    while (offset < input.length) {
      const take = Math.min(frameSamples - filled, input.length - offset);
      frame.set(input.subarray(offset, offset + take), filled);
      filled += take;
      offset += take;

      if (filled === frameSamples) {
        emit(frame);
        frame = new Float32Array(frameSamples);
        filled = 0;
      }
    }
  };
}

/** Keep the newest microphone audio while a relay is still becoming ready. */
export function bufferMicAudioChunk(
  pending: string[],
  chunk: string,
  maxChunks = MIC_AUDIO_MAX_BUFFERED_CHUNKS,
): void {
  pending.push(chunk);
  while (pending.length > maxChunks) pending.shift();
}
