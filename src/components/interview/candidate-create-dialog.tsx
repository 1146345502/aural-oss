"use client";

import { useOrg } from "@/components/org-provider";
import { AiButton } from "@/components/ui/ai-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
    CalendarIcon,
    ChevronLeft,
    ChevronRight,
    FileText,
    Loader2,
    Sparkles,
    Upload,
    X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const EDUCATION_OPTIONS = ["College", "Bachelor", "Master", "PhD", "MBA", "Other"];
const WORK_EXPERIENCE_OPTIONS = [
  "Less than one year",
  "1 - 3 years",
  "3 - 5 years",
  "5 - 10 years",
  "More than 10 years",
];
const GENDER_OPTIONS = ["Male", "Female", "Other"];

const currentYear = new Date().getFullYear();
const GRADUATION_YEARS = Array.from({ length: 50 }, (_, i) => currentYear - 40 + i);

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const BIRTHDAY_YEAR_MIN = currentYear - 78;
const BIRTHDAY_YEAR_MAX = currentYear - 18;

function MonthYearPicker({
  year,
  month,
  onChangeYear,
  onChangeMonth,
  placeholder,
  yearMin,
  yearMax,
}: {
  year: string;
  month: string;
  onChangeYear: (y: string) => void;
  onChangeMonth: (m: string) => void;
  placeholder: string;
  yearMin: number;
  yearMax: number;
}) {
  const [pickerYear, setPickerYear] = useState(
    year ? parseInt(year) : currentYear - 25,
  );
  const [open, setOpen] = useState(false);

  const displayValue =
    year && month ? `${year}/${month}` : year ? year : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-8 w-full justify-start text-left text-sm font-normal",
            !displayValue && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {displayValue || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="mb-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setPickerYear((y) => Math.max(yearMin, y - 1))}
            disabled={pickerYear <= yearMin}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">{pickerYear}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setPickerYear((y) => Math.min(yearMax, y + 1))}
            disabled={pickerYear >= yearMax}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTH_LABELS.map((label, i) => {
            const mVal = String(i + 1).padStart(2, "0");
            const isSelected = String(pickerYear) === year && mVal === month;
            return (
              <Button
                key={label}
                type="button"
                variant={isSelected ? "default" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  onChangeYear(String(pickerYear));
                  onChangeMonth(mVal);
                  setOpen(false);
                }}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// --- Helpers for streaming resume parse ---
function applyParsedData(
  data: Record<string, unknown>,
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>,
) {
  setForm((prev) => {
    const next = { ...prev };
    if (data.name && typeof data.name === "string") next.name = data.name;
    if (data.email && typeof data.email === "string") next.email = data.email;
    if (data.phone && typeof data.phone === "string") next.phone = String(data.phone);
    if (typeof data.gender === "string" && GENDER_OPTIONS.includes(data.gender))
      next.gender = data.gender;
    if (typeof data.birthday === "string" && data.birthday) {
      const parts = data.birthday.split("-");
      if (parts[0]) next.birthdayYear = parts[0];
      if (parts[1]) next.birthdayMonth = parts[1].padStart(2, "0");
    }
    if (typeof data.education === "string" && EDUCATION_OPTIONS.includes(data.education))
      next.education = data.education;
    if (data.school && typeof data.school === "string") next.school = data.school;
    if (data.major && typeof data.major === "string") next.major = data.major;
    if (data.graduationYear != null)
      next.graduationYear = String(data.graduationYear);
    if (
      typeof data.workExperience === "string" &&
      WORK_EXPERIENCE_OPTIONS.includes(data.workExperience)
    )
      next.workExperience = data.workExperience;
    if (data.notes && typeof data.notes === "string") next.notes = data.notes;
    return next;
  });
}

// --- Main component ---
interface CandidateCreateDialogProps {
  interviewId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  gender: "",
  birthdayYear: "",
  birthdayMonth: "",
  education: "",
  school: "",
  major: "",
  graduationYear: "",
  workExperience: "",
  notes: "",
};

export function CandidateCreateDialog({
  interviewId,
  open,
  onOpenChange,
  onCreated,
}: CandidateCreateDialogProps) {
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [resumeFile, setResumeFile] = useState<string>("");
  const [parsingResume, setParsingResume] = useState(false);
  const [streamText, setStreamText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const streamEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
    streamEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [streamText]);

  const createMutation = trpc.candidate.create.useMutation({
    onSuccess: (data) => {
      if (data.inviteToken) {
        const link = `${window.location.origin}/i/invite/${data.inviteToken}`;
        navigator.clipboard.writeText(link).catch(() => {});
        toast({
          title: "Session added",
          description: "Invite link copied to clipboard",
        });
      } else {
        toast({ title: "Session added" });
      }
      setForm({ ...EMPTY_FORM });
      setResumeFile("");
      setStreamText("");
      onCreated();
      onOpenChange(false);
    },
    onError: (err) => {
      toast({
        title: "Failed to add session",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    const birthday =
      form.birthdayYear && form.birthdayMonth
        ? `${form.birthdayYear}-${form.birthdayMonth}`
        : undefined;

    createMutation.mutate({
      interviewId,
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      gender: form.gender || undefined,
      birthday,
      education: form.education || undefined,
      school: form.school.trim() || undefined,
      major: form.major.trim() || undefined,
      graduationYear: form.graduationYear
        ? parseInt(form.graduationYear, 10)
        : undefined,
      workExperience: form.workExperience || undefined,
      notes: form.notes.trim() || undefined,
    });
  };

  const update = useCallback(
    (field: string, value: string) =>
      setForm((prev) => ({ ...prev, [field]: value })),
    [],
  );

  const handleResumeUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setResumeFile(file.name);
      setParsingResume(true);
      setStreamText("");

      try {
        const formData = new FormData();
        formData.append("file", file);
        if (currentOrg?.id) formData.append("organizationId", currentOrg.id);
        if (interviewId) formData.append("interviewId", interviewId);

        const res = await fetch("/api/ai/parse-resume", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json();
          toast({ title: "Failed to parse resume", description: errData.error, variant: "destructive" });
          setParsingResume(false);
          return;
        }

        // Consume SSE stream
        const reader = res.body?.getReader();
        if (!reader) {
          toast({
            title: "Failed to parse resume",
            description: "No response stream",
            variant: "destructive",
          });
          setParsingResume(false);
          return;
        }

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
              if (error) {
                toast({
                  title: "Parse error",
                  description: error,
                  variant: "destructive",
                });
                continue;
              }
              if (token) {
                accumulated += token;
                setStreamText(accumulated);
              }
            } catch {
              // skip malformed SSE
            }
          }
        }

        // Parse final accumulated JSON
        const cleaned = accumulated
          .replace(/```json\s*/g, "")
          .replace(/```\s*/g, "")
          .trim();

        try {
          const parsed = JSON.parse(cleaned);
          applyParsedData(parsed, setForm);
          toast({ title: "Resume parsed successfully" });
        } catch {
          toast({
            title: "Failed to parse resume result",
            description: "AI response was not valid JSON. Please try again.",
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: "Failed to parse resume",
          description: "Network error. Please try again.",
          variant: "destructive",
        });
      } finally {
        setParsingResume(false);
      }
    },
    [toast, currentOrg?.id, interviewId],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto code-scrollbar sm:max-w-lg md:max-w-xl"
        data-tour="save-candidate"
      >
        <SheetHeader>
          <SheetTitle>Create individually</SheetTitle>
          <SheetDescription>
            Add session details manually or extract from a resume.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="-mt-2 flex-1 space-y-3">
          {/* ── Fields ── */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <div className="space-y-1">
              <Label htmlFor="c-name" className="text-xs">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="c-name"
                placeholder="Enter name"
                required
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-email" className="text-xs">Email</Label>
              <Input
                id="c-email"
                type="email"
                placeholder="Enter email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-phone" className="text-xs">Phone</Label>
              <Input
                id="c-phone"
                placeholder="Enter phone"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Gender</Label>
              <Select
                value={form.gender || undefined}
                onValueChange={(v) => update("gender", v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Birth Date</Label>
              <MonthYearPicker
                year={form.birthdayYear}
                month={form.birthdayMonth}
                onChangeYear={(y) => update("birthdayYear", y)}
                onChangeMonth={(m) => update("birthdayMonth", m)}
                placeholder="Select birth date"
                yearMin={BIRTHDAY_YEAR_MIN}
                yearMax={BIRTHDAY_YEAR_MAX}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Degree</Label>
              <Select
                value={form.education || undefined}
                onValueChange={(v) => update("education", v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select degree" />
                </SelectTrigger>
                <SelectContent>
                  {EDUCATION_OPTIONS.map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-school" className="text-xs">School</Label>
              <Input
                id="c-school"
                placeholder="Enter school"
                value={form.school}
                onChange={(e) => update("school", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-major" className="text-xs">Major</Label>
              <Input
                id="c-major"
                placeholder="Enter major"
                value={form.major}
                onChange={(e) => update("major", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Graduation Year</Label>
              <Select
                value={form.graduationYear || undefined}
                onValueChange={(v) => update("graduationYear", v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {GRADUATION_YEARS.map((y) => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Work Experience</Label>
              <Select
                value={form.workExperience || undefined}
                onValueChange={(v) => update("workExperience", v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select work experience" />
                </SelectTrigger>
                <SelectContent>
                  {WORK_EXPERIENCE_OPTIONS.map((w) => (
                    <SelectItem key={w} value={w}>{w}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="c-notes" className="text-xs">Notes</Label>
              <Textarea
                id="c-notes"
                placeholder="Enter notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>
          </div>

          {/* ── Or divider ── */}
          <div className="my-1 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or extract from resume</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* ── AI Resume Extract ── */}
          <div className="rounded-xl bg-muted/50 p-4">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-5 w-5 text-foreground" />
              <div>
                <p className="text-sm font-semibold">Extract from Resume</p>
                <p className="text-xs text-muted-foreground">
                  Upload a PDF and let AI fill in the details.
                </p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleResumeUpload}
            />

            {resumeFile ? (
              <div
                className={cn(
                  "relative mt-2 overflow-hidden rounded-lg",
                  parsingResume ? "ai-border-spin p-[1.5px]" : "p-0",
                )}
              >
                <div className="relative flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-foreground">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="min-w-0 flex-1 truncate text-sm">
                    {resumeFile}
                  </p>
                  {parsingResume ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => {
                        setResumeFile("");
                        setStreamText("");
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <AiButton
                wrapperClassName="mt-2 w-full"
                className="w-full"
                size="sm"
                type="button"
                loading={parsingResume}
                onClick={() => fileInputRef.current?.click()}
              >
                {!parsingResume && <Upload className="mr-2 h-3.5 w-3.5" />}
                Upload resume (.pdf)
              </AiButton>
            )}

            {/* Streaming output */}
            {parsingResume && streamText && (
              <div ref={streamRef} className="mt-2 max-h-24 overflow-y-auto rounded-md bg-muted p-2 code-scrollbar">
                <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {streamText}
                  <span className="animate-pulse text-foreground">|</span>
                </pre>
              </div>
            )}

            {parsingResume && !streamText && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Uploading and analyzing...
              </p>
            )}
            <div ref={streamEndRef} />
          </div>

          <SheetFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={createMutation.isLoading || parsingResume}
            >
              {createMutation.isLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save and add
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
