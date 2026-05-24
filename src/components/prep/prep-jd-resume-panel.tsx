"use client";

import type { PrepContextInitial } from "@/components/prep/prep-context-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
    Briefcase,
    CheckCircle2,
    CircleDot,
    FileText,
    Loader2,
    Save,
    Upload,
    UserSquare2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  interviewId: string;
  initial: PrepContextInitial;
  onSaved?: () => void | Promise<void>;
};

function normalizeContext(ctx: PrepContextInitial): PrepContextInitial {
  return {
    jobDescription: ctx.jobDescription ?? null,
    resumeText: ctx.resumeText ?? null,
    companyName: ctx.companyName ?? null,
    roleTitle: ctx.roleTitle ?? null,
  };
}

function contextEquals(a: PrepContextInitial, b: PrepContextInitial): boolean {
  return (
    (a.jobDescription ?? "") === (b.jobDescription ?? "") &&
    (a.resumeText ?? "") === (b.resumeText ?? "") &&
    (a.companyName ?? "") === (b.companyName ?? "") &&
    (a.roleTitle ?? "") === (b.roleTitle ?? "")
  );
}

function applyContext(
  ctx: PrepContextInitial,
  setters: {
    setJobDescription: (v: string) => void;
    setResumeText: (v: string) => void;
    setCompanyName: (v: string) => void;
    setRoleTitle: (v: string) => void;
  },
) {
  setters.setJobDescription(ctx.jobDescription ?? "");
  setters.setResumeText(ctx.resumeText ?? "");
  setters.setCompanyName(ctx.companyName ?? "");
  setters.setRoleTitle(ctx.roleTitle ?? "");
}

export function PrepJdResumePanel({ interviewId, initial, onSaved }: Props) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const normalizedInitial = normalizeContext(initial);
  const [baseline, setBaseline] = useState(normalizedInitial);
  const [jobDescription, setJobDescription] = useState(
    normalizedInitial.jobDescription ?? "",
  );
  const [resumeText, setResumeText] = useState(normalizedInitial.resumeText ?? "");
  const [companyName, setCompanyName] = useState(
    normalizedInitial.companyName ?? "",
  );
  const [roleTitle, setRoleTitle] = useState(normalizedInitial.roleTitle ?? "");
  const [extractingResume, setExtractingResume] = useState(false);
  const [extractingJd, setExtractingJd] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const jdInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const next = normalizeContext(initial);
    setBaseline((prevBaseline) => {
      const current: PrepContextInitial = {
        jobDescription: jobDescription.trim() ? jobDescription.trim() : null,
        resumeText: resumeText.trim() ? resumeText.trim() : null,
        companyName: companyName.trim() ? companyName.trim() : null,
        roleTitle: roleTitle.trim() ? roleTitle.trim() : null,
      };
      if (!contextEquals(current, prevBaseline)) {
        return prevBaseline;
      }
      applyContext(next, {
        setJobDescription,
        setResumeText,
        setCompanyName,
        setRoleTitle,
      });
      return next;
    });
    // Preserve in-progress edits when parent refetches bundle data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const update = trpc.prep.updateContext.useMutation({
    onSuccess: async (data) => {
      const saved = normalizeContext({
        jobDescription: data.jobDescription ?? null,
        resumeText: data.resumeText ?? null,
        companyName: data.companyName ?? null,
        roleTitle: data.roleTitle ?? null,
      });
      setBaseline(saved);
      applyContext(saved, {
        setJobDescription,
        setResumeText,
        setCompanyName,
        setRoleTitle,
      });
      await Promise.all([
        utils.prep.getBundle.invalidate({ interviewId }),
        utils.interview.getById.invalidate({ id: interviewId }),
      ]);
      toast({ title: "Practice context saved" });
      await onSaved?.();
    },
    onError: (err) => {
      toast({
        title: "Could not save",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const current: PrepContextInitial = {
    jobDescription: jobDescription.trim() ? jobDescription.trim() : null,
    resumeText: resumeText.trim() ? resumeText.trim() : null,
    companyName: companyName.trim() ? companyName.trim() : null,
    roleTitle: roleTitle.trim() ? roleTitle.trim() : null,
  };
  const dirty = !contextEquals(current, baseline);

  const extract = async (file: File, target: "jd" | "resume") => {
    const setLoading = target === "jd" ? setExtractingJd : setExtractingResume;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai/extract-text", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        throw new Error(data.error ?? "Could not extract text");
      }
      if (target === "jd") setJobDescription(data.text);
      else setResumeText(data.text);
      toast({ title: target === "jd" ? "JD extracted" : "Resume extracted" });
    } catch (err) {
      toast({
        title: target === "jd" ? "JD upload failed" : "Resume upload failed",
        description: err instanceof Error ? err.message : "Paste text instead.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const save = () => {
    update.mutate({
      interviewId,
      ...current,
    });
  };

  return (
    <div className="space-y-6">
      <Section
        index={1}
        icon={Briefcase}
        title="Target role"
        description="Where you're interviewing — used to phrase questions and frame feedback."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field htmlFor="prep-role" label="Role">
            <Input
              id="prep-role"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="e.g. Senior Frontend Engineer"
            />
          </Field>
          <Field htmlFor="prep-company" label="Company">
            <Input
              id="prep-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Acme"
            />
          </Field>
        </div>
      </Section>

      <Section
        index={2}
        icon={FileText}
        title="Job description"
        description="Paste the JD or upload a PDF. The AI grades your answers against the signals it asks for."
        action={
          <PdfUploadButton
            ariaLabel="Upload JD as PDF"
            inputRef={jdInputRef}
            loading={extractingJd}
            onFileChosen={(file) => extract(file, "jd")}
          />
        }
      >
        <Textarea
          id="prep-jd"
          className="min-h-[220px]"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste the job description here, or upload a PDF using the button above."
        />
      </Section>

      <Section
        index={3}
        icon={UserSquare2}
        title="Your resume"
        description="Paste your resume or upload a PDF. The AI grounds hints and sample answers in your real experience."
        action={
          <PdfUploadButton
            ariaLabel="Upload resume as PDF"
            inputRef={resumeInputRef}
            loading={extractingResume}
            onFileChosen={(file) => extract(file, "resume")}
          />
        }
      >
        <Textarea
          id="prep-resume"
          className="min-h-[220px]"
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          placeholder="Paste your resume here, or upload a PDF using the button above."
        />
      </Section>

      <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <SaveStatus dirty={dirty} loading={update.isLoading} />
        <Button
          className="gap-2 sm:w-auto"
          disabled={!dirty || update.isLoading}
          onClick={save}
        >
          {update.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save context
        </Button>
      </div>
    </div>
  );
}

function Section({
  index,
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  index: number;
  icon: React.ElementType;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold text-muted-foreground">
            {index}
          </span>
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="h-4 w-4 text-muted-foreground" />
              {title}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="pl-10">{children}</div>
    </section>
  );
}

function Field({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function PdfUploadButton({
  ariaLabel,
  inputRef,
  loading,
  onFileChosen,
}: {
  ariaLabel: string;
  inputRef: React.RefObject<HTMLInputElement>;
  loading: boolean;
  onFileChosen: (file: File) => void;
}) {
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        aria-label={ariaLabel}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileChosen(file);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        Upload PDF
      </Button>
    </>
  );
}

function SaveStatus({ dirty, loading }: { dirty: boolean; loading: boolean }) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving…
      </p>
    );
  }
  if (dirty) {
    return (
      <p
        className={cn(
          "flex items-center gap-2 text-sm",
          "text-amber-700 dark:text-amber-400",
        )}
      >
        <CircleDot className="h-3.5 w-3.5" />
        Unsaved changes
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      All changes saved
    </p>
  );
}
