import { CategoryCard } from "@/components/docs/category-card";
import { DocsHeader } from "@/components/docs/docs-header";
import { DocsSearch } from "@/components/docs/docs-search";
import { categories, getCategoryArticles } from "@/content/docs";
import Link from "next/link";

export const metadata = {
  title: "Docs | Aural",
  description:
    "Learn how to use Aural — guides for interview creators and interviewees.",
};

export default function DocsHomePage() {
  return (
    <>
      <DocsHeader />

      <div className="bg-mk-dark py-16 px-8 lg:px-[120px]">
        <div className="max-w-[1440px] mx-auto text-center space-y-6">
          <span className="block font-heading text-[11px] font-semibold tracking-[2px] text-mk-terracotta">
            DOCUMENTATION
          </span>
          <h1 className="font-heading text-3xl md:text-5xl font-bold text-mk-text-light leading-tight">
            How can we help?
          </h1>
          <p className="text-lg text-mk-text-muted max-w-2xl mx-auto">
            Guides and answers for interview creators and interviewees.
          </p>
          <div className="pt-2">
            <DocsSearch />
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-5xl mx-auto px-8 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((category) => (
            <CategoryCard
              key={category.slug}
              category={category}
              articleCount={getCategoryArticles(category.slug).length}
            />
          ))}
        </div>
      </div>

      <footer className="border-t border-mk-border/60 px-8 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-mk-text-muted">
          <span>&copy; {new Date().getFullYear()} Aural. All rights reserved.</span>
          <Link href="/" className="hover:text-mk-terracotta transition-colors">
            aural-ai.com
          </Link>
        </div>
      </footer>
    </>
  );
}
