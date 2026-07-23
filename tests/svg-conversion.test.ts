import assert from "node:assert/strict";
import test from "node:test";

import { svgDataUrlToPng } from "@/lib/ai/convert-svg";

test("SVG conversion produces a valid PNG through the voice-save image path", async () => {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16">',
    '<rect width="24" height="16" fill="#2563eb"/>',
    "</svg>",
  ].join("");
  const input = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  const output = await svgDataUrlToPng(input);

  assert.match(output, /^data:image\/png;base64,/);
  const bytes = Buffer.from(output.split(",", 2)[1], "base64");
  assert.deepEqual(
    Array.from(bytes.subarray(0, 8)),
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  );
  assert.ok(bytes.byteLength > 100);
});

test("SVG conversion leaves non-SVG image data unchanged", async () => {
  const input = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(await svgDataUrlToPng(input), input);
});
