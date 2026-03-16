"use client";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { BookOpen, ExternalLink, LifeBuoy, Paperclip } from "lucide-react";
import { useState } from "react";

const MESSAGE_TYPES = ["Question", "Feedback", "Bug"] as const;
type MessageType = (typeof MESSAGE_TYPES)[number];

const SEVERITY_OPTIONS = [
  "Question or feature request",
  "Minor issue",
  "Major issue",
  "Critical / blocking",
];

const TOPIC_OPTIONS = [
  "Account",
  "Interviews",
  "Sessions",
  "AI features",
  "Integrations",
  "Other",
];

type View = "home" | "contact";

export function SupportDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const [view, setView] = useState<View>("home");
  const [messageType, setMessageType] = useState<MessageType>("Question");
  const [severity, setSeverity] = useState(SEVERITY_OPTIONS[0]);
  const [topic, setTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setMessageType("Question");
    setSeverity(SEVERITY_OPTIONS[0]);
    setTopic("");
    setCustomTopic("");
    setMessage("");
    setFiles([]);
    setSubmitted(false);
    setView("home");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("type", messageType);
      formData.append("severity", severity);
      formData.append("topic", topic === "Other" ? customTopic || "Other" : topic);
      formData.append("message", message);
      formData.append("email", user?.email ?? "");
      files.forEach((f) => formData.append("attachments", f));

      const res = await fetch("/api/support", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      setSubmitted(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto code-scrollbar">
        {view === "home" ? (
          <>
            <SheetHeader className="pb-4">
              <SheetTitle>Support</SheetTitle>
              <SheetDescription className="sr-only">Get help from docs or contact support</SheetDescription>
            </SheetHeader>

            {/* Docs section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                <h3 className="text-sm font-semibold">Docs</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Guides, examples, and reference — find quick answers here.
              </p>
              <a
                href="/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                View documentation
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            </div>

            <hr className="my-6" />

            {/* Contact section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <LifeBuoy className="h-4 w-4" />
                <h3 className="text-sm font-semibold">Contact Support</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Can&apos;t find what you need? One of our support engineers will help you out.
              </p>
              <button
                type="button"
                onClick={() => setView("contact")}
                className="flex w-full items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                Email a Support Engineer
              </button>
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="pb-4">
              <SheetTitle className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => { setView("home"); setSubmitted(false); }}
                  className="font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Support
                </button>
                <span className="text-muted-foreground/50">/</span>
                <span className="font-semibold">Email Engineer</span>
              </SheetTitle>
              <SheetDescription className="sr-only">Send a message to support</SheetDescription>
            </SheetHeader>

            <div className="mb-4">
              <h3 className="text-base font-semibold">Email a Support Engineer</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Details speed things up. The clearer your request, the quicker you get the answer you need.
              </p>
            </div>

            {submitted ? (
              <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
                <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/30">
                  <svg
                    className="h-6 w-6 text-green-600 dark:text-green-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Message sent!</p>
                  <p className="text-sm text-muted-foreground">
                    We&apos;ll get back to you at your account email. Replies may
                    take up to one business day.
                  </p>
                </div>
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Close
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Message Type */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Message Type</Label>
                  <div className="flex gap-2">
                    {MESSAGE_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setMessageType(t)}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                          messageType === t
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-foreground hover:bg-muted"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Severity */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Severity</Label>
                  <Select value={severity} onValueChange={setSeverity}>
                    <SelectTrigger>
                      <SelectValue placeholder="Question or feature request" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Topic */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Topic</Label>
                  <Select value={topic} onValueChange={(v) => { setTopic(v); if (v !== "Other") setCustomTopic(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a topic" />
                    </SelectTrigger>
                    <SelectContent>
                      {TOPIC_OPTIONS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {topic === "Other" && (
                    <Input
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      placeholder="Please specify the topic"
                      className="mt-2"
                    />
                  )}
                </div>

                {/* Message */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Message</Label>
                  <p className="text-xs text-muted-foreground">
                    We will email you at your account address. Replies may take up to
                    one business day.
                  </p>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Please explain as fully as possible what you're aiming to do, and what you'd like help with."
                    rows={6}
                    required
                  />
                </div>

                {/* Attachments */}
                <div className="space-y-2">
                  <Label
                    htmlFor="support-files"
                    className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Paperclip className="h-4 w-4" />
                    Attach files
                  </Label>
                  <Input
                    id="support-files"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {files.length > 0 && (
                    <ul className="space-y-1">
                      {files.map((f, i) => (
                        <li
                          key={`${f.name}-${i}`}
                          className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1 text-xs"
                        >
                          <span className="truncate">{f.name}</span>
                          <button
                            type="button"
                            onClick={() => removeFile(i)}
                            className="ml-2 text-muted-foreground hover:text-foreground"
                          >
                            &times;
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setView("home")}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={
                      submitting ||
                      !message.trim() ||
                      !topic ||
                      (topic === "Other" && !customTopic.trim())
                    }
                  >
                    {submitting ? "Sending..." : "Submit"}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
