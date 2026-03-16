import sharp from "sharp";
import { createLogger } from "@/lib/logger";

const log = createLogger("ai/convert-svg");

/**
 * Convert an SVG data URL to a PNG data URL.
 * Returns the original URL unchanged if it's not SVG or conversion fails.
 */
export async function svgDataUrlToPng(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image/svg+xml")) return dataUrl;

  try {
    // Extract base64 SVG content
    const base64Match = dataUrl.match(/^data:image\/svg\+xml;base64,(.+)$/);
    if (!base64Match) return dataUrl;

    const svgBuffer = Buffer.from(base64Match[1], "base64");
    const pngBuffer = await sharp(svgBuffer).png().toBuffer();
    return `data:image/png;base64,${pngBuffer.toString("base64")}`;
  } catch (err) {
    log.error("SVG to PNG conversion failed:", err);
    return dataUrl;
  }
}
