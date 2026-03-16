import type { ReactNode } from "react";

export function ArticleContent({ children }: { children: ReactNode }) {
  return (
    <div
      className={[
        "docs-prose max-w-none text-mk-text text-[15px] leading-relaxed",
        // Headings
        "[&>h2]:font-heading [&>h2]:text-xl [&>h2]:font-bold [&>h2]:text-mk-text [&>h2]:mt-10 [&>h2]:mb-4",
        "[&>h2]:pb-2 [&>h2]:border-b [&>h2]:border-mk-border/60",
        "[&>h3]:font-heading [&>h3]:text-base [&>h3]:font-semibold [&>h3]:text-mk-text [&>h3]:mt-8 [&>h3]:mb-3",
        // Paragraphs
        "[&>p]:mb-4 [&>p]:text-mk-text-secondary",
        // Lists
        "[&>ul]:mb-4 [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:space-y-2",
        "[&>ul>li]:text-mk-text-secondary [&>ul>li]:leading-relaxed",
        "[&>ol]:mb-4 [&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:space-y-2",
        "[&>ol>li]:text-mk-text-secondary [&>ol>li]:leading-relaxed",
        "[&_li>strong]:text-mk-text [&_li>strong]:font-semibold",
        // Inline styles
        "[&_strong]:text-mk-text [&_strong]:font-semibold",
        "[&>hr]:my-8 [&>hr]:border-mk-border",
        // Code
        "[&_code]:bg-mk-card [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono",
        // Blockquote
        "[&>blockquote]:border-l-4 [&>blockquote]:border-mk-terracotta/30 [&>blockquote]:pl-4 [&>blockquote]:py-2 [&>blockquote]:my-4",
        "[&>blockquote]:text-mk-text-secondary [&>blockquote]:italic [&>blockquote]:bg-mk-card/50 [&>blockquote]:rounded-r-lg [&>blockquote]:pr-4",
        // Tables
        "[&_table]:w-full [&_table]:my-6 [&_table]:text-sm [&_table]:border-collapse [&_table]:rounded-lg [&_table]:overflow-hidden [&_table]:border [&_table]:border-mk-border",
        "[&_thead]:bg-mk-card [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-mk-text [&_th]:border-b [&_th]:border-mk-border",
        "[&_td]:px-4 [&_td]:py-2.5 [&_td]:text-mk-text-secondary [&_td]:border-b [&_td]:border-mk-border/50",
        "[&_tbody_tr:last-child_td]:border-b-0",
        "[&_tbody_tr:hover]:bg-mk-card/30",
        // Links
        "[&_a]:text-mk-terracotta [&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:text-mk-terracotta/80",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
