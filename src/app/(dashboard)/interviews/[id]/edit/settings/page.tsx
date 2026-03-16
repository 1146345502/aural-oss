"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AI_TONES, FOLLOW_UP_DEPTHS, LANGUAGES } from "@/lib/constants";
import { trpc } from "@/lib/trpc/client";
import {
    Copy,
    Globe,
    LinkIcon as LinkPlusIcon,
    Loader2,
    Lock,
    MessageSquare,
    Mic,
    ShieldCheck,
    Video,
    X
} from "lucide-react";
import { useCallback, useState } from "react";
import { useEditInterview } from "../edit-context";

function normalizeInterviewLanguage(language?: string | null): string {
  const normalized = language?.trim().toLowerCase();
  switch (normalized) {
    case "zh":
    case "zh-cn":
    case "zh_hans":
    case "chinese":
    case "chinese (中文)":
    case "中文":
      return "zh";
    case "es":
    case "spanish":
    case "español":
      return "es";
    case "fr":
    case "french":
    case "français":
      return "fr";
    case "en":
    case "english":
    default:
      return "en";
  }
}

export default function SettingsTab() {
  const { interview, interviewId, updateMutation } = useEditInterview();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const publishMutation = trpc.interview.publish.useMutation();

  const [title, setTitle] = useState<string>(interview.title);
  const [description, setDescription] = useState<string>(interview.description ?? "");
  const [objective, setObjective] = useState<string>(interview.objective ?? "");
  const [chatEnabled, setChatEnabled] = useState<boolean>(interview.chatEnabled ?? true);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(interview.voiceEnabled ?? false);
  const [videoEnabled, setVideoEnabled] = useState<boolean>(interview.videoEnabled ?? false);
  const [aiName, setAiName] = useState<string>(interview.aiName);
  const [aiTone, setAiTone] = useState<string>(interview.aiTone);
  const [followUpDepth, setFollowUpDepth] = useState<string>(interview.followUpDepth);
  const [language, setLanguage] = useState<string>(
    normalizeInterviewLanguage(interview.language),
  );
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<string | number>(
    interview.timeLimitMinutes ?? "",
  );
  const [antiCheatingEnabled, setAntiCheatingEnabled] = useState<boolean>(
    interview.antiCheatingEnabled ?? false,
  );

  const requireInvite = interview.requireInvite ?? true;
  const hasShareableLink = !requireInvite;
  const shareableUrl =
    hasShareableLink &&
    interview.publicSlug &&
    interview.isActive &&
    typeof window !== "undefined"
      ? `${window.location.origin}/i/${interview.publicSlug}`
      : null;

  const isLinkLoading = updateMutation.isLoading || publishMutation.isLoading;

  const handleCreateShareableLink = useCallback(() => {
    publishMutation.mutate(
      { id: interviewId },
      {
        onSuccess: () => {
          updateMutation.mutate(
            { id: interviewId, requireInvite: false },
            {
              onSuccess: () => {
                utils.interview.getById.invalidate({ id: interviewId });
                toast({ title: "Shareable link created" });
              },
            },
          );
        },
      },
    );
  }, [interviewId, publishMutation, updateMutation, utils, toast]);

  const handleRevokeShareableLink = useCallback(() => {
    updateMutation.mutate(
      { id: interviewId, requireInvite: true, isActive: false },
      {
        onSuccess: () => {
          utils.interview.getById.invalidate({ id: interviewId });
          toast({ title: "Shareable link revoked" });
        },
      },
    );
  }, [interviewId, updateMutation, utils, toast]);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Shareable Link */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Shareable Link</CardTitle>
        </CardHeader>
        <CardContent>
          {hasShareableLink ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary-100 text-secondary-600 dark:bg-secondary-900/30 dark:text-secondary-400">
                  <Globe className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Open access enabled</p>
                  <p className="text-xs text-muted-foreground">
                    Anyone with this link can start the interview
                  </p>
                </div>
              </div>
              {shareableUrl && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                  <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {shareableUrl}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2"
                    onClick={() => {
                      navigator.clipboard.writeText(shareableUrl);
                      toast({ title: "Link copied!" });
                    }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleRevokeShareableLink}
                disabled={isLinkLoading}
              >
                {isLinkLoading ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="mr-2 h-3.5 w-3.5" />
                )}
                Revoke shareable link
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Lock className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Invite only</p>
                  <p className="text-xs text-muted-foreground">
                    Only sessions added from the Sessions tab can access this
                    interview via their unique invite links.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateShareableLink}
                disabled={isLinkLoading}
              >
                {isLinkLoading ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LinkPlusIcon className="mr-2 h-3.5 w-3.5" />
                )}
                Create shareable link
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Objective</Label>
            <Textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Duration (minutes)</Label>
            <Input
              type="number"
              value={timeLimitMinutes}
              onChange={(e) => setTimeLimitMinutes(e.target.value)}
              placeholder="No limit"
            />
          </div>
          <div className="space-y-2">
            <Label>Communication Channels</Label>
            <p className="text-xs text-muted-foreground">
              Choose how participants interact during the interview
            </p>
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Chat</Label>
                    <p className="text-xs text-muted-foreground">Text messaging</p>
                  </div>
                </div>
                <Switch
                  checked={chatEnabled}
                  onCheckedChange={(v) => {
                    if (!v && !voiceEnabled) return;
                    setChatEnabled(v);
                  }}
                />
              </div>
              <div className="border-t" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Voice</Label>
                    <p className="text-xs text-muted-foreground">Speech conversation</p>
                  </div>
                </div>
                <Switch
                  checked={voiceEnabled}
                  onCheckedChange={(v) => {
                    if (!v && !chatEnabled) return;
                    setVoiceEnabled(v);
                    if (!v) setVideoEnabled(false);
                  }}
                />
              </div>
              <div className="border-t" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Video</Label>
                    <p className="text-xs text-muted-foreground">Camera &amp; screen recording</p>
                  </div>
                </div>
                <Switch
                  checked={videoEnabled}
                  disabled={!voiceEnabled}
                  onCheckedChange={setVideoEnabled}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>AI Name</Label>
            <Input value={aiName} onChange={(e) => setAiName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Tone</Label>
            <Select value={aiTone} onValueChange={setAiTone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_TONES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Follow-up Depth</Label>
            <Select value={followUpDepth} onValueChange={setFollowUpDepth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FOLLOW_UP_DEPTHS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label} ({d.description})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Anti-Cheating Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label>Enable Anti-Cheating</Label>
                  <p className="text-xs text-muted-foreground">
                    Requires camera, mic & screen sharing. Monitors tab switches, blocks external paste, and detects multiple screens
                  </p>
                </div>
              </div>
              <Switch
                checked={antiCheatingEnabled}
                onCheckedChange={setAntiCheatingEnabled}
              />
            </div>
            {antiCheatingEnabled && (
              <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-medium">When enabled, interviewees will experience:</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  <li>Camera, microphone, and screen sharing will be mandatory (cannot be skipped)</li>
                  <li>Tab switching and window focus loss will be tracked and flagged</li>
                  <li>Pasting content from outside the interview page will be blocked</li>
                  <li>Multiple monitor setups will be detected and warned against</li>
                </ul>
                <p className="mt-1.5 text-amber-700 dark:text-amber-300">
                  Candidates will be informed of these restrictions before starting.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-end">
        <Button
          onClick={() =>
            updateMutation.mutate({
              id: interviewId,
              title,
              description,
              objective,
              chatEnabled,
              voiceEnabled,
              videoEnabled,
              aiName,
              aiTone,
              followUpDepth,
              language,
              timeLimitMinutes: timeLimitMinutes
                ? Number(timeLimitMinutes)
                : null,
              antiCheatingEnabled,
            })
          }
          disabled={updateMutation.isLoading}
        >
          {updateMutation.isLoading && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
