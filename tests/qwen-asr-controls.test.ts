import assert from "node:assert/strict";
import test from "node:test";
import { filterQwenTranscript, isQwenBargeInCandidate, resolveQwenAsrLanguage, resolveQwenNoiseThreshold } from "../server/qwen-asr-controls";

test("Qwen prioritizes interview language without treating Chinese as unspecified Seed auto-detection", () => {
  for (const language of ["English", "en", "en-US", "en-GB"]) assert.equal(resolveQwenAsrLanguage(language), "en");
  for (const language of ["Chinese", "zh", "zh-CN", "Chinese (中文)", "中文"]) assert.equal(resolveQwenAsrLanguage(language), "zh");
  for (const language of [undefined, "", "Auto", "unknown"]) assert.equal(resolveQwenAsrLanguage(language), undefined);
});

test("fragment controls keep short replies, English names and substantive bilingual speech", () => {
  for (const text of ["再。", " 去！ ", "你好"]) assert.equal(filterQwenTranscript(text, "English"), "");
  for (const text of ["Yes.", "No.", "Stop!", "Qingyuan", "I use 千问 for speech recognition.", "我负责架构设计。", "2026"]) assert.equal(filterQwenTranscript(text, "English"), text);
  assert.equal(filterQwenTranscript("对。", "Chinese"), "对。");
  assert.equal(filterQwenTranscript("再。"), "再。");
});

test("ambiguous short drafts do not interrupt playback; growth and final short answers do", () => {
  for (const text of ["So", "Thank you", "And", "Well"]) assert.equal(isQwenBargeInCandidate(text, false), false);
  for (const text of ["Yes.", "No.", "Stop!", "Wait.", "I want to explain", "我想说", "So", "Thank you"]) {
    assert.equal(isQwenBargeInCandidate(text, true), true);
  }
  for (const text of ["Yes.", "No.", "Stop!", "Wait.", "I want to explain", "我想说"]) assert.equal(isQwenBargeInCandidate(text, false), true);
});

test("VAD tuning rejects invalid values instead of silently changing sensitivity", () => {
  assert.equal(resolveQwenNoiseThreshold(undefined, 0.1), 0.1);
  assert.equal(resolveQwenNoiseThreshold("", 0.3), 0.3);
  for (const value of [-1, 0, 0.1, 1]) assert.equal(resolveQwenNoiseThreshold(String(value), 0.1), value);
  for (const value of ["2", "NaN", "Infinity", "loud"]) assert.throws(() => resolveQwenNoiseThreshold(value, 0.1), /between -1 and 1/);
});
