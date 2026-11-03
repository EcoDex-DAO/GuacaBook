"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  Locale,
  detectLocale,
  isLocale,
  languages,
  translate,
} from "../../lib/i18n";
const Context = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
} | null>(null);
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, changeLocale] = useState<Locale>("fr");
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("guacabook-language");
    } catch {}
    changeLocale(
      isLocale(saved)
        ? saved
        : detectLocale(navigator.languages || [navigator.language]),
    );
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = useCallback((value: Locale) => {
    changeLocale(value);
    try {
      localStorage.setItem("guacabook-language", value);
    } catch {
      /* A blocked preference store must not block annotation. */
    }
  }, []);
  const t = useCallback(
    (key: string, values?: Record<string, string | number>) =>
      translate(locale, key, values),
    [locale],
  );
  return (
    <Context.Provider value={{ locale, setLocale, t }}>
      {children}
    </Context.Provider>
  );
}
export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error("I18nProvider is required");
  return value;
}
export function LanguagePicker() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="languagebar">
      <label>
        Language / Langue
        <select
          aria-label="Language / Langue"
          value={locale}
          onChange={(e) => {
            if (isLocale(e.target.value)) setLocale(e.target.value);
          }}
        >
          {Object.entries(languages).map(([code, name]) => (
            <option key={code} value={code} lang={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
