import type { Audience } from "@/content/docs/types";

const config: Record<Audience, { label: string; className: string }> = {
  creators: {
    label: "For Creators",
    className:
      "bg-mk-terracotta/10 text-mk-terracotta border-mk-terracotta/20",
  },
  interviewees: {
    label: "For Interviewees",
    className: "bg-mk-info/10 text-mk-info border-mk-info/20",
  },
  both: {
    label: "For Everyone",
    className: "bg-mk-success/10 text-mk-success border-mk-success/20",
  },
};

export function AudienceBadge({ audience }: { audience: Audience }) {
  const { label, className } = config[audience];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${className}`}
    >
      {label}
    </span>
  );
}
