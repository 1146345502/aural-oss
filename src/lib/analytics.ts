type GtagEvent = {
  action: string;
  category?: string;
  label?: string;
  value?: number;
};

export function trackEvent({ action, category, label, value }: GtagEvent) {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as Record<string, unknown>).gtag as
    | ((...args: unknown[]) => void)
    | undefined;
  if (!gtag) return;
  gtag("event", action, {
    event_category: category,
    event_label: label,
    value,
  });
}

export function trackCtaClick(label: string, location: string) {
  trackEvent({
    action: "cta_click",
    category: "conversion",
    label: `${location}__${label}`,
  });
}
