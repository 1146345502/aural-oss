import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface Crumb {
  label: string;
  href?: string;
}

export function DocsBreadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-mk-text-secondary">
      <Link
        href="/docs"
        className="hover:text-mk-terracotta transition-colors"
      >
        Docs
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5" />
          {crumb.href ? (
            <Link
              href={crumb.href}
              className="hover:text-mk-terracotta transition-colors"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="text-mk-text font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
