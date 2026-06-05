"use client";

import { useEffect } from "react";

const THEME_KEY = "vocab-ai-study.theme";

export function useThemeMode() {
  useEffect(() => {
    const readTheme = () => {
      try {
        return JSON.parse(localStorage.getItem(THEME_KEY) ?? "\"system\"") as "system" | "light" | "dark";
      } catch {
        return "system";
      }
    };

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const theme = readTheme();
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
    };

    applyTheme();
    media.addEventListener("change", applyTheme);
    window.addEventListener("storage", applyTheme);

    return () => {
      media.removeEventListener("change", applyTheme);
      window.removeEventListener("storage", applyTheme);
    };
  }, []);
}
