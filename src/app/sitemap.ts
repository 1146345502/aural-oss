import { categories, getCategoryArticles } from "@/content/docs";
import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://aural-ai.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: "weekly", priority: 1.0 },
    { url: `${siteUrl}/docs`, changeFrequency: "weekly", priority: 0.8 },
  ];

  const docsPages: MetadataRoute.Sitemap = categories.flatMap((category) => {
    const categoryEntry: MetadataRoute.Sitemap[number] = {
      url: `${siteUrl}/docs/${category.slug}`,
      changeFrequency: "weekly",
      priority: 0.6,
    };

    const articleEntries = getCategoryArticles(category.slug).map(
      (article): MetadataRoute.Sitemap[number] => ({
        url: `${siteUrl}/docs/${category.slug}/${article.slug}`,
        changeFrequency: "weekly",
        priority: 0.5,
      })
    );

    return [categoryEntry, ...articleEntries];
  });

  return [...staticPages, ...docsPages];
}
