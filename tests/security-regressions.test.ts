import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeRichHtml } from "@/components/ui/rich-text-editor";
import { nanoid } from "@/lib/id";

test("SSR rich-text sanitization cannot be bypassed with nested brackets", () => {
  const malicious =
    'safe<<script src=x>script>alert(1)</script><img src=x onerror=alert(2)>end';
  const sanitized = sanitizeRichHtml(malicious);

  assert.equal(sanitized, "safescriptalert(1)end");
  assert.doesNotMatch(sanitized, /[<>]/);
});

test("nanoid returns the requested number of allowed characters", () => {
  for (const size of [0, 1, 21, 64]) {
    const id = nanoid(size);
    assert.equal(id.length, size);
    assert.match(id, /^[a-z0-9]*$/);
  }
});

test("nanoid rejects invalid sizes", () => {
  assert.throws(() => nanoid(-1), RangeError);
  assert.throws(() => nanoid(1.5), RangeError);
});
