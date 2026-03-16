import Link from "next/link";
import {
  Rocket,
  PenTool,
  Users,
  Mic,
  BarChart3,
  Building2,
  CreditCard,
  Shield,
  Wrench,
  HelpCircle,
} from "lucide-react";
import type { DocCategory } from "@/content/docs/types";

const iconMap: Record<string, React.ElementType> = {
  Rocket,
  PenTool,
  Users,
  Mic,
  BarChart3,
  Building2,
  CreditCard,
  Shield,
  Wrench,
  HelpCircle,
};

export function CategoryCard({
  category,
  articleCount,
}: {
  category: DocCategory;
  articleCount: number;
}) {
  const Icon = iconMap[category.iconName] ?? HelpCircle;

  return (
    <Link
      href={`/docs/${category.slug}`}
      className="group flex flex-col bg-white border border-mk-border rounded-lg p-6 hover:border-mk-terracotta/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 h-full"
    >
      <div className="w-11 h-11 bg-mk-terracotta/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-mk-terracotta/20 transition-colors duration-300">
        <Icon size={20} className="text-mk-terracotta" />
      </div>
      <h3 className="font-heading text-base font-bold text-mk-text mb-1.5">
        {category.title}
      </h3>
      <p className="text-sm text-mk-text-secondary leading-relaxed mb-3 flex-1">
        {category.description}
      </p>
      <span className="text-xs text-mk-text-muted">
        {articleCount} {articleCount === 1 ? "article" : "articles"}
      </span>
    </Link>
  );
}
