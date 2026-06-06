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
    const legacyMedia = media as MediaQueryList & {
      addListener?: (listener: () => void) => void;
      removeListener?: (listener: () => void) => void;
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", applyTheme);
    } else {
      legacyMedia.addListener?.(applyTheme);
    }
    window.addEventListener("storage", applyTheme);

    return () => {
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", applyTheme);
      } else {
        legacyMedia.removeListener?.(applyTheme);
      }
      window.removeEventListener("storage", applyTheme);
    };
  }, []);
}
