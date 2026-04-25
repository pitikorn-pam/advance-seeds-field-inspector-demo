import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme as nwColorScheme } from "nativewind";
import type { Theme } from "@advance-seeds/types";

const STORAGE_KEY = "as.mobile.theme";

interface ThemeContext {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolved: "light" | "dark";
}

const ctx = createContext<ThemeContext | null>(null);

function resolveSystem(): "light" | "dark" {
  return Appearance.getColorScheme() === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  if (theme === "system") {
    nwColorScheme.set("system");
  } else {
    nwColorScheme.set(theme);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">(() => resolveSystem());

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      const next = (saved as Theme | null) ?? "system";
      setThemeState(next);
      applyTheme(next);
    });
    const sub = Appearance.addChangeListener(() => {
      setResolved(resolveSystem());
    });
    return () => sub.remove();
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    setResolved(next === "system" ? resolveSystem() : next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  };

  return <ctx.Provider value={{ theme, setTheme, resolved }}>{children}</ctx.Provider>;
}

export function useTheme() {
  const value = useContext(ctx);
  if (!value) throw new Error("useTheme must be inside <ThemeProvider>");
  return value;
}
