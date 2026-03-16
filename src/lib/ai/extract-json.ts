import { createLogger } from "@/lib/logger";

const log = createLogger("ai/extract-json");

/**
 * Robustly extract and parse a JSON object from an AI response string.
 *
 * Handles common issues:
 * - Unicode smart / curly quotes (U+201C, U+201D, etc.) → standard ASCII `"`
 * - JSON wrapped inside markdown code blocks (```json ... ```)
 * - Stray control characters
 * - Unescaped newlines and quotes inside string values
 */
export function extractJson<T = Record<string, unknown>>(raw: string): T {
  // 1. Normalise smart / curly quotes to ASCII equivalents
  let text = raw
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // double
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'"); // single

  // 2. If the response is wrapped in a markdown code block, extract the inner content
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlock) {
    text = codeBlock[1].trim();
  }

  // 3. Extract the outermost JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in AI response");
  }

  let jsonStr = jsonMatch[0];

  // 4. Try parsing directly
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // 5. Fallback: sanitise common issues
    jsonStr = sanitiseJsonString(jsonStr);
    try {
      return JSON.parse(jsonStr) as T;
    } catch (e) {
      // 6. Last resort: log the problematic content for debugging
      log.error(
        "Failed to parse after sanitisation. First 500 chars:",
        jsonStr.slice(0, 500),
      );
      throw e;
    }
  }
}

/**
 * Walk through the raw JSON character-by-character, escaping unescaped
 * control characters and quotes that appear inside string values.
 */
function sanitiseJsonString(raw: string): string {
  // Strip invisible / non-printable control chars outside of strings (keep \n \r \t)
  const input = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  const out: string[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    if (ch === '"') {
      // Start of a JSON string – walk until we find the real closing quote
      out.push('"');
      i++;
      const strChars: string[] = [];
      while (i < len) {
        const sc = input[i];
        if (sc === "\\") {
          // Keep existing escape sequences
          strChars.push(sc);
          i++;
          if (i < len) {
            strChars.push(input[i]);
            i++;
          }
        } else if (sc === '"') {
          // Is this the real end of the string, or an unescaped interior quote?
          // Peek ahead: if the next non-whitespace char is one of : , ] } or it's
          // immediately followed by , ] } : then it's likely the real closing quote.
          const after = input.slice(i + 1).match(/^\s*(.)/);
          const nextSignificant = after ? after[1] : "";
          if (
            nextSignificant === "," ||
            nextSignificant === "}" ||
            nextSignificant === "]" ||
            nextSignificant === ":" ||
            nextSignificant === ""
          ) {
            // Real closing quote
            break;
          } else {
            // Interior unescaped quote – escape it
            strChars.push('\\"');
            i++;
          }
        } else if (sc === "\n") {
          strChars.push("\\n");
          i++;
        } else if (sc === "\r") {
          strChars.push("\\r");
          i++;
        } else if (sc === "\t") {
          strChars.push("\\t");
          i++;
        } else {
          strChars.push(sc);
          i++;
        }
      }
      out.push(strChars.join(""));
      out.push('"');
      i++; // skip the closing quote
    } else {
      out.push(ch);
      i++;
    }
  }

  return out.join("");
}
