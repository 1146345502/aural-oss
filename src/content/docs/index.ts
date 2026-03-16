import type { ReactNode } from "react";
import { isValidElement, Children } from "react";
import type { DocCategory, DocArticle } from "./types";

import { gettingStartedArticles } from "./getting-started";
import { creatingInterviewsArticles } from "./creating-interviews";
import { managingCandidatesArticles } from "./managing-candidates";
import { takingAnInterviewArticles } from "./taking-an-interview";
import { resultsAnalyticsArticles } from "./results-analytics";
import { teamsOrganizationsArticles } from "./teams-organizations";
import { accountSecurityArticles } from "./account-security";
import { troubleshootingArticles } from "./troubleshooting";
import { faqArticles } from "./faq";

export const categories: DocCategory[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    description: "Learn the basics of Aural and set up your first interview",
    iconName: "Rocket",
    audience: "both",
    order: 1,
  },
  {
    slug: "creating-interviews",
    title: "Creating Interviews",
    description: "Design interviews with AI or build them manually",
    iconName: "PenTool",
    audience: "creators",
    order: 2,
  },
  {
    slug: "managing-candidates",
    title: "Managing Candidates",
    description: "Add candidates, share links, and track sessions",
    iconName: "Users",
    audience: "creators",
    order: 3,
  },
  {
    slug: "taking-an-interview",
    title: "Taking an Interview",
    description: "Guide for interviewees on voice, chat, and video sessions",
    iconName: "Mic",
    audience: "interviewees",
    order: 4,
  },
  {
    slug: "results-analytics",
    title: "Results & Analytics",
    description: "Review transcripts, AI insights, and export reports",
    iconName: "BarChart3",
    audience: "creators",
    order: 5,
  },
  {
    slug: "teams-organizations",
    title: "Teams & Organizations",
    description: "Collaborate with your team and manage projects",
    iconName: "Building2",
    audience: "creators",
    order: 6,
  },
  {
    slug: "account-security",
    title: "Account & Security",
    description: "Manage your profile, password, and data privacy",
    iconName: "Shield",
    audience: "both",
    order: 8,
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    description: "Fix common issues with audio, video, and connectivity",
    iconName: "Wrench",
    audience: "both",
    order: 9,
  },
  {
    slug: "faq",
    title: "FAQ",
    description: "Answers to frequently asked questions",
    iconName: "HelpCircle",
    audience: "both",
    order: 10,
  },
];

const allArticles: DocArticle[] = [
  ...gettingStartedArticles,
  ...creatingInterviewsArticles,
  ...managingCandidatesArticles,
  ...takingAnInterviewArticles,
  ...resultsAnalyticsArticles,
  ...teamsOrganizationsArticles,
  ...accountSecurityArticles,
  ...troubleshootingArticles,
  ...faqArticles,
];

export function getCategory(slug: string): DocCategory | undefined {
  return categories.find((c) => c.slug === slug);
}

export function getCategoryArticles(categorySlug: string): DocArticle[] {
  return allArticles
    .filter((a) => a.categorySlug === categorySlug)
    .sort((a, b) => a.order - b.order);
}

export function getArticle(
  categorySlug: string,
  articleSlug: string
): DocArticle | undefined {
  return allArticles.find(
    (a) => a.categorySlug === categorySlug && a.slug === articleSlug
  );
}

export interface SearchResult {
  article: DocArticle;
  snippet?: string;
}

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(" ");
  if (isValidElement(node)) {
    const { children, title, alt } = node.props as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof title === "string") parts.push(title);
    if (typeof alt === "string") parts.push(alt);
    if (children != null) {
      Children.forEach(children as ReactNode, (child) => {
        parts.push(extractText(child));
      });
    }
    return parts.join(" ");
  }
  return "";
}

const textCache = new Map<string, string>();

function getArticleText(article: DocArticle): string {
  const key = `${article.categorySlug}/${article.slug}`;
  let text = textCache.get(key);
  if (text == null) {
    text = extractText(article.content())
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    textCache.set(key, text);
  }
  return text;
}

function buildSnippet(text: string, query: string): string | undefined {
  const idx = text.indexOf(query);
  if (idx === -1) return undefined;
  const radius = 60;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet += "...";
  return snippet;
}

export function searchArticles(query: string): SearchResult[] {
  const lower = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const article of allArticles) {
    const titleMatch = article.title.toLowerCase().includes(lower);
    const descMatch = article.description.toLowerCase().includes(lower);
    if (titleMatch || descMatch) {
      results.push({ article });
      continue;
    }

    const bodyText = getArticleText(article);
    const snippet = buildSnippet(bodyText, lower);
    if (snippet) {
      results.push({ article, snippet });
    }
  }

  return results;
}
