import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import type { SeedAnalyzer } from "@advance-seeds/types";
import { MockSeedAnalyzer } from "./MockSeedAnalyzer";

const ctx = createContext<SeedAnalyzer | null>(null);

let warned = false;

export function AnalyzerProvider({ children }: { children: ReactNode }) {
  const analyzer = useMemo(() => new MockSeedAnalyzer(), []);

  // Spec: warn once on startup in dev mode that the mock is active.
  if (__DEV__ && !warned) {
    warned = true;
    console.warn("MockSeedAnalyzer active — replace before production");
  }

  return <ctx.Provider value={analyzer}>{children}</ctx.Provider>;
}

export function useAnalyzer(): SeedAnalyzer {
  const value = useContext(ctx);
  if (!value) throw new Error("useAnalyzer must be inside <AnalyzerProvider>");
  return value;
}
