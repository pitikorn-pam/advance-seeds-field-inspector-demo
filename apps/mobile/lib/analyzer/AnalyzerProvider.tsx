import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import type { SeedAnalyzer } from "@advance-seeds/types";
import { ClassicalSeedAnalyzer } from "./ClassicalSeedAnalyzer";

const ctx = createContext<SeedAnalyzer | null>(null);

let warned = false;

export function AnalyzerProvider({ children }: { children: ReactNode }) {
  const analyzer = useMemo(() => new ClassicalSeedAnalyzer(), []);

  if (__DEV__ && !warned) {
    warned = true;
    console.warn("ClassicalSeedAnalyzer active — ML analyzer pending");
  }

  return <ctx.Provider value={analyzer}>{children}</ctx.Provider>;
}

export function useAnalyzer(): SeedAnalyzer {
  const value = useContext(ctx);
  if (!value) throw new Error("useAnalyzer must be inside <AnalyzerProvider>");
  return value;
}
