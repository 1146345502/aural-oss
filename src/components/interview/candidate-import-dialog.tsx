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
import {
  downloadCandidateImportTemplate,
  MAX_CANDIDATE_IMPORT_FILE_BYTES,
  parseCandidateWorkbook,
  type ParsedCandidate,
} from "@/lib/candidate-xlsx";
import { trpc } from "@/lib/trpc/client";
import { CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface CandidateImportDialogProps {
  interviewId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
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

      if (file.size > MAX_CANDIDATE_IMPORT_FILE_BYTES) {
        toast({
          title: "Workbook is too large",
          description: "Upload a workbook smaller than 10 MB.",
          variant: "destructive",
        });
        e.target.value = "";
        return;
      }

      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = ev.target?.result as ArrayBuffer;
          const parsed = parseCandidateWorkbook(data);
          if (parsed.length === 0) {
            toast({
              title: "No valid sessions found",
              description:
                'Make sure your file has a "Name" column header in the first row.',
              variant: "destructive",
            });
            return;
          }
          setCandidates(parsed);
          setStep("preview");
        } catch (error) {
          toast({
            title: "Could not read workbook",
            description:
              error instanceof Error
                ? error.message
                : "The workbook is malformed or unsupported.",
            variant: "destructive",
          });
        }
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
            onClick={downloadCandidateImportTemplate}
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
