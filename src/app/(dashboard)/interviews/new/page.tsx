"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { AIGenerator } from "@/components/interview/ai-generator";
import { useProject } from "@/components/project-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AI_TONES, FOLLOW_UP_DEPTHS, LANGUAGES } from "@/lib/constants";
import { trpc } from "@/lib/trpc/client";
import {
  Loader2,
  MessageSquare,
  Mic,
  PenLine,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function NewInterviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useAppLocale();
  const { currentProject } = useProject();
  const projectId =
    searchParams.get("projectId") ?? currentProject?.id ?? undefined;
  const { toast } = useToast();
  const isZh = locale === "zh";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState("");
  const [chatEnabled, setChatEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [aiTone, setAiTone] = useState<
    "CASUAL" | "PROFESSIONAL" | "FORMAL" | "FRIENDLY"
  >("FRIENDLY");
  const [followUpDepth, setFollowUpDepth] = useState<
    "LIGHT" | "MODERATE" | "DEEP"
  >("MODERATE");
  const [language, setLanguage] = useState("en");
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [antiCheatingEnabled, setAntiCheatingEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  const createMutation = trpc.interview.create.useMutation({
    onSuccess: (interview) => {
      toast({ title: isZh ? "面试已创建" : "Interview created" });
      router.push(`/interviews/${interview.id}/edit`);
    },
    onError: (error) => {
      toast({
        title: isZh ? "错误" : "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleManualCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createMutation.mutateAsync({
        projectId,
        title,
        description,
        objective,
        chatEnabled,
        voiceEnabled,
        videoEnabled,
        aiTone,
        followUpDepth,
        language,
        timeLimitMinutes: duration,
        antiCheatingEnabled,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          {isZh ? "创建面试" : "Create Interview"}
        </h1>
        <p className="text-muted-foreground">
          {isZh
            ? "手动创建，或使用 AI 为你生成一场面试。"
            : "Build manually or let AI generate an interview for you."}
        </p>
      </div>

      <Tabs defaultValue="ai" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ai" className="gap-2">
            <Sparkles className="h-4 w-4" />
            {isZh ? "AI 生成器" : "AI Generator"}
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2">
            <PenLine className="h-4 w-4" />
            {isZh ? "手动创建" : "Manual"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai">
          <AIGenerator projectId={projectId} />
        </TabsContent>

        <TabsContent value="manual">
          <Card>
            <CardHeader>
              <CardTitle>{isZh ? "手动创建" : "Create Manually"}</CardTitle>
              <CardDescription>
                {isZh
                  ? "先完成基础设置，然后在编辑器中添加题目。"
                  : "Set up the basics, then add questions in the editor."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleManualCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">{isZh ? "标题" : "Title"}</Label>
                  <Input
                    id="title"
                    placeholder={
                      isZh
                        ? "例如：高级 React 开发工程师面试"
                        : "e.g. Senior React Developer Interview"
                    }
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">
                    {isZh ? "描述" : "Description"}
                  </Label>
                  <Textarea
                    id="description"
                    placeholder={
                      isZh
                        ? "简要描述这场面试..."
                        : "Brief description of this interview..."
                    }
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="objective">
                    {isZh ? "目标" : "Objective"}
                  </Label>
                  <Textarea
                    id="objective"
                    placeholder={
                      isZh
                        ? "你希望通过这场面试了解什么？"
                        : "What do you want to learn from this interview?"
                    }
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">
                    {isZh ? "时长（分钟）" : "Duration (minutes)"}
                  </Label>
                  <Input
                    id="duration"
                    type="number"
                    min={1}
                    max={120}
                    placeholder={isZh ? "例如：30" : "e.g. 30"}
                    value={duration ?? ""}
                    onChange={(e) =>
                      setDuration(
                        e.target.value ? Number(e.target.value) : undefined,
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {isZh
                      ? "可选。建议的面试时长限制。"
                      : "Optional. Recommended time limit for the interview."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>{isZh ? "沟通渠道" : "Communication Channels"}</Label>
                  <p className="text-xs text-muted-foreground">
                    {isZh
                      ? "选择候选人在面试中的参与方式。至少启用一个渠道。"
                      : "Choose how participants interact during the interview. At least one channel must be enabled."}
                  </p>
                  <div className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <Label>{isZh ? "聊天" : "Chat"}</Label>
                          <p className="text-xs text-muted-foreground">
                            {isZh ? "文字消息" : "Text messaging"}
                          </p>
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
                          <Label>{isZh ? "语音" : "Voice"}</Label>
                          <p className="text-xs text-muted-foreground">
                            {isZh
                              ? "语音对话（Chrome 或 Edge）"
                              : "Speech conversation (Chrome or Edge)"}
                          </p>
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
                          <Label>{isZh ? "视频" : "Video"}</Label>
                          <p className="text-xs text-muted-foreground">
                            {isZh
                              ? "摄像头与屏幕录制"
                              : "Camera & screen recording"}
                          </p>
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

                <div className="space-y-2">
                  <Label>{isZh ? "防作弊模式" : "Anti-Cheating Mode"}</Label>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <Label>
                            {isZh ? "启用防作弊" : "Enable Anti-Cheating"}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {isZh
                              ? "需要摄像头、麦克风和屏幕共享。可监控切换标签页、阻止外部粘贴，并检测多屏。"
                              : "Requires camera, mic & screen sharing. Monitors tab switches, blocks external paste, and detects multiple screens"}
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
                        <p className="font-medium">
                          {isZh
                            ? "启用后，候选人将遇到以下限制："
                            : "When enabled, interviewees will experience:"}
                        </p>
                        <ul className="mt-1 list-inside list-disc space-y-0.5">
                          <li>
                            {isZh
                              ? "必须开启摄像头、麦克风和屏幕共享（不可跳过）"
                              : "Camera, microphone, and screen sharing will be mandatory (cannot be skipped)"}
                          </li>
                          <li>
                            {isZh
                              ? "切换标签页和窗口失焦会被记录并标记"
                              : "Tab switching and window focus loss will be tracked and flagged"}
                          </li>
                          <li>
                            {isZh
                              ? "将阻止从面试页面外部粘贴内容"
                              : "Pasting content from outside the interview page will be blocked"}
                          </li>
                          <li>
                            {isZh
                              ? "会检测并警告多显示器环境"
                              : "Multiple monitor setups will be detected and warned against"}
                          </li>
                        </ul>
                        <p className="mt-1.5 text-amber-700 dark:text-amber-300">
                          {isZh
                            ? "候选人在开始前会被明确告知这些限制。"
                            : "Candidates will be informed of these restrictions before starting."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* AI Configuration */}
                <div className="mt-4 space-y-3">
                  <Label className="block text-sm font-medium">
                    {isZh ? "AI 配置" : "AI Configuration"}
                  </Label>
                  <div className="grid gap-4 rounded-lg border p-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>{isZh ? "语气" : "Tone"}</Label>
                      <Select
                        value={aiTone}
                        onValueChange={(v) => setAiTone(v as typeof aiTone)}
                      >
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
                      <Label>{isZh ? "追问深度" : "Follow-up Depth"}</Label>
                      <Select
                        value={followUpDepth}
                        onValueChange={(v) =>
                          setFollowUpDepth(v as typeof followUpDepth)
                        }
                      >
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
                      <Label>{isZh ? "语言" : "Language"}</Label>
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
                  </div>
                </div>

                <Button type="submit" disabled={loading || !title}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isZh ? "创建面试" : "Create Interview"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
