import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  categories,
  getCategory,
  getCategoryArticles,
  getArticle,
} from "@/content/docs";
import { DocsBreadcrumbs } from "@/components/docs/docs-breadcrumbs";
import { AudienceBadge } from "@/components/docs/audience-badge";
import { ArticleContent } from "@/components/docs/article-content";

export function generateStaticParams() {
  return categories.flatMap((c) =>
    getCategoryArticles(c.slug).map((a) => ({
      category: c.slug,
      slug: a.slug,
    }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category: catSlug, slug } = await params;
  const article = getArticle(catSlug, slug);
  if (!article) return {};
  const category = getCategory(catSlug);
  return {
    title: `${article.title} | ${category?.title} | Aural Docs`,
    description: article.description,
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category: catSlug, slug } = await params;
  const category = getCategory(catSlug);
  if (!category) notFound();

  const article = getArticle(catSlug, slug);
  if (!article) notFound();

  const articles = getCategoryArticles(catSlug);
  const currentIndex = articles.findIndex((a) => a.slug === slug);
  const prev = currentIndex > 0 ? articles[currentIndex - 1] : null;
  const next =
    currentIndex < articles.length - 1 ? articles[currentIndex + 1] : null;

  const Content = article.content;

  return (
    <>
      <DocsBreadcrumbs
        crumbs={[
          { label: category.title, href: `/docs/${category.slug}` },
          { label: article.title },
        ]}
      />

      <div className="mt-6 mb-8">
        <div className="flex items-center gap-3 mb-3">
          <AudienceBadge audience={article.audience} />
        </div>
        <h1 className="font-heading text-3xl font-bold text-mk-text mb-2">
          {article.title}
        </h1>
        <p className="text-mk-text-secondary">{article.description}</p>
      </div>

      <hr className="border-mk-border mb-8" />

      <ArticleContent>
        <Content />
      </ArticleContent>

      <hr className="border-mk-border my-10" />

      <div className="flex items-center justify-between gap-4 pb-4">
        {prev ? (
          <Link
            href={`/docs/${catSlug}/${prev.slug}`}
            className="group flex items-center gap-2 text-sm text-mk-text-secondary hover:text-mk-terracotta transition-colors"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
            {prev.title}
          </Link>
        ) : (
          <div />
        )}
        {next ? (
          <Link
            href={`/docs/${catSlug}/${next.slug}`}
            className="group flex items-center gap-2 text-sm text-mk-text-secondary hover:text-mk-terracotta transition-colors"
          >
            {next.title}
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        ) : (
          <div />
        )}
      </div>
    </>
  );
}
