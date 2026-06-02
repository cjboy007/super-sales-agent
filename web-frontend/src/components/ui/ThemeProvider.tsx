"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type SsaTheme = "dark" | "light";
type SsaLanguage = "en" | "zh";
export type SsaUiSize = "small" | "medium" | "large";

interface ThemeContextValue {
  theme: SsaTheme;
  language: SsaLanguage;
  uiSize: SsaUiSize;
  toggleTheme: () => void;
  setLanguage: (language: SsaLanguage) => void;
  setUiSize: (uiSize: SsaUiSize) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_STORAGE_KEY = "ssa-theme";
const LANGUAGE_STORAGE_KEY = "ssa-language";
const UI_SIZE_STORAGE_KEY = "ssa-ui-size";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<SsaTheme>("dark");
  const [language, setLanguage] = useState<SsaLanguage>("en");
  const [uiSize, setUiSize] = useState<SsaUiSize>("medium");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
    }

    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (storedLanguage === "en" || storedLanguage === "zh") {
      setLanguage(storedLanguage);
    }

    const storedUiSize = window.localStorage.getItem(UI_SIZE_STORAGE_KEY);
    if (storedUiSize === "small" || storedUiSize === "medium" || storedUiSize === "large") {
      setUiSize(storedUiSize);
    }
    setPreferencesLoaded(true);
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [preferencesLoaded, theme]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    document.documentElement.dataset.language = language;
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    document.documentElement.dataset.uiSize = uiSize;
    window.localStorage.setItem(UI_SIZE_STORAGE_KEY, uiSize);
  }, [preferencesLoaded, uiSize]);

  const value = useMemo(
    () => ({
      theme,
      language,
      uiSize,
      toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
      setLanguage,
      setUiSize,
    }),
    [language, theme, uiSize]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
