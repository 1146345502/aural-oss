export type BiText = { zh: string; en: string };

export function bt(isZh: boolean, text: BiText): string {
  return isZh ? text.zh : text.en;
}
