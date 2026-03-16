import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { categories, getCategory, getCategoryArticles } from "@/content/docs";
import { DocsBreadcrumbs } from "@/components/docs/docs-breadcrumbs";
import { AudienceBadge } from "@/components/docs/audience-badge";

export function generateStaticParams() {
  return categories.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const category = getCategory(slug);
  if (!category) return {};
  return {
    title: `${category.title} | Aural Docs`,
    description: category.description,
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();

  const articles = getCategoryArticles(slug);

  return (
    <>
      <DocsBreadcrumbs crumbs={[{ label: category.title }]} />

      <div className="mt-6 mb-10">
        <h1 className="font-heading text-3xl font-bold text-mk-text mb-2">
          {category.title}
        </h1>
        <p className="text-mk-text-secondary">{category.description}</p>
      </div>

      <div className="space-y-3">
        {articles.map((article) => (
          <Link
            key={article.slug}
            href={`/docs/${slug}/${article.slug}`}
            className="group flex items-center justify-between bg-white border border-mk-border rounded-lg p-5 hover:border-mk-terracotta/50 hover:shadow-md transition-all duration-200"
          >
            <div className="flex-1 min-w-0 mr-4">
              <div className="flex items-center gap-2.5 mb-1">
                <span className="font-heading text-base font-semibold text-mk-text group-hover:text-mk-terracotta transition-colors">
                  {article.title}
                </span>
                <AudienceBadge audience={article.audience} />
              </div>
              <p className="text-sm text-mk-text-secondary truncate">
                {article.description}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-mk-text-muted group-hover:text-mk-terracotta group-hover:translate-x-1 transition-all shrink-0" />
          </Link>
        ))}
      </div>
    </>
  );
}
