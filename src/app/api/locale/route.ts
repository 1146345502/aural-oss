import { NextRequest, NextResponse } from "next/server";

const CHINA_COUNTRY_CODES = new Set(["CN", "HK", "MO", "TW"]);
const FRENCH_COUNTRY_CODES = new Set(["FR", "BE", "LU", "MC"]);

export function GET(request: NextRequest) {
  const country =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-country-code") ??
    null;

  const normalizedCountry = country?.toUpperCase() ?? null;
  const suggestedLocale =
    normalizedCountry && CHINA_COUNTRY_CODES.has(normalizedCountry)
      ? "zh"
      : normalizedCountry && FRENCH_COUNTRY_CODES.has(normalizedCountry)
        ? "fr"
        : "en";

  return NextResponse.json({ locale: suggestedLocale, country });
}
