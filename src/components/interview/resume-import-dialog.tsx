"use client";

import { useOrg } from "@/components/org-provider";
import { AiButton } from "@/components/ui/ai-button";
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
import {
    AlertCircle,
    CheckCircle2,
    FileText,
    Loader2,
    Upload,
    X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface ResumeImportDialogProps {
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
  notes?: string;
}

interface ResumeEntry {
  file: File;
  status: "pending" | "parsing" | "done" | "error";
  parsed: ParsedCandidate | null;
  errorMsg?: string;
  streamText?: string;
}

type Step = "upload" | "preview" | "complete";

async function parseOneResume(
  file: File,
  onStream: (text: string) => void,
  organizationId?: string,
  interviewId?: string,
): Promise<ParsedCandidate> {
  const formData = new FormData();
  formData.append("file", file);
  if (organizationId) formData.append("organizationId", organizationId);
  if (interviewId) formData.append("interviewId", interviewId);

  const res = await fetch("/api/ai/parse-resume", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error || "Failed to parse resume");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;

      try {
        const { token, error } = JSON.parse(payload);
        if (error) throw new Error(error);
        if (token) {
          accumulated += token;
          onStream(accumulated);
        }
      } catch {
        // skip malformed SSE
      }
    }
  }

  const cleaned = accumulated
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  return JSON.parse(cleaned) as ParsedCandidate;
}

export function ResumeImportDialog({
  interviewId,
  open,
  onOpenChange,
  onImported,
}: ResumeImportDialogProps) {
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<ResumeEntry[]>([]);
  const [step, setStep] = useState<Step>("upload");
  const [importedCount, setImportedCount] = useState(0);
  const [isParsing, setIsParsing] = useState(false);
  const abortRef = useRef(false);

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

  const handleFilesSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const newEntries: ResumeEntry[] = Array.from(files).map((file) => ({
        file,
        status: "pending" as const,
        parsed: null,
      }));

      setEntries((prev) => [...prev, ...newEntries]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [],
  );

  const removeEntry = useCallback((index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleStartParsing = useCallback(async () => {
    setIsParsing(true);
    abortRef.current = false;
    let successCount = 0;

    for (let i = 0; i < entries.length; i++) {
      if (abortRef.current) break;
      if (entries[i].status === "done") {
        successCount++;
        continue;
      }

      setEntries((prev) =>
        prev.map((e, idx) =>
          idx === i ? { ...e, status: "parsing", streamText: "" } : e,
        ),
      );

      try {
        const parsed = await parseOneResume(entries[i].file, (text) => {
          setEntries((prev) =>
            prev.map((e, idx) =>
              idx === i ? { ...e, streamText: text } : e,
            ),
          );
        }, currentOrg?.id, interviewId);

        setEntries((prev) =>
          prev.map((e, idx) =>
            idx === i
              ? { ...e, status: "done", parsed, streamText: undefined }
              : e,
          ),
        );
        successCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Parse failed";
        setEntries((prev) =>
          prev.map((e, idx) =>
            idx === i
              ? { ...e, status: "error", errorMsg: msg, streamText: undefined }
              : e,
          ),
        );
      }
    }

    setIsParsing(false);
    if (successCount > 0) setStep("preview");
  }, [entries, currentOrg?.id, interviewId]);

  const successEntries = entries.filter((e) => e.status === "done" && e.parsed);

  const handleImport = useCallback(() => {
    const candidates = successEntries
      .map((e) => e.parsed!)
      .filter((c) => c.name);

    if (candidates.length === 0) return;

    bulkCreate.mutate({
      interviewId,
      candidates: candidates.map((c) => ({
        name: c.name,
        email: c.email || "",
        phone: c.phone || undefined,
        gender: c.gender || undefined,
        birthday: c.birthday || undefined,
        education: c.education || undefined,
        school: c.school || undefined,
        major: c.major || undefined,
        graduationYear: c.graduationYear
          ? Number(c.graduationYear)
          : undefined,
        workExperience: c.workExperience || undefined,
        notes: c.notes || undefined,
      })),
    });
  }, [successEntries, interviewId, bulkCreate]);

  const handleClose = useCallback(() => {
    abortRef.current = true;
    setEntries([]);
    setStep("upload");
    setImportedCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onOpenChange(false);
  }, [onOpenChange]);

  const pendingOrParsing = entries.filter(
    (e) => e.status === "pending" || e.status === "parsing",
  );
  const errorEntries = entries.filter((e) => e.status === "error");
  const stepIndex = step === "upload" ? 0 : step === "preview" ? 1 : 2;
  const allDone = entries.length > 0 && pendingOrParsing.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import by Resumes</DialogTitle>
          <DialogDescription>
            Upload PDF resumes and let AI extract session information.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center justify-between px-4 py-3">
          {["Upload", "Review", "Complete"].map((label, i) => (
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
        <div className="min-h-[240px] space-y-4">
          {step === "upload" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={handleFilesSelected}
              />

              {entries.length === 0 ? (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full border-dashed py-8"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload PDF resumes
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    You can select multiple resumes at once. Each will be parsed by AI individually.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="max-h-[300px] space-y-1.5 overflow-y-auto code-scrollbar">
                    {entries.map((entry, idx) => (
                      <div
                        key={`${entry.file.name}-${idx}`}
                        className="flex items-center gap-2 overflow-hidden rounded-lg border px-3 py-2"
                      >
                        {entry.status === "pending" && (
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        {entry.status === "parsing" && (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                        )}
                        {entry.status === "done" && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-secondary-500" />
                        )}
                        {entry.status === "error" && (
                          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                        )}

                        <div className="w-0 flex-1 overflow-hidden">
                          <p className="truncate text-sm">{entry.file.name}</p>
                          {entry.status === "parsing" && entry.streamText && (
                            <p className="truncate font-mono text-[11px] text-muted-foreground">
                              {entry.streamText.slice(-80)}
                            </p>
                          )}
                          {entry.status === "done" && entry.parsed && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {entry.parsed.name}
                              {entry.parsed.email ? ` · ${entry.parsed.email}` : ""}
                            </p>
                          )}
                          {entry.status === "error" && (
                            <p className="mt-0.5 text-xs text-destructive">
                              {entry.errorMsg}
                            </p>
                          )}
                        </div>

                        {!isParsing && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 shrink-0 p-0"
                            onClick={() => removeEntry(idx)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  {!isParsing && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="mr-2 h-3.5 w-3.5" />
                      Add more files
                    </Button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <div className="flex items-center gap-2">
                  {allDone && successEntries.length > 0 && (
                    <Button onClick={() => setStep("preview")}>
                      Review ({successEntries.length})
                    </Button>
                  )}
                  {!allDone && entries.length > 0 && (
                    <AiButton
                      size="sm"
                      loading={isParsing}
                      onClick={handleStartParsing}
                    >
                      {isParsing
                        ? "Parsing..."
                        : `Parse resumes (${entries.length})`}
                    </AiButton>
                  )}
                </div>
              </div>

              {allDone && errorEntries.length > 0 && successEntries.length === 0 && (
                <p className="text-center text-sm text-destructive">
                  All resumes failed to parse. Please check the files and try again.
                </p>
              )}
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
                      {successEntries.map((entry, i) => {
                        const c = entry.parsed!;
                        return (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-2">{c.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{c.email || "-"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{c.phone || "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                {successEntries.length} session{successEntries.length !== 1 ? "s" : ""} ready to import.
                {errorEntries.length > 0 && (
                  <span className="text-destructive">
                    {" "}{errorEntries.length} failed.
                  </span>
                )}
              </p>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep("upload")}>
                  Back
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={bulkCreate.isLoading || successEntries.length === 0}
                >
                  {bulkCreate.isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Import ({successEntries.length})
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
                {importedCount !== 1 ? "s" : ""} from resumes.
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
