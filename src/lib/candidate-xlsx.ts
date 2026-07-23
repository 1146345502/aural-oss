import * as XLSX from "xlsx";

export interface ParsedCandidate {
  name: string;
  email?: string;
  phone?: string;
  gender?: string;
  birthday?: string;
  education?: string;
  school?: string;
  major?: string;
  graduationYear?: number;
  workExperience?: string;
}

export const MAX_CANDIDATE_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_CANDIDATE_IMPORT_ROWS = 10_000;

export const CANDIDATE_TEMPLATE_HEADERS = [
  "Name",
  "Email",
  "Phone",
  "Gender",
  "Birthday",
  "Education",
  "School",
  "Major",
  "Graduation Year",
  "Work Experience",
] as const;

const CANDIDATE_TEMPLATE_INSTRUCTIONS = [
  "Import Instructions",
  '1. Fields marked with * are required. If they are not filled in, the entire line will not be imported.',
  '2. "Name" *: participant\'s full name.',
  '3. "Email": valid email address, optional.',
  '4. "Phone": phone number with country code, optional.',
  '5. "Gender": options: Male, Female, Other.',
  '6. "Birthday": fill in the format of YYYY-MM, such as "1996-06".',
  '7. "Education": single choice, options: College, Bachelor, Master, PhD, MBA, Other.',
  '8. "School": school name.',
  '9. "Major": field of study.',
  '10. "Graduation Year": graduation year of the highest degree, fill in the format of YYYY, such as "2019".',
  '11. "Work Experience": options: Less than one year, 1 - 3 years, 3 - 5 years, 5 - 10 years, More than 10 years.',
  "12. Upload up to 10,000 records at a time.",
] as const;

type CandidateCell = string | number | null;
type CandidateRow = CandidateCell[];

export function createCandidateImportWorkbook(): XLSX.WorkBook {
  const instructionRows: CandidateRow[] = CANDIDATE_TEMPLATE_INSTRUCTIONS.map(
    (line) => [line],
  );
  const data: CandidateRow[] = [
    ...instructionRows,
    [...CANDIDATE_TEMPLATE_HEADERS],
    [
      "Jane Smith",
      "jane@example.com",
      "+1234567890",
      "Female",
      "1996-06",
      "Bachelor",
      "MIT",
      "Computer Science",
      2023,
      "1 - 3 years",
    ],
    [
      "Bob Wang",
      "bob@example.com",
      "+9876543210",
      "Male",
      "1998-01",
      "Master",
      "Stanford University",
      "Data Science",
      2025,
      "Less than one year",
    ],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const columnCount = CANDIDATE_TEMPLATE_HEADERS.length;

  worksheet["!cols"] = CANDIDATE_TEMPLATE_HEADERS.map((header) => ({
    wch: Math.max(header.length + 4, 18),
  }));
  worksheet["!merges"] = CANDIDATE_TEMPLATE_INSTRUCTIONS.map((_, index) => ({
    s: { r: index, c: 0 },
    e: { r: index, c: columnCount - 1 },
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sessions");
  return workbook;
}

export function downloadCandidateImportTemplate(): void {
  XLSX.writeFile(
    createCandidateImportWorkbook(),
    "Candidate_Import_Template.xlsx",
  );
}

export function parseCandidateRows(allRows: CandidateRow[]): ParsedCandidate[] {
  const headerIndex = allRows.findIndex(
    (row) => String(row?.[0] ?? "").toLowerCase().trim() === "name",
  );
  if (headerIndex === -1) return [];

  const headers = allRows[headerIndex].map((header) =>
    String(header ?? "").toLowerCase().trim(),
  );
  const results: ParsedCandidate[] = [];

  for (let index = headerIndex + 1; index < allRows.length; index += 1) {
    const row = allRows[index];
    if (!row || row.every((cell) => !cell && cell !== 0)) continue;

    // A null-prototype map prevents spreadsheet headers such as "__proto__"
    // from mutating the object prototype while values are normalized.
    const normalized: Record<string, string> = Object.create(null);
    headers.forEach((key, columnIndex) => {
      normalized[key] = String(row[columnIndex] ?? "").trim();
    });

    const name = normalized["name"] || "";
    if (!name) continue;

    if (results.length >= MAX_CANDIDATE_IMPORT_ROWS) {
      throw new Error(
        `The workbook contains more than ${MAX_CANDIDATE_IMPORT_ROWS.toLocaleString()} candidates.`,
      );
    }

    const candidate: ParsedCandidate = { name };
    const email = normalized["email"] || normalized["e-mail"] || "";
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      candidate.email = email.toLowerCase();
    }

    if (normalized["phone"]) candidate.phone = normalized["phone"];
    if (normalized["gender"]) candidate.gender = normalized["gender"];
    if (normalized["birthday"]) candidate.birthday = normalized["birthday"];
    if (normalized["education"]) {
      candidate.education = normalized["education"];
    }
    if (normalized["school"]) candidate.school = normalized["school"];
    if (normalized["major"]) candidate.major = normalized["major"];

    const graduationYear =
      normalized["graduation year"] || normalized["graduationyear"] || "";
    if (graduationYear) {
      const parsedYear = Number.parseInt(graduationYear, 10);
      if (!Number.isNaN(parsedYear)) candidate.graduationYear = parsedYear;
    }

    const workExperience =
      normalized["work experience"] || normalized["workexperience"] || "";
    if (workExperience) candidate.workExperience = workExperience;

    results.push(candidate);
  }

  return results;
}

export function parseCandidateWorkbook(data: ArrayBuffer): ParsedCandidate[] {
  if (data.byteLength > MAX_CANDIDATE_IMPORT_FILE_BYTES) {
    throw new Error("The workbook is larger than the 10 MB import limit.");
  }

  const workbook = XLSX.read(data, {
    type: "array",
    sheetRows:
      CANDIDATE_TEMPLATE_INSTRUCTIONS.length +
      MAX_CANDIDATE_IMPORT_ROWS +
      2,
  });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) return [];

  const allRows = XLSX.utils.sheet_to_json<CandidateRow>(worksheet, {
    header: 1,
    defval: "",
  });
  return parseCandidateRows(allRows);
}
