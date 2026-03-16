"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import * as XLSX from "xlsx";

interface CandidateImportDialogProps {
  interviewId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface ParsedCandidate {
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

const TEMPLATE_HEADERS = [
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
];

const INSTRUCTIONS = [
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
];

function generateTemplate(): void {
  const instructionRows: (string | number)[][] = INSTRUCTIONS.map((line) => [line]);
  const data = [
    ...instructionRows,
    TEMPLATE_HEADERS,
    ["Jane Smith", "jane@example.com", "+1234567890", "Female", "1996-06", "Bachelor", "MIT", "Computer Science", 2023, "1 - 3 years"],
    ["Bob Wang", "bob@example.com", "+9876543210", "Male", "1998-01", "Master", "Stanford University", "Data Science", 2025, "Less than one year"],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const numCols = TEMPLATE_HEADERS.length;

  // Set column widths
  ws["!cols"] = TEMPLATE_HEADERS.map((h) => ({
    wch: Math.max(h.length + 4, 18),
  }));

  // Merge each instruction row across all columns so text doesn't overflow
  ws["!merges"] = INSTRUCTIONS.map((_, i) => ({
    s: { r: i, c: 0 },
    e: { r: i, c: numCols - 1 },
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sessions");
  XLSX.writeFile(wb, "Candidate_Import_Template.xlsx");
}

function parseExcel(data: ArrayBuffer): ParsedCandidate[] {
  const wb = XLSX.read(data, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];

  // Convert entire sheet to array-of-arrays to find the header row
  const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1,
    defval: "",
  });

  // Find the header row by looking for "Name" in the first cell
  let headerIndex = -1;
  for (let i = 0; i < allRows.length; i++) {
    const firstCell = String(allRows[i]?.[0] ?? "").toLowerCase().trim();
    if (firstCell === "name") {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) return [];

  const headers = (allRows[headerIndex] as (string | number | null)[]).map((h) =>
    String(h ?? "").toLowerCase().trim(),
  );

  const results: ParsedCandidate[] = [];

  for (let i = headerIndex + 1; i < allRows.length; i++) {
    const row = allRows[i] as (string | number | null)[];
    if (!row || row.every((c) => !c && c !== 0)) continue;

    // Build a normalized key-value map from headers
    const normalized: Record<string, string> = {};
    headers.forEach((key, idx) => {
      normalized[key] = String(row[idx] ?? "").trim();
    });

    const name = normalized["name"] || "";
    if (!name) continue;

    const candidate: ParsedCandidate = { name };

    const email = normalized["email"] || normalized["e-mail"] || "";
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      candidate.email = email.toLowerCase();
    }

    if (normalized["phone"]) candidate.phone = normalized["phone"];
    if (normalized["gender"]) candidate.gender = normalized["gender"];
    if (normalized["birthday"]) candidate.birthday = normalized["birthday"];
    if (normalized["education"]) candidate.education = normalized["education"];
    if (normalized["school"]) candidate.school = normalized["school"];
    if (normalized["major"]) candidate.major = normalized["major"];

    const gradYear = normalized["graduation year"] || normalized["graduationyear"] || "";
    if (gradYear) {
      const yr = parseInt(gradYear, 10);
      if (!isNaN(yr)) candidate.graduationYear = yr;
    }

    const workExp = normalized["work experience"] || normalized["workexperience"] || "";
    if (workExp) candidate.workExperience = workExp;

    results.push(candidate);
  }

  return results;
}

type Step = "upload" | "preview" | "complete";

export function CandidateImportDialog({
  interviewId,
  open,
  onOpenChange,
  onImported,
}: CandidateImportDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [candidates, setCandidates] = useState<ParsedCandidate[]>([]);
  const [fileName, setFileName] = useState("");
  const [importedCount, setImportedCount] = useState(0);

  const bulkCreate = trpc.candidate.bulkCreate.useMutation({
    onSuccess: (data) => {
      setImportedCount(data.created);
      setStep("complete");
      onImported();
    },
    onError: (err) => {
      toast({
        title: "Import failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = ev.target?.result as ArrayBuffer;
        const parsed = parseExcel(data);
        if (parsed.length === 0) {
          toast({
            title: "No valid sessions found",
            description: 'Make sure your file has a "Name" column header in the first row.',
            variant: "destructive",
          });
          return;
        }
        setCandidates(parsed);
        setStep("preview");
      };
      reader.readAsArrayBuffer(file);
    },
    [toast],
  );

  const handleImport = useCallback(() => {
    if (candidates.length === 0) return;
    bulkCreate.mutate({
      interviewId,
      candidates: candidates.map((c) => ({
        ...c,
        email: c.email || "",
      })),
    });
  }, [candidates, interviewId, bulkCreate]);

  const handleClose = useCallback(() => {
    setStep("upload");
    setCandidates([]);
    setFileName("");
    setImportedCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onOpenChange(false);
  }, [onOpenChange]);

  const stepIndex = step === "upload" ? 0 : step === "preview" ? 1 : 2;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Sessions</DialogTitle>
          <DialogDescription>
            Download the template, fill in session details, and upload to import.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center justify-between px-4 py-3">
          {["Upload", "Import", "Complete"].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                  i <= stepIndex
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i < stepIndex ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-sm ${
                  i <= stepIndex ? "font-medium" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
              {i < 2 && (
                <div
                  className={`mx-2 h-px w-12 ${
                    i < stepIndex ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[200px] space-y-4">
          {step === "upload" && (
            <>
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">
                  1. Download the{" "}
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={generateTemplate}
                  >
                    Candidate_Import_Template.xlsx
                  </button>{" "}
                  to import sessions and make sure all cells are in text format.
                </p>
                <p className="text-sm text-muted-foreground">
                  2. Name is required for each session.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileUpload}
              />

              {fileName ? (
                <div className="flex items-center gap-2 rounded-lg border p-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{fileName}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFileName("");
                      setCandidates([]);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full border-dashed py-8"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </Button>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (candidates.length > 0) setStep("preview");
                  }}
                  disabled={candidates.length === 0}
                >
                  Next
                </Button>
              </div>
            </>
          )}

          {step === "preview" && (
            <>
              <div className="rounded-lg border">
                <div className="max-h-[300px] overflow-auto code-scrollbar">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">#</th>
                        <th className="px-3 py-2 text-left font-medium">Name</th>
                        <th className="px-3 py-2 text-left font-medium">Email</th>
                        <th className="px-3 py-2 text-left font-medium">Phone</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((c, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2">{c.name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{c.email || "-"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{c.phone || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {candidates.length} session{candidates.length !== 1 ? "s" : ""} ready to import.
              </p>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep("upload")}>
                  Back
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={bulkCreate.isLoading}
                >
                  {bulkCreate.isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Import ({candidates.length})
                </Button>
              </div>
            </>
          )}

          {step === "complete" && (
            <div className="flex flex-col items-center py-8">
              <CheckCircle2 className="h-12 w-12 text-secondary-500" />
              <h3 className="mt-4 text-lg font-semibold">Import Complete</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Successfully imported {importedCount} session
                {importedCount !== 1 ? "s" : ""}.
              </p>
              <Button className="mt-6" onClick={handleClose}>
                Done
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
