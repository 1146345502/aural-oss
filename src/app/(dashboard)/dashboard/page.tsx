"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useProject } from "@/components/project-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import {
  ArrowRight,
  ClipboardList,
  Link2,
  Loader2,
  Lock,
  MessageSquare,
  Plus,
  Timer,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

const CHART_COLORS = {
  primary: "hsl(var(--primary))",
  orange: "hsl(24, 80%, 55%)",
  green: "hsl(142, 60%, 45%)",
  muted: "hsl(var(--muted-foreground))",
};

const PIE_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.orange,
  CHART_COLORS.green,
  CHART_COLORS.muted,
  "hsl(262, 50%, 55%)",
];

const TOOLTIP_STYLE = {
  borderRadius: "8px",
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  fontSize: "12px",
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const router = useRouter();
  const { currentProject } = useProject();
  const { locale, t } = useAppLocale();
  const projectId = currentProject?.id;
  const [creatingNew, setCreatingNew] = useState(false);
  const { data, isLoading } = trpc.interview.dashboardStats.useQuery(
    { projectId: projectId ?? undefined },
    { enabled: !!projectId },
  );
  const interviews = trpc.interview.list.useQuery(
    { limit: 5, projectId: projectId ?? undefined },
    { enabled: !!projectId },
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("dashboard.title")}</h1>
          <p className="text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>
        <Button
          data-tour="new-interview"
          disabled={creatingNew}
          onClick={() => {
            setCreatingNew(true);
            router.push("/interviews/new");
          }}
        >
          {creatingNew ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          {t("sidebar.newInterview")}
        </Button>
      </div>

      {/* Row 1: Summary stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title={t("dashboard.totalInterviews")}
          value={data?.totalInterviews}
          icon={MessageSquare}
          loading={isLoading}
        />
        <StatsCard
          title={t("dashboard.totalSessions")}
          value={data?.totalSessions}
          icon={Users}
          loading={isLoading}
        />
        <StatsCard
          title={t("dashboard.totalDuration")}
          value={data ? formatDuration(data.totalDuration) : undefined}
          icon={Timer}
          loading={isLoading}
        />
        <StatsCard
          title={t("dashboard.totalQuestions")}
          value={data?.totalQuestions}
          icon={ClipboardList}
          loading={isLoading}
        />
      </div>

      {/* Row 2: Daily Sessions + Session Hours */}
      <div className="grid gap-4 md:grid-cols-2">
        <DailyChart
          title={t("dashboard.dailySessions")}
          data={data?.daily ?? []}
          dataKey="sessions"
          color={CHART_COLORS.primary}
          yLabel={t("dashboard.totalSessionsLabel").toLowerCase()}
          loading={isLoading}
        />
        <DailyChart
          title={t("dashboard.dailySessionTime")}
          data={data?.daily ?? []}
          dataKey="sessionMinutes"
          color={CHART_COLORS.orange}
          yLabel={locale === "zh" ? "分钟" : "minutes"}
          loading={isLoading}
        />
      </div>

      {/* Row 3: Daily Messages + Interviews & Questions */}
      <div className="grid gap-4 md:grid-cols-2">
        <DailyChart
          title={t("dashboard.dailyMessages")}
          data={data?.daily ?? []}
          dataKey="messages"
          color={CHART_COLORS.green}
          yLabel={locale === "zh" ? "消息" : "messages"}
          loading={isLoading}
        />
        <DailyDoubleChart
          title={t("dashboard.dailyInterviewsQuestions")}
          data={data?.daily ?? []}
          loading={isLoading}
        />
      </div>

      {/* Row 4: Breakdowns */}
      <div className="grid gap-4 md:grid-cols-3">
        <PieCard
          title={t("dashboard.sessionStatus")}
          centerLabel={t("dashboard.totalSessionsLabel")}
          data={[
            {
              name: t("dashboard.completed"),
              value: data?.statusBreakdown.COMPLETED ?? 0,
            },
            {
              name: t("dashboard.inProgress"),
              value: data?.statusBreakdown.IN_PROGRESS ?? 0,
            },
            {
              name: t("dashboard.notStarted"),
              value: data?.statusBreakdown.NOT_STARTED ?? 0,
            },
          ]}
          loading={isLoading}
        />
        <PieCard
          title={t("dashboard.questionType")}
          centerLabel={t("dashboard.totalQuestionsLabel")}
          data={[
            {
              name: t("dashboard.openEnded"),
              value: data?.questionTypeBreakdown.OPEN_ENDED ?? 0,
            },
            {
              name: t("dashboard.singleChoice"),
              value: data?.questionTypeBreakdown.SINGLE_CHOICE ?? 0,
            },
            {
              name: t("dashboard.multipleChoice"),
              value: data?.questionTypeBreakdown.MULTIPLE_CHOICE ?? 0,
            },
            {
              name: t("dashboard.coding"),
              value: data?.questionTypeBreakdown.CODING ?? 0,
            },
            {
              name: t("dashboard.whiteboard"),
              value: data?.questionTypeBreakdown.WHITEBOARD ?? 0,
            },
            {
              name: t("dashboard.research"),
              value: data?.questionTypeBreakdown.RESEARCH ?? 0,
            },
          ]}
          loading={isLoading}
        />
        <ThemesCard
          themes={data?.topThemes ?? []}
          loading={isLoading}
          title={t("dashboard.topThemes")}
          emptyLabel={t("dashboard.noData")}
        />
      </div>

      {/* Row 5: Recent Completed Sessions */}
      {(data?.recentSessions.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("dashboard.recentSessions")}</CardTitle>
            <Link href="/candidates">
              <Button variant="ghost" size="sm">
                {t("common.viewAll")} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data?.recentSessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/interviews/${s.interviewId}/results?session=${s.id}`}
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(s.date).toLocaleDateString(
                          locale === "zh" ? "zh-CN" : "en-US",
                          { day: "numeric", month: "short", year: "numeric" },
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {s.score !== null && <ScoreBadge score={s.score} />}
                    <span className="text-muted-foreground">
                      {t("dashboard.messagesShort", { count: s.messages })}
                    </span>
                    <span className="text-muted-foreground">
                      {formatDuration(s.duration)}
                    </span>
                    <StatusBadge status={s.status} />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Row 6: Recent Interviews */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("dashboard.recentInterviews")}</CardTitle>
          <Link href="/interviews">
            <Button variant="ghost" size="sm">
              {t("common.viewAll")} <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {interviews.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : interviews.data?.interviews.length === 0 ? (
            <div className="py-12 text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">
                {t("dashboard.noInterviews")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("dashboard.createFirstInterview")}
              </p>
              <Link href="/interviews/new" className="mt-4 inline-block">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("dashboard.createInterview")}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {interviews.data?.interviews.map((interview) => (
                <Link
                  key={interview.id}
                  href={`/interviews/${interview.id}/edit`}
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{interview.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {interview._count.questions}{" "}
                      {t("dashboard.questions").toLowerCase()} &middot;{" "}
                      {interview._count.sessions}{" "}
                      {t("sidebar.sessions").toLowerCase()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {interview.publicSlug &&
                    interview.isActive &&
                    !interview.requireInvite ? (
                      <Badge
                        variant="outline"
                        className="gap-1 max-w-[200px] border-border bg-background text-foreground"
                      >
                        <Link2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          /i/{interview.publicSlug}
                        </span>
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" />
                        {t("dashboard.inviteOnly")}
                      </Badge>
                    )}
                    {interview.chatEnabled && (
                      <Badge variant="outline">{t("dashboard.chat")}</Badge>
                    )}
                    {interview.voiceEnabled && (
                      <Badge variant="outline">{t("dashboard.voice")}</Badge>
                    )}
                    {interview.videoEnabled && (
                      <Badge variant="outline">{t("dashboard.video")}</Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatsCard({
  title,
  value,
  icon: Icon,
  loading,
}: {
  title: string;
  value?: string | number;
  icon: React.ElementType;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="rounded-lg bg-primary/10 p-3">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-16" />
          ) : (
            <p className="text-2xl font-bold">{value ?? 0}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DailyChart({
  title,
  data,
  dataKey,
  color,
  yLabel,
  loading,
}: {
  title: string;
  data: { date: string; [key: string]: number | string }[];
  dataKey: string;
  color: string;
  yLabel: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : data.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No data yet
          </div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
              >
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(data.length / 10) - 1)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(label) => formatShortDate(String(label))}
                  formatter={(value) => [
                    `${Number(value).toLocaleString()} ${yLabel}`,
                    title,
                  ]}
                />
                <Bar
                  dataKey={dataKey}
                  fill={color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DailyDoubleChart({
  title,
  data,
  loading,
}: {
  title: string;
  data: {
    date: string;
    interviews: number;
    questions: number;
    [key: string]: number | string;
  }[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : data.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No data yet
          </div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
              >
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(data.length / 10) - 1)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(label) => formatShortDate(String(label))}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "12px", paddingBottom: "4px" }}
                />
                <Bar
                  dataKey="interviews"
                  name="Interviews"
                  fill={CHART_COLORS.primary}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={20}
                />
                <Bar
                  dataKey="questions"
                  name="Questions"
                  fill={CHART_COLORS.orange}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PieCard({
  title,
  centerLabel,
  data,
  loading,
}: {
  title: string;
  centerLabel: string;
  data: { name: string; value: number }[];
  loading: boolean;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const filtered = data.filter((d) => d.value > 0);
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-6">
        {loading ? (
          <Skeleton className="h-80 w-full" />
        ) : total === 0 ? (
          <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
            No data yet
          </div>
        ) : (
          <div>
            <div className="relative flex items-center justify-center py-6">
              <div className="h-52 w-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={filtered}
                      cx="50%"
                      cy="50%"
                      innerRadius="84%"
                      outerRadius="98%"
                      dataKey="value"
                      strokeWidth={1}
                      stroke="hsl(var(--card))"
                      cornerRadius={10}
                      paddingAngle={1}
                      onMouseEnter={(_, idx) => setHovered(idx)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {filtered.map((_, idx) => (
                        <Cell
                          key={idx}
                          fill={PIE_COLORS[idx % PIE_COLORS.length]}
                          opacity={
                            hovered === null || hovered === idx ? 1 : 0.4
                          }
                          style={{
                            transition: "opacity 0.2s ease, filter 0.2s ease",
                            filter:
                              hovered === idx
                                ? "brightness(1.1) drop-shadow(0 2px 4px rgba(0,0,0,0.2))"
                                : "none",
                            cursor: "pointer",
                          }}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value, name) => [
                        `${Number(value)} (${Math.round((Number(value) / total) * 100)}%)`,
                        String(name),
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted-foreground/60">
                  {centerLabel}
                </span>
                <span className="text-4xl">{total.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              {data.map((d, idx) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: PIE_COLORS[idx % PIE_COLORS.length],
                    }}
                  />
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="font-medium">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ThemesCard({
  themes,
  loading,
  title,
  emptyLabel,
}: {
  themes: { theme: string; count: number }[];
  loading: boolean;
  title: string;
  emptyLabel: string;
}) {
  const maxCount = themes.length > 0 ? themes[0].count : 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : themes.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <div className="space-y-2.5">
            {themes.map((t) => (
              <div key={t.theme} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate text-muted-foreground">
                    {t.theme}
                  </span>
                  <span className="ml-2 shrink-0 font-medium">{t.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(t.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 7
      ? "text-green-700 dark:text-green-400"
      : score >= 4
        ? "text-amber-700 dark:text-amber-400"
        : "text-red-700 dark:text-red-400";
  return (
    <span className={`font-semibold ${color}`}>{score.toFixed(1)}/10</span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: "bg-green-500/10 text-green-700 dark:text-green-400",
    IN_PROGRESS: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    NOT_STARTED: "bg-muted text-muted-foreground",
  };
  const labels: Record<string, string> = {
    COMPLETED: "Completed",
    IN_PROGRESS: "In Progress",
    NOT_STARTED: "Not Started",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
