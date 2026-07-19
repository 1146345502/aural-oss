import { getAuthUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { fetchUrlWithReaderFallback } from "@/lib/url-fetch";
import * as cheerio from "cheerio";

const log = createLogger("api/ai/extract-text");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (
  buffer: Buffer,
) => Promise<{ text: string }>;

const MAX_TEXT_LENGTH = 15_000;

function truncate(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return text.slice(0, MAX_TEXT_LENGTH) + "\n\n[...truncated]";
}

function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, img, video, audio, iframe, nav, footer, header").remove();

  const mainContent =
    $("main").text() ||
    $("article").text() ||
    $('[role="main"]').text() ||
    $("body").text();

  return mainContent
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const url = formData.get("url") as string | null;

    if (!file && !url) {
      return Response.json(
        { error: "Provide either a PDF file or a URL" },
        { status: 400 },
      );
    }

    let extractedText: string;

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const pdfData = await pdfParse(buffer);
      extractedText = pdfData.text?.trim() ?? "";

      if (!extractedText) {
        return Response.json(
          { error: "Could not extract text from the PDF" },
          { status: 400 },
        );
      }
    } else {
      const targetUrl = url!.trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        return Response.json(
          { error: "Invalid URL — must start with http:// or https://" },
          { status: 400 },
        );
      }

      const { response: res } = await fetchUrlWithReaderFallback(targetUrl);

      if (!res.ok) {
        return Response.json(
          { error: `Failed to fetch URL (HTTP ${res.status})` },
          { status: 400 },
        );
      }

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("application/pdf")) {
        const buffer = Buffer.from(await res.arrayBuffer());
        const pdfData = await pdfParse(buffer);
        extractedText = pdfData.text?.trim() ?? "";
      } else if (contentType.includes("text/plain")) {
        extractedText = (await res.text()).trim();
      } else {
        const html = await res.text();
        extractedText = htmlToText(html);
      }

      if (!extractedText) {
        return Response.json(
          { error: "Could not extract meaningful text from the URL" },
          { status: 400 },
        );
      }
    }

    return Response.json({ text: truncate(extractedText) });
  } catch (err) {
    log.error("Text extraction error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
