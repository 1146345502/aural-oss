import type { ReactNode } from "react";

export type Audience = "creators" | "interviewees" | "both";

export interface DocCategory {
  slug: string;
  title: string;
  titleZh?: string;
  description: string;
  descriptionZh?: string;
  iconName: string;
  audience: Audience;
  order: number;
}

export interface DocArticle {
  slug: string;
  categorySlug: string;
  title: string;
  titleZh?: string;
  description: string;
  descriptionZh?: string;
  audience: Audience;
  order: number;
  content: () => ReactNode;
  contentZh?: () => ReactNode;
}
