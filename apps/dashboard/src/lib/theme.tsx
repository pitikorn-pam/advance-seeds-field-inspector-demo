import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Theme } from "@advance-seeds/types";

const STORAGE_KEY = "as.dashboard.theme";

interface ThemeContext {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolved: "light" | "dark";
}

const ctx = createContext<ThemeContext | null>(null);

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.dataset.theme = theme;
  }
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return saved ?? "system";
  });
  const [resolved, setResolved] = useState<"light" | "dark">(() => resolveTheme(theme));

  useEffect(() => {
    applyTheme(theme);
    setResolved(resolveTheme(theme));
    localStorage.setItem(STORAGE_KEY, theme);

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => setResolved(resolveTheme("system"));
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    return undefined;
  }, [theme]);

  return (
    <ctx.Provider value={{ theme, setTheme: setThemeState, resolved }}>{children}</ctx.Provider>
  );
}

export function useTheme() {
  const value = useContext(ctx);
  if (!value) throw new Error("useTheme must be inside <ThemeProvider>");
  return value;
}
