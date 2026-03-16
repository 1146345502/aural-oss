import type { ReactNode } from "react";

export type Audience = "creators" | "interviewees" | "both";

export interface DocCategory {
  slug: string;
  title: string;
  description: string;
  iconName: string;
  audience: Audience;
  order: number;
}

export interface DocArticle {
  slug: string;
  categorySlug: string;
  title: string;
  description: string;
  audience: Audience;
  order: number;
  content: () => ReactNode;
}
