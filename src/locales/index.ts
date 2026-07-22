import en from "./en";
import es from "./es";
import fr from "./fr";
import zh from "./zh";
import type { Dictionary } from "./en";

export type { Dictionary } from "./en";
export type LangKey = "en" | "zh" | "fr" | "es";

export const DEFAULT_LANG: LangKey = "en";

const dictionaries: Record<LangKey, Dictionary> = { en, zh, fr, es };

export function getLanguageKey(language?: string): LangKey {
  if (!language) return DEFAULT_LANG;
  const normalized = language.toLowerCase();
  const key = normalized.slice(0, 2);
  if (key === "zh" || normalized.includes("chinese")) return "zh";
  if (key === "fr" || normalized.includes("french") || normalized.includes("français")) return "fr";
  if (
    key === "es" ||
    normalized.includes("spanish") ||
    normalized.includes("español") ||
    normalized.includes("espanol")
  ) {
    return "es";
  }
  return DEFAULT_LANG;
}

export function getDictionary(language?: string): Dictionary {
  return dictionaries[getLanguageKey(language)];
}

export function useTranslations(language?: string): Dictionary {
  return getDictionary(language);
}
