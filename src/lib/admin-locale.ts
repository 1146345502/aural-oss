export type AdminLocale = "en" | "zh" | "fr";

const ADMIN_LOCALES: readonly AdminLocale[] = ["en", "zh", "fr"];

export function isAdminLocale(value: string | undefined | null): value is AdminLocale {
  return !!value && (ADMIN_LOCALES as readonly string[]).includes(value);
}

// Org-wide fallback for the admin dashboard UI language (distinct from
// per-user preference and from the candidate-facing interview language in
// src/locales/). Falls back to "en" when unset or invalid.
export const DEFAULT_ADMIN_LOCALE: AdminLocale = isAdminLocale(
  process.env.NEXT_PUBLIC_DEFAULT_ADMIN_LOCALE,
)
  ? (process.env.NEXT_PUBLIC_DEFAULT_ADMIN_LOCALE as AdminLocale)
  : "en";
