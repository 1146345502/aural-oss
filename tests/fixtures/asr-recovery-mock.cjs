/* eslint-disable @typescript-eslint/no-require-imports -- Node's --require preloads this isolated CommonJS fixture. */
// Replace provider calls only in the isolated relay test process. No API keys,
// external network calls or production test hooks are needed to replay a fault.
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const originalLoad = Module._load;
const prefix = 'I start by understanding the problem and defining success. I discuss requirements with the team and measure scalability before selecting the architecture.';
let connections = 0;

class FakeAsr extends EventEmitter {
  constructor(options) {
    super();
    const { createQwenAudioAsrState, parseQwenAudioAsrResponse } = require('../../server/qwen-audio-asr');
    this.nativeState = createQwenAudioAsrState(options?.config.language);
    this.parseNative = parseQwenAudioAsrResponse;
  }
  readyState = 1;
  started = false;
  connection = ++connections;
  parseMessage(data) {
    const packet = JSON.parse(data.toString());
    return process.env.ASR_TEST_FAULT === 'fragments' ? this.parseNative(this.nativeState, packet, 'task') : packet;
  }
  sendAudio(pcm) {
    if (process.env.ASR_TEST_FAULT === 'fragments') {
      if (pcm.length < 2) return;
      const level = pcm.readInt16LE(0);
      if (level !== 6000 && level !== 8000) return;
      const sentenceId = level === 6000 ? 1 : 2;
      const emitNative = (text, final) => this.emit('message', Buffer.from(JSON.stringify({
        header: { task_id: 'task', event: 'result-generated' },
        payload: { output: { sentence: { sentence_id: sentenceId, text, sentence_end: final } } },
      })));
      if (level === 6000) {
        setTimeout(() => emitNative('So', false), 10);
        setTimeout(() => emitNative('再。', true), 150);
      } else setTimeout(() => emitNative('Yes.', true), 10);
      return;
    }
    if (this.started || pcm.length < 2 || Math.abs(pcm.readInt16LE(0)) < 1000) return;
    this.started = true;
    const emitText = (text, definite) => {
      if (this.readyState !== 1) return;
      this.emit('message', Buffer.from(JSON.stringify({ text, utterances: [{ text, definite }] })));
    };
    if (this.connection <= 2) {
      setTimeout(() => emitText(prefix, true), 10);
      if (process.env.ASR_TEST_FAULT === 'disconnect') {
        setTimeout(() => {
          if (this.readyState !== 1) return;
          this.readyState = 3;
          this.emit('close', 1006, Buffer.from('simulated provider loss'));
        }, 1500);
      }
    } else {
      setTimeout(() => emitText('phantom tail', false), 20);
      setTimeout(() => emitText('', true), 120);
    }
  }
  finish() {}
  close() { this.readyState = 3; }
}

Module._load = function(request, parent) {
  if (parent?.filename.endsWith('/server/voice-relay.ts')) {
    if (request === './streaming-asr') return {
      resolveAsrProvider: () => 'qwen-audio',
      connectStreamingAsr: async (options) => new FakeAsr(options),
    };
    if (request === './relay-llm') return {
      logRelayLlmStartup() {},
      callRelayLLM: async () => 'Could you explain how you tested the architecture?',
    };
    if (request === './volcengine-tts') return {
      ...originalLoad.apply(this, arguments),
      synthesizeSpeech: async function*() {
        yield { type: 'audio', audio: Buffer.alloc(480) };
        yield { type: 'done' };
      },
    };
  }
  return originalLoad.apply(this, arguments);
};
