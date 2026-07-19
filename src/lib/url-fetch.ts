const FETCH_TIMEOUT_MS = 15_000;
const READER_BASE_URL = "https://r.jina.ai/";

type FetchLike = typeof fetch;

export type UrlFetchResult = {
  response: Response;
  usedReaderFallback: boolean;
};

type FetchUrlOptions = {
  fetchImpl?: FetchLike;
  readerApiKey?: string;
};

function directFetchHeaders(): HeadersInit {
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/pdf,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

function shouldUseReaderFallback(response: Response): boolean {
  return (
    response.status === 403 ||
    response.headers.get("cf-mitigated")?.toLowerCase() === "challenge"
  );
}

export function buildReaderUrl(targetUrl: string): string {
  return `${READER_BASE_URL}${targetUrl}`;
}

export function normalizeReaderText(text: string): {
  text: string;
  targetErrorStatus: number | null;
} {
  const targetError = text.match(
    /^Warning: Target URL returned error (\d{3})(?::[^\n]*)?/m,
  );
  if (targetError) {
    return {
      text: "",
      targetErrorStatus: Number(targetError[1]),
    };
  }

  const contentMarker = "Markdown Content:";
  const markerIndex = text.indexOf(contentMarker);
  const content =
    markerIndex >= 0
      ? text.slice(markerIndex + contentMarker.length)
      : text;

  return {
    text: content.trim(),
    targetErrorStatus: null,
  };
}

/**
 * Fetch a public page directly, then use a browser-backed reader when the
 * origin rejects server-side requests with an anti-bot challenge.
 */
export async function fetchUrlWithReaderFallback(
  targetUrl: string,
  options: FetchUrlOptions = {},
): Promise<UrlFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const directResponse = await fetchImpl(targetUrl, {
    headers: directFetchHeaders(),
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!shouldUseReaderFallback(directResponse)) {
    return { response: directResponse, usedReaderFallback: false };
  }

  const readerHeaders: Record<string, string> = {
    Accept: "text/plain",
    "X-Engine": "browser",
    "X-Cache-Tolerance": "300",
  };
  const readerApiKey = options.readerApiKey ?? process.env.JINA_READER_API_KEY;
  if (readerApiKey) {
    readerHeaders.Authorization = `Bearer ${readerApiKey}`;
  }

  const readerResponse = await fetchImpl(buildReaderUrl(targetUrl), {
    headers: readerHeaders,
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!readerResponse.ok) {
    return { response: readerResponse, usedReaderFallback: true };
  }

  const normalized = normalizeReaderText(await readerResponse.text());
  if (normalized.targetErrorStatus) {
    return {
      response: new Response(null, { status: normalized.targetErrorStatus }),
      usedReaderFallback: true,
    };
  }

  return {
    response: new Response(normalized.text, {
      status: readerResponse.status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }),
    usedReaderFallback: true,
  };
}
