interface RecordingMetadataCheckpointOptions<TScreenshot, TResult> {
  screenshots: readonly TScreenshot[];
  persistScreenshots: (screenshots: TScreenshot[]) => Promise<void>;
  stopRecording: () => Promise<TResult>;
  onCheckpointError?: (error: unknown) => void;
}

/**
 * Persist the lightweight screenshot metadata before stopping the recorder.
 * Stopping uploads the full audio file and can take long enough for the caller
 * to time out, so it must not be the first opportunity to save screenshot refs.
 */
export async function stopRecordingAfterMetadataCheckpoint<TScreenshot, TResult>({
  screenshots,
  persistScreenshots,
  stopRecording,
  onCheckpointError,
}: RecordingMetadataCheckpointOptions<TScreenshot, TResult>): Promise<TResult> {
  const snapshot = [...screenshots];

  if (snapshot.length > 0) {
    try {
      await persistScreenshots(snapshot);
    } catch (error) {
      onCheckpointError?.(error);
    }
  }

  return stopRecording();
}
