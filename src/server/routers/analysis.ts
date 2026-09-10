import { extractStoragePath, mergeScreenshotEntries, resolveRecoveredPlaybackRecording, screenshotEntryFromStorageObject, type SessionRecordingEntry, type SessionScreenshotEntry } from "@/lib/session-media";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getOrgMembership, hasProjectAccess, protectedProcedure, router } from "../trpc";

async function resolveSignedUrl(bucket: string, path: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24); // 24 hours
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function resolveSignedUrls(
  bucket: string,
  paths: string[],
): Promise<Map<string, string>> {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (uniquePaths.length === 0) return new Map();

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrls(uniquePaths, 60 * 60 * 24); // 24 hours
  if (error || !data) return new Map();

  const urls = new Map<string, string>();
  for (const entry of data) {
    if (entry.path && entry.signedUrl) {
      urls.set(entry.path, entry.signedUrl);
    }
  }
  return urls;
}

export const analysisRouter = router({
  getSessionSummary: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: session } = await ctx.supabase
        .from("sessions")
        .select(
          `*, interview:interviews!inner(userId, title, objective, projectId, project:projects!inner(organizationId)), messages(*)`,
        )
        .eq("id", input.sessionId)
        .order("timestamp", { referencedTable: "messages", ascending: true })
        .single();

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const interview = session.interview as {
        userId: string;
        title: string;
        objective: string | null;
        projectId: string;
        project: { organizationId: string };
      };

      const membership = await getOrgMembership(ctx.supabase, interview.project.organizationId, ctx.user.id);
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization" });
      }

      const projAccess = await hasProjectAccess(ctx.supabase, interview.projectId, ctx.user.id);
      if (!projAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" });
      }

      // Generate fresh signed URLs for recordings and screenshots. Storage is
      // the source of truth for uploaded files, so merge objects that survived
      // an interrupted final metadata save back into the dashboard response.
      let audioRecordingUrl: string | null = null;
      if (session.audioRecordingUrl) {
        const storedUrl = session.audioRecordingUrl as string;
        const storagePath = extractStoragePath(storedUrl, "recordings");
        if (storagePath) {
          audioRecordingUrl = await resolveSignedUrl("recordings", storagePath);
        }
        if (!audioRecordingUrl) {
          audioRecordingUrl = storedUrl;
        }
      }

      const rawScreenshots = (session.screenshots ?? []) as SessionScreenshotEntry[];
      const { data: screenshotObjects } = await supabaseAdmin.storage
        .from("screenshots")
        .list(input.sessionId, { limit: 1000 });
      const discoveredScreenshots = (screenshotObjects ?? [])
        .map((file) => screenshotEntryFromStorageObject(input.sessionId, file))
        .filter((entry): entry is SessionScreenshotEntry => entry !== null);
      const mergedScreenshots = mergeScreenshotEntries(rawScreenshots, discoveredScreenshots);
      let screenshots: SessionScreenshotEntry[] | null = null;
      if (mergedScreenshots.length > 0) {
        const signedScreenshotUrls = await resolveSignedUrls(
          "screenshots",
          mergedScreenshots.map((s) => s.path),
        );
        screenshots = mergedScreenshots.map((s) => ({
          ...s,
          url: signedScreenshotUrls.get(s.path) || s.url,
        }));
      }

      const rawRecordings = (session.audioRecordings ?? []) as SessionRecordingEntry[];
      let audioRecordings = await Promise.all(
        rawRecordings.map(async (r) => {
          const storagePath = extractStoragePath(r.url, "recordings");
          let signedUrl = r.url;
          if (storagePath) {
            signedUrl = (await resolveSignedUrl("recordings", storagePath)) ?? r.url;
          }
          return { ...r, url: signedUrl };
        }),
      );

      const { data: recordingObjects } = await supabaseAdmin.storage
        .from("recordings")
        .list(input.sessionId, { limit: 100 });
      const recoveredRecording = resolveRecoveredPlaybackRecording(
        input.sessionId,
        (session.audioRecordingUrl as string | null) ?? audioRecordingUrl,
        recordingObjects ?? [],
      );
      if (recoveredRecording) {
        const signedUrl = await resolveSignedUrl("recordings", recoveredRecording.url);
        if (signedUrl) {
          audioRecordingUrl = signedUrl;
          audioRecordings = [{ ...recoveredRecording, url: signedUrl }];
        }
      }

      return {
        interviewTitle: interview.title,
        interviewObjective: interview.objective,
        participantName: session.participantName,
        participantEmail: session.participantEmail,
        status: session.status,
        createdAt: session.createdAt,
        summary: session.summary,
        insights: session.insights,
        themes: session.themes,
        sentiment: session.sentiment,
        messages: session.messages,
        totalDurationSeconds: session.totalDurationSeconds,
        audioRecordingUrl,
        audioRecordings,
        audioDuration: (session as Record<string, unknown>).audioDuration as number | null,
        screenshots,
        antiCheatingLog: (session as Record<string, unknown>).antiCheatingLog as
          | { type: string; timestamp: number; detail?: string }[]
          | null,
      };
    }),

  getInterviewInsights: protectedProcedure
    .input(z.object({ interviewId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: interview } = await ctx.supabase
        .from("interviews")
        .select("id, projectId, project:projects!inner(organizationId)")
        .eq("id", input.interviewId)
        .single();

      if (!interview) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const project = interview.project as unknown as { organizationId: string };
      const membership = await getOrgMembership(ctx.supabase, project.organizationId, ctx.user.id);
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization" });
      }

      const projAccess = await hasProjectAccess(ctx.supabase, interview.projectId, ctx.user.id);
      if (!projAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" });
      }

      const { data: sessions } = await ctx.supabase
        .from("sessions")
        .select("participantEmail, totalDurationSeconds, themes, messages(id)")
        .eq("interviewId", input.interviewId)
        .eq("status", "COMPLETED");

      const completedSessions = sessions ?? [];
      const totalSessions = completedSessions.length;
      const avgDuration =
        totalSessions > 0
          ? completedSessions.reduce(
              (sum, s) => sum + (s.totalDurationSeconds ?? 0),
              0,
            ) / totalSessions
          : 0;

      const totalMessages = completedSessions.reduce(
        (sum, s) => sum + ((s.messages as { id: string }[])?.length ?? 0),
        0,
      );

      const uniqueEmails = new Set(
        completedSessions
          .map((s) => s.participantEmail)
          .filter((e): e is string => !!e),
      );

      const allThemes = completedSessions.flatMap((s) => s.themes ?? []);
      const themeCounts: Record<string, number> = {};
      for (const theme of allThemes) {
        themeCounts[theme] = (themeCounts[theme] ?? 0) + 1;
      }

      return {
        totalSessions,
        totalMessages,
        totalParticipants: uniqueEmails.size,
        avgDurationSeconds: Math.round(avgDuration),
        topThemes: Object.entries(themeCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10),
      };
    }),
});
