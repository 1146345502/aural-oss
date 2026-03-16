"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { categories, getCategoryArticles } from "@/content/docs";

const SCROLL_KEY = "docs-sidebar-scroll";

export function DocsSidebar() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = navRef.current?.parentElement;
    if (!el) return;

    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved) el.scrollTop = Number(saved);

    const onScroll = () => sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav ref={navRef} className="space-y-6">
      {categories.map((category) => {
        const articles = getCategoryArticles(category.slug);
        const categoryActive = pathname.startsWith(`/docs/${category.slug}`);

        return (
          <div key={category.slug}>
            <Link
              href={`/docs/${category.slug}`}
              className={cn(
                "block font-heading text-xs font-semibold tracking-[1px] mb-2 transition-colors",
                categoryActive ? "text-mk-terracotta" : "text-mk-text hover:text-mk-terracotta"
              )}
            >
              {category.title.toUpperCase()}
            </Link>
            <ul className="space-y-0.5">
              {articles.map((article) => {
                const articleActive =
                  pathname === `/docs/${category.slug}/${article.slug}`;
                return (
                  <li key={article.slug}>
                    <Link
                      href={`/docs/${category.slug}/${article.slug}`}
                      className={cn(
                        "block text-sm py-1.5 pl-3 border-l-2 transition-colors",
                        articleActive
                          ? "border-mk-terracotta text-mk-terracotta font-medium"
                          : "border-transparent text-mk-text-secondary hover:text-mk-text hover:border-mk-border"
                      )}
                    >
                      {article.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
