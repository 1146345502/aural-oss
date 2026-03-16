import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://aural-ai.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/about", "/contact", "/security", "/privacy", "/terms", "/cookies", "/refund", "/docs", "/blog"],
        disallow: ["/api/", "/i/", "/login", "/register", "/settings", "/projects", "/interviews", "/candidates", "/questions", "/org"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
