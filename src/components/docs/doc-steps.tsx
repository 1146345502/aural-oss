import type { ReactNode } from "react";

export function DocSteps({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 ml-4 border-l-2 border-mk-border pl-7 space-y-8">
      {children}
    </div>
  );
}

export function DocStep({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <div className="absolute -left-[41px] top-0 w-7 h-7 rounded-full bg-mk-terracotta text-white text-xs font-bold flex items-center justify-center">
        {step}
      </div>
      <h4 className="font-heading font-semibold text-mk-text mb-2 text-[15px]">
        {title}
      </h4>
      <div className="text-sm text-mk-text-secondary leading-relaxed space-y-2">
        {children}
      </div>
    </div>
  );
}
