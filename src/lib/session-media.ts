export interface SessionScreenshotEntry {
  url: string;
  path: string;
  timestamp: string;
  type: "camera" | "screen";
}

export interface SessionRecordingEntry {
  url: string;
  duration: number | null;
  segmentIndex: number;
  timestamp: string;
}

export interface StorageListObject {
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: { size?: number | null } | null;
}

const SCREENSHOT_NAME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-(camera|screen)\.[^.]+$/;

function timestampFromScreenshotObject(file: StorageListObject): string | null {
  const match = file.name.match(SCREENSHOT_NAME_PATTERN);
  if (match) {
    return `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
  }
  return file.created_at ?? file.updated_at ?? null;
}

/** Rebuild screenshot metadata from the canonical object name used at upload. */
export function screenshotEntryFromStorageObject(
  sessionId: string,
  file: StorageListObject,
): SessionScreenshotEntry | null {
  const match = file.name.match(SCREENSHOT_NAME_PATTERN);
  const type = match?.[6];
  const timestamp = timestampFromScreenshotObject(file);
  if ((type !== "camera" && type !== "screen") || !timestamp) return null;

  return {
    url: "",
    path: `${sessionId}/${file.name}`,
    timestamp,
    type,
  };
}

/**
 * Merge stored refs with objects discovered in Storage. Stored metadata wins,
 * while orphaned objects are added and duplicate paths are removed.
 */
export function mergeScreenshotEntries(
  stored: readonly SessionScreenshotEntry[],
  discovered: readonly SessionScreenshotEntry[],
): SessionScreenshotEntry[] {
  const byPath = new Map<string, SessionScreenshotEntry>();

  for (const entry of discovered) {
    byPath.set(entry.path, entry);
  }
  for (const entry of stored) {
    byPath.set(entry.path || entry.url, entry);
  }

  return [...byPath.values()].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

export function isSegmentRecordingUrl(url: string | null | undefined): boolean {
  return !!url && /-seg\d+\./i.test(url);
}

export function shouldReplaceRecordingReference(
  storedUrl: string | null | undefined,
  incomingUrl: string,
): boolean {
  if (!storedUrl) return true;
  return !(isSegmentRecordingUrl(incomingUrl) && !isSegmentRecordingUrl(storedUrl));
}

/**
 * Use a Storage-discovered recording when the DB has no ref, or when the DB
 * still points at a rolling segment after a completed object was uploaded.
 */
export function shouldPreferRecoveredRecording(
  storedUrl: string | null | undefined,
  recovered: SessionRecordingEntry | null,
): boolean {
  if (!recovered) return false;
  if (!storedUrl) return true;
  return isSegmentRecordingUrl(storedUrl) && !isSegmentRecordingUrl(recovered.url);
}

/**
 * Merge recording refs by segment. A completed recording is monotonic: a late
 * rolling-segment request must never replace the final object for that segment.
 */
export function mergeRecordingEntries(
  stored: readonly SessionRecordingEntry[],
  incoming: SessionRecordingEntry,
): SessionRecordingEntry[] {
  const recordings = [...stored];
  const index = recordings.findIndex(
    (entry) => entry.segmentIndex === incoming.segmentIndex,
  );

  if (index < 0) {
    recordings.push(incoming);
  } else {
    if (shouldReplaceRecordingReference(recordings[index].url, incoming.url)) {
      recordings[index] = incoming;
    }
  }

  return recordings.sort((a, b) => a.segmentIndex - b.segmentIndex);
}

/** Return a Storage path from either a signed URL or a path already in the DB. */
export function extractStoragePath(value: string, bucket: string): string | null {
  if (!value) return null;
  const match = value.match(new RegExp(`/${bucket}/(.+?)(?:\\?|$)`));
  if (match?.[1]) return decodeURIComponent(match[1]);
  if (!value.includes("://") && !value.startsWith("/")) return value;
  return null;
}

/**
 * Prefer the completed recording object. If only a rolling segment survived,
 * select the most recently updated one because that object is upserted as the
 * interview progresses.
 */
export function recordingEntryFromStorageObjects(
  sessionId: string,
  files: readonly StorageListObject[],
): SessionRecordingEntry | null {
  const candidates = files.filter((file) => /\.(?:webm|m4a|mp4)$/i.test(file.name));
  if (candidates.length === 0) return null;

  const finalFiles = candidates.filter((file) => !/-seg\d+\./i.test(file.name));
  const pool = finalFiles.length > 0 ? finalFiles : candidates;
  const selected = [...pool].sort((a, b) => {
    const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
    if (aTime !== bTime) return bTime - aTime;
    return (b.metadata?.size ?? 0) - (a.metadata?.size ?? 0);
  })[0];

  const segmentMatch = selected.name.match(/-seg(\d+)\./i);
  return {
    url: `${sessionId}/${selected.name}`,
    duration: null,
    segmentIndex: segmentMatch ? Number(segmentMatch[1]) : 0,
    timestamp: selected.created_at ?? selected.updated_at ?? "",
  };
}

/**
 * Decide whether Storage should replace the DB recording on the review page.
 * Returns the recovered entry when it is strictly better; otherwise null so
 * the already-signed stored URL is left alone.
 */
export function resolveRecoveredPlaybackRecording(
  sessionId: string,
  storedUrl: string | null | undefined,
  files: readonly StorageListObject[],
): SessionRecordingEntry | null {
  const recovered = recordingEntryFromStorageObjects(sessionId, files);
  if (!recovered || !shouldPreferRecoveredRecording(storedUrl, recovered)) {
    return null;
  }
  return recovered;
}
