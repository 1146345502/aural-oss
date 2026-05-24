/** True when the user cancelled a fetch/stream (stop button, navigation, etc.). */
export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error) {
    return (
      err.name === "AbortError" ||
      /aborted/i.test(err.message) ||
      err.message.includes("BodyStreamBuffer")
    );
  }
  return false;
}
