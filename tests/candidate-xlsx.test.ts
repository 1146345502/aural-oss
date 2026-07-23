import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  CANDIDATE_TEMPLATE_HEADERS,
  createCandidateImportWorkbook,
  MAX_CANDIDATE_IMPORT_FILE_BYTES,
  MAX_CANDIDATE_IMPORT_ROWS,
  parseCandidateRows,
  parseCandidateWorkbook,
} from "../src/lib/candidate-xlsx";
import { createXlsxWorkbook } from "../src/lib/export-xlsx";

test("candidate template round-trips through the secured parser", () => {
  const workbook = createCandidateImportWorkbook();
  const data = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;

  const candidates = parseCandidateWorkbook(data);

  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates[0], {
    name: "Jane Smith",
    email: "jane@example.com",
    phone: "+1234567890",
    gender: "Female",
    birthday: "1996-06",
    education: "Bachelor",
    school: "MIT",
    major: "Computer Science",
    graduationYear: 2023,
    workExperience: "1 - 3 years",
  });
});

test("candidate parser does not allow spreadsheet headers to pollute prototypes", () => {
  const before = Object.getPrototypeOf({}).polluted;
  const candidates = parseCandidateRows([
    ["Name", "__proto__", "constructor"],
    ["Alice", "polluted", "also-polluted"],
  ]);

  assert.equal(candidates[0].name, "Alice");
  assert.equal(Object.getPrototypeOf({}).polluted, before);
  assert.equal(Object.prototype.hasOwnProperty.call(candidates[0], "polluted"), false);
});

test("candidate parser rejects oversized files and row sets", () => {
  assert.throws(
    () =>
      parseCandidateWorkbook(
        new ArrayBuffer(MAX_CANDIDATE_IMPORT_FILE_BYTES + 1),
      ),
    /larger than the 10 MB import limit/,
  );

  const rows = [
    [...CANDIDATE_TEMPLATE_HEADERS],
    ...Array.from({ length: MAX_CANDIDATE_IMPORT_ROWS + 1 }, (_, index) => [
      `Candidate ${index}`,
    ]),
  ];
  assert.throws(
    () => parseCandidateRows(rows),
    /more than 10,000 candidates/,
  );
});

test("generic XLSX export preserves headers and normalizes null values", () => {
  const workbook = createXlsxWorkbook([
    { Name: "Alice", Score: 95, Note: null },
  ]);
  const worksheet = workbook.Sheets.Data;

  assert.ok(worksheet);
  assert.deepEqual(
    XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }),
    [
      ["Name", "Score", "Note"],
      ["Alice", 95, ""],
    ],
  );
});
