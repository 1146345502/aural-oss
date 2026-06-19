import { NextRequest, NextResponse } from "next/server";

const CHINA_COUNTRY_CODES = new Set(["CN", "HK", "MO", "TW"]);

export function GET(request: NextRequest) {
  const country =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-country-code") ??
    null;

  const suggestedLocale =
    country && CHINA_COUNTRY_CODES.has(country.toUpperCase()) ? "zh" : "en";

  return NextResponse.json({ locale: suggestedLocale, country });
}
