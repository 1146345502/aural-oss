import type { ReactNode } from "react";

export function DocFeatureGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
      {children}
    </div>
  );
}

export function DocFeature({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-mk-border bg-white p-5">
      <h4 className="font-heading font-semibold text-mk-text text-sm mb-2">
        {title}
      </h4>
      <div className="text-sm text-mk-text-secondary leading-relaxed">
        {children}
      </div>
    </div>
  );
}
