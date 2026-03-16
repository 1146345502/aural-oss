"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { searchArticles, getCategory, type SearchResult } from "@/content/docs";
import { AudienceBadge } from "./audience-badge";
import { cn } from "@/lib/utils";

interface DocsSearchProps {
  compact?: boolean;
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || query.length < 2) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-mk-terracotta/20 text-inherit rounded-sm px-0.5">{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export function DocsSearch({ compact }: DocsSearchProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = useMemo<SearchResult[]>(
    () => (query.length >= 2 ? searchArticles(query) : []),
    [query]
  );

  const showResults = focused && query.length >= 2;

  return (
    <div className="relative w-full max-w-xl mx-auto">
      <div className="relative">
        <Search
          className={cn(
            "absolute left-3.5 top-1/2 -translate-y-1/2 text-mk-text-muted",
            compact ? "h-4 w-4" : "h-5 w-5"
          )}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder="Search..."
          className={cn(
            "w-full bg-white border border-mk-border text-sm text-mk-text placeholder:text-mk-text-muted focus:outline-none focus:border-mk-terracotta/50 focus:ring-2 focus:ring-mk-terracotta/10 transition-all",
            compact
              ? "pl-10 pr-16 py-2 rounded-lg"
              : "pl-12 pr-10 py-3.5 rounded-xl"
          )}
        />
        {query ? (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-mk-text-muted hover:text-mk-text transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="absolute right-3.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 rounded border border-mk-border bg-mk-bg px-1.5 py-0.5 text-[10px] font-medium text-mk-text-muted">
            <span className="text-xs">⌘</span>K
          </kbd>
        )}
      </div>

      {showResults && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-mk-border rounded-xl shadow-lg overflow-hidden z-50 max-h-96 overflow-y-auto code-scrollbar">
          {results.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-mk-text-muted">
              No articles found for &quot;{query}&quot;
            </div>
          ) : (
            results.map(({ article, snippet }) => {
              const category = getCategory(article.categorySlug);
              return (
                <Link
                  key={`${article.categorySlug}/${article.slug}`}
                  href={`/docs/${article.categorySlug}/${article.slug}`}
                  className="flex items-start gap-3 px-5 py-3.5 hover:bg-mk-bg transition-colors border-b border-mk-border/50 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-mk-text truncate">
                        <Highlight text={article.title} query={query} />
                      </span>
                      <AudienceBadge audience={article.audience} />
                    </div>
                    <span className="block text-xs text-mk-text-muted text-left">
                      {category?.title}
                    </span>
                    {snippet && (
                      <p className="mt-1 text-xs text-mk-text-secondary line-clamp-2 text-left">
                        <Highlight text={snippet} query={query} />
                      </p>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
