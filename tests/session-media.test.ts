import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { stopRecordingAfterMetadataCheckpoint } from "@/lib/recording-finalization";
import {
  extractStoragePath,
  isSegmentRecordingUrl,
  mergeRecordingEntries,
  mergeScreenshotEntries,
  recordingEntryFromStorageObjects,
  resolveRecoveredPlaybackRecording,
  screenshotEntryFromStorageObject,
  shouldPreferRecoveredRecording,
  shouldReplaceRecordingReference,
  type SessionRecordingEntry,
  type SessionScreenshotEntry,
  type StorageListObject,
} from "@/lib/session-media";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const SESSION_ID = "0629e61c-a45f-4ae1-b9d1-d9ea11f3b917";
const FINAL_NAME = "recording-1787671911718.m4a";
const SEGMENT_NAME = `recording-${SESSION_ID}-seg0.m4a`;

const bothFiles: StorageListObject[] = [
  {
    name: SEGMENT_NAME,
    created_at: "2026-08-25T15:32:03.813Z",
    updated_at: "2026-08-25T15:32:03.813Z",
    metadata: { size: 21_286_436 },
  },
  {
    name: FINAL_NAME,
    created_at: "2026-08-25T15:31:59.230Z",
    updated_at: "2026-08-25T15:31:59.230Z",
    metadata: { size: 21_286_436 },
  },
];

function signedRecordingUrl(fileName: string): string {
  return `https://example.supabase.co/storage/v1/object/sign/recordings/${SESSION_ID}/${fileName}?token=abc`;
}

test("recording metadata is checkpointed before a slow final upload starts", async () => {
  const events: string[] = [];
  let releaseCheckpoint!: () => void;
  const checkpointBlocked = new Promise<void>((resolve) => {
    releaseCheckpoint = resolve;
  });

  const finishing = stopRecordingAfterMetadataCheckpoint({
    screenshots: [{ path: "session/camera.jpg" }],
    persistScreenshots: async () => {
      events.push("checkpoint-started");
      await checkpointBlocked;
      events.push("checkpoint-finished");
    },
    stopRecording: async () => {
      events.push("upload-started");
      return "recording-url";
    },
  });

  await Promise.resolve();
  assert.deepEqual(events, ["checkpoint-started"]);
  releaseCheckpoint();
  assert.equal(await finishing, "recording-url");
  assert.deepEqual(events, [
    "checkpoint-started",
    "checkpoint-finished",
    "upload-started",
  ]);
});

test("a failed metadata checkpoint is reported but does not prevent recorder cleanup", async () => {
  const checkpointError = new Error("database unavailable");
  let reported: unknown;
  let stopped = false;

  await stopRecordingAfterMetadataCheckpoint({
    screenshots: [{ path: "session/screen.jpg" }],
    persistScreenshots: async () => {
      throw checkpointError;
    },
    stopRecording: async () => {
      stopped = true;
    },
    onCheckpointError: (error) => {
      reported = error;
    },
  });

  assert.equal(reported, checkpointError);
  assert.equal(stopped, true);
});

test("orphaned screenshot objects are reconstructed and merged without duplicates", () => {
  const stored: SessionScreenshotEntry[] = [
    {
      url: "old-signed-url",
      path: "session-1/2026-08-25T11-48-04-247Z-camera.jpg",
      timestamp: "2026-08-25T11:48:04.247Z",
      type: "camera",
    },
  ];
  const discovered = [
    screenshotEntryFromStorageObject("session-1", {
      name: "2026-08-25T11-48-04-247Z-camera.jpg",
      created_at: "2026-08-25T11:48:04.726Z",
    }),
    screenshotEntryFromStorageObject("session-1", {
      name: "2026-08-25T11-49-04-335Z-screen.jpg",
      created_at: "2026-08-25T11:49:05.360Z",
    }),
  ].filter((entry): entry is SessionScreenshotEntry => entry !== null);

  assert.deepEqual(mergeScreenshotEntries(stored, discovered), [
    stored[0],
    {
      url: "",
      path: "session-1/2026-08-25T11-49-04-335Z-screen.jpg",
      timestamp: "2026-08-25T11:49:04.335Z",
      type: "screen",
    },
  ]);
});

test("orphaned audio recovery prefers a completed recording over a rolling segment", () => {
  const entry = recordingEntryFromStorageObjects("session-1", [
    {
      name: "recording-session-1-seg0.m4a",
      created_at: "2026-08-26T17:18:05.974Z",
      updated_at: "2026-08-26T17:43:17.653Z",
      metadata: { size: 19_320_761 },
    },
    {
      name: "recording-1787766183238.m4a",
      created_at: "2026-08-26T17:43:16.626Z",
      updated_at: "2026-08-26T17:43:16.626Z",
      metadata: { size: 19_320_761 },
    },
  ]);

  assert.deepEqual(entry, {
    url: "session-1/recording-1787766183238.m4a",
    duration: null,
    segmentIndex: 0,
    timestamp: "2026-08-26T17:43:16.626Z",
  });
});

test("dashboard playback prefers a completed Storage object over a stored rolling segment", () => {
  const recoveredFinal = {
    url: "session-1/recording-1787766183238.m4a",
    duration: null,
    segmentIndex: 0,
    timestamp: "2026-08-26T17:43:16.626Z",
  };
  const recoveredSegment = {
    url: "session-1/recording-session-1-seg0.m4a",
    duration: null,
    segmentIndex: 0,
    timestamp: "2026-08-26T17:43:17.653Z",
  };

  assert.equal(
    shouldPreferRecoveredRecording(
      "https://example.supabase.co/storage/v1/object/sign/recordings/session-1/recording-session-1-seg0.m4a?token=abc",
      recoveredFinal,
    ),
    true,
  );
  assert.equal(
    shouldPreferRecoveredRecording(
      "https://example.supabase.co/storage/v1/object/sign/recordings/session-1/recording-1787766183238.m4a?token=abc",
      recoveredFinal,
    ),
    false,
  );
  assert.equal(shouldPreferRecoveredRecording(null, recoveredSegment), true);
  assert.equal(shouldPreferRecoveredRecording("session-1/recording-session-1-seg0.m4a", recoveredSegment), false);
});

test("a late rolling upload cannot replace a final recording reference", () => {
  const finalRecording = {
    url: "session-1/recording-1787766183238.m4a",
    duration: 1500,
    segmentIndex: 0,
    timestamp: "2026-08-26T17:43:16.626Z",
  };
  const lateSegment = {
    url: "session-1/recording-session-1-seg0.m4a",
    duration: null,
    segmentIndex: 0,
    timestamp: "2026-08-26T17:43:17.653Z",
  };

  assert.deepEqual(mergeRecordingEntries([finalRecording], lateSegment), [
    finalRecording,
  ]);
  assert.equal(
    shouldReplaceRecordingReference(finalRecording.url, lateSegment.url),
    false,
  );
});

test("signed Storage URLs and direct paths both resolve to object paths", () => {
  assert.equal(
    extractStoragePath(
      "https://example.supabase.co/storage/v1/object/sign/recordings/session-1/recording.m4a?token=abc",
      "recordings",
    ),
    "session-1/recording.m4a",
  );
  assert.equal(
    extractStoragePath("session-1/recording.m4a", "recordings"),
    "session-1/recording.m4a",
  );
});

test("segment URLs are detected in signed URLs, paths, and case-insensitive names", () => {
  assert.equal(isSegmentRecordingUrl(signedRecordingUrl(SEGMENT_NAME)), true);
  assert.equal(isSegmentRecordingUrl(`${SESSION_ID}/${SEGMENT_NAME}`), true);
  assert.equal(isSegmentRecordingUrl(`${SESSION_ID}/recording-session-seg12.webm`), true);
  assert.equal(isSegmentRecordingUrl(signedRecordingUrl(FINAL_NAME)), false);
  assert.equal(isSegmentRecordingUrl(`${SESSION_ID}/${FINAL_NAME}`), false);
  assert.equal(isSegmentRecordingUrl(null), false);
  assert.equal(isSegmentRecordingUrl(""), false);
});

test("a finished recording replaces a stored rolling segment on save", () => {
  const storedSegment: SessionRecordingEntry = {
    url: signedRecordingUrl(SEGMENT_NAME),
    duration: null,
    segmentIndex: 0,
    timestamp: "2026-08-25T15:32:04.494Z",
  };
  const incomingFinal: SessionRecordingEntry = {
    url: signedRecordingUrl(FINAL_NAME),
    duration: 1411,
    segmentIndex: 0,
    timestamp: "2026-08-25T15:31:59.230Z",
  };

  assert.equal(
    shouldReplaceRecordingReference(storedSegment.url, incomingFinal.url),
    true,
  );
  assert.deepEqual(mergeRecordingEntries([storedSegment], incomingFinal), [
    incomingFinal,
  ]);
});

test("review playback swaps a stored rolling segment for the finished Storage object", () => {
  const recovered = resolveRecoveredPlaybackRecording(
    SESSION_ID,
    signedRecordingUrl(SEGMENT_NAME),
    bothFiles,
  );

  assert.deepEqual(recovered, {
    url: `${SESSION_ID}/${FINAL_NAME}`,
    duration: null,
    segmentIndex: 0,
    timestamp: "2026-08-25T15:31:59.230Z",
  });
});

test("review playback keeps a stored finished recording", () => {
  assert.equal(
    resolveRecoveredPlaybackRecording(
      SESSION_ID,
      signedRecordingUrl(FINAL_NAME),
      bothFiles,
    ),
    null,
  );
});

test("review playback keeps a rolling segment when that is the only Storage object", () => {
  assert.equal(
    resolveRecoveredPlaybackRecording(
      SESSION_ID,
      signedRecordingUrl(SEGMENT_NAME),
      [bothFiles[0]],
    ),
    null,
  );
});

test("review playback recovers any Storage recording when the DB has no ref", () => {
  const recoveredFinal = resolveRecoveredPlaybackRecording(SESSION_ID, null, bothFiles);
  assert.equal(recoveredFinal?.url, `${SESSION_ID}/${FINAL_NAME}`);

  const recoveredSegment = resolveRecoveredPlaybackRecording(SESSION_ID, undefined, [
    bothFiles[0],
  ]);
  assert.equal(recoveredSegment?.url, `${SESSION_ID}/${SEGMENT_NAME}`);
  assert.equal(recoveredSegment?.segmentIndex, 0);

  assert.equal(resolveRecoveredPlaybackRecording(SESSION_ID, null, []), null);
});

test("screenshot metadata merges a later checkpoint without dropping earlier captures", () => {
  const first: SessionScreenshotEntry[] = [
    {
      url: "signed-1",
      path: `${SESSION_ID}/2026-08-25T11-48-04-247Z-camera.jpg`,
      timestamp: "2026-08-25T11:48:04.247Z",
      type: "camera",
    },
  ];
  const second: SessionScreenshotEntry[] = [
    {
      url: "signed-2",
      path: `${SESSION_ID}/2026-08-25T11-49-04-335Z-screen.jpg`,
      timestamp: "2026-08-25T11:49:04.335Z",
      type: "screen",
    },
  ];

  assert.deepEqual(mergeScreenshotEntries(first, second), [...first, ...second]);
  assert.deepEqual(mergeScreenshotEntries(first, []), first);
});

test("review page shows the audio player without waiting for canplay", () => {
  const source = readFileSync(
    join(repoRoot, "src/components/interview/interview-results.tsx"),
    "utf8",
  );
  assert.equal(source.includes("audioCanPlay"), false);
  assert.equal(source.includes("onCanPlay"), false);
  assert.match(source, /<audio\s+controls\s+preload="auto"\s+src=\{rec\.url\}/);
});
