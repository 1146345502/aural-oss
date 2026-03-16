import Link from "next/link";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { DocsHeader } from "@/components/docs/docs-header";

export default function CategoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DocsHeader />
      <div className="flex-1 flex">
        <aside className="hidden lg:block w-64 shrink-0 border-r border-mk-border/60">
          <div className="sticky top-[49px] h-[calc(100vh-49px)] overflow-y-auto py-8 pl-8 pr-6 code-scrollbar">
            <DocsSidebar />
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 max-w-3xl w-full px-8 lg:px-16 py-10">
            {children}
          </div>

          <footer className="border-t border-mk-border/60 px-8 lg:px-16 py-5">
            <div className="max-w-3xl flex items-center justify-between text-xs text-mk-text-muted">
              <span>&copy; {new Date().getFullYear()} Aural. All rights reserved.</span>
              <Link
                href="/"
                className="hover:text-mk-terracotta transition-colors"
              >
                aural-ai.com
              </Link>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
