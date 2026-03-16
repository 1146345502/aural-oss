"use client";

import Link from "next/link";
import { AuralLogo } from "@/components/ui/aural-logo";
import { DocsSearch } from "./docs-search";
import { ExternalLink } from "lucide-react";

export function DocsHeader() {
  return (
    <header className="sticky top-0 z-50 bg-mk-bg/80 backdrop-blur-md border-b border-mk-border/40">
      <div className="flex items-center gap-6 px-6 py-3">
        <Link
          href="/docs"
          className="flex items-center gap-1.5 shrink-0 group"
        >
          <AuralLogo
            size={30}
            className="transition-transform duration-300 group-hover:scale-110"
          />
          <span className="font-heading text-base font-bold tracking-[1.5px] text-mk-text">
            AURAL
          </span>
        </Link>

        <div className="flex-1 max-w-lg mx-auto">
          <DocsSearch compact />
        </div>

        <nav className="hidden md:flex items-center gap-5 shrink-0">
          <Link
            href="/"
            target="_blank"
            className="flex items-center gap-1 text-xs font-medium text-mk-text-secondary hover:text-mk-text transition-colors"
          >
            Home
            <ExternalLink className="h-3 w-3" />
          </Link>
          <Link
            href="/register"
            className="bg-mk-dark text-mk-text-light text-xs font-semibold px-4 py-2 rounded-lg hover:bg-mk-dark/80 transition-all duration-200"
          >
            Get Started
          </Link>
        </nav>
      </div>
    </header>
  );
}
