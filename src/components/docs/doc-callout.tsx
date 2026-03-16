import type { ReactNode } from "react";
import { Lightbulb, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "tip" | "info" | "warning";

const variants: Record<Variant, { icon: typeof Info; bg: string; border: string; iconColor: string; text: string }> = {
  tip: {
    icon: Lightbulb,
    bg: "bg-amber-50",
    border: "border-amber-200/80",
    iconColor: "text-amber-600",
    text: "text-amber-950",
  },
  info: {
    icon: Info,
    bg: "bg-sky-50",
    border: "border-sky-200/80",
    iconColor: "text-sky-600",
    text: "text-sky-950",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-red-50",
    border: "border-red-200/80",
    iconColor: "text-red-600",
    text: "text-red-950",
  },
};

export function DocCallout({
  variant = "info",
  title,
  children,
}: {
  variant?: Variant;
  title?: string;
  children: ReactNode;
}) {
  const v = variants[variant];
  const Icon = v.icon;

  return (
    <div className={cn("flex gap-3 rounded-lg border p-4 my-5", v.bg, v.border)}>
      <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", v.iconColor)} />
      <div className={cn("text-sm leading-relaxed", v.text)}>
        {title && <p className="font-semibold mb-1">{title}</p>}
        {children}
      </div>
    </div>
  );
}
