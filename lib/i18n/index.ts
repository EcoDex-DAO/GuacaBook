import en from "./en.json";
import es from "./es.json";
import pt from "./pt.json";
export const languages = {
  fr: "Français",
  en: "English",
  es: "Español",
  pt: "Português",
} as const;
export type Locale = keyof typeof languages;
export const dictionaries: Record<
  Exclude<Locale, "fr">,
  Record<string, string>
> = { en, es, pt };
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && Object.hasOwn(languages, value);
}
export function detectLocale(preferences: readonly string[]): Locale {
  for (const preference of preferences) {
    const base = preference.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return "en";
}
export function translate(
  locale: Locale,
  key: string,
  values: Record<string, string | number> = {},
): string {
  const template = locale === "fr" ? key : (dictionaries[locale][key] ?? key);
  return template.replace(/\{(\w+)\}/g, (original, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : original,
  );
}
