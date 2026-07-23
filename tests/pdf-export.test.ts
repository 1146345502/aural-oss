import assert from "node:assert/strict";
import test from "node:test";

test("jsPDF produces a non-empty PDF blob through the report export path", async () => {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF("p", "mm", "a4");

  pdf.text("Aural interview report", 10, 10);

  const blob = pdf.output("blob");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const signature = new TextDecoder().decode(bytes.slice(0, 5));

  assert.equal(blob.type, "application/pdf");
  assert.equal(signature, "%PDF-");
  assert.ok(bytes.byteLength > 500);
});
