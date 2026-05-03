import type { SeedAnalyzer } from "@advance-seeds/types";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { InteractionManager } from "react-native";
import { ClassicalSeedAnalyzer } from "./ClassicalSeedAnalyzer";
import { selectAnalyzer } from "./selectAnalyzer";

const ctx = createContext<SeedAnalyzer | null>(null);

export function AnalyzerProvider({ children }: { children: ReactNode }) {
  // Render with the classical analyzer immediately so screens never see a
  // null context; swap in the resolved analyzer once selectAnalyzer settles.
  const initial = useMemo(() => new ClassicalSeedAnalyzer(), []);
  const [analyzer, setAnalyzer] = useState<SeedAnalyzer>(initial);

  useEffect(() => {
    let cancelled = false;
    // Analyzer selection runs immediately — screens depend on it.
    selectAnalyzer().then((picked) => {
      if (!cancelled) setAnalyzer(picked);
    });

    // Defer the registry probe until after the initial cold-start
    // interaction burst settles. Without this, the resolveDefaultModel
    // fetch + dynamic imports + publishResolveResult re-render compete
    // with the Home screen's first paint (greeting, hero card,
    // inspection query) and make the home menu feel sluggish on
    // launch. InteractionManager schedules after gesture/animation
    // queues drain; the extra setTimeout gives slow devices a beat
    // before we touch the network.
    let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
    const handle = InteractionManager.runAfterInteractions(() => {
      cleanupTimer = setTimeout(async () => {
        if (cancelled) return;
        try {
          const { resolveDefaultModel } = await import("@/lib/models/registryService");
          const { readActiveModel } = await import("@/lib/models/modelStore");
          const { publishResolveResult } = await import("@/lib/models/updateStore");
          const active = await readActiveModel();
          if (cancelled) return;
          const res = await resolveDefaultModel({
            channel: "production",
            currentVersion: active?.manifest?.display_name ?? "",
            currentCompat: active?.metadata?.model_version ?? "",
          });
          if (cancelled) return;
          publishResolveResult(res);
          if (res.action === "update") {
            const { runAutoInstallIfEligible } = await import("@/lib/models/autoInstall");
            void runAutoInstallIfEligible(res);
          }
        } catch (e) {
          console.warn("[registry] resolveDefaultModel failed", e);
        }
      }, 1500);
    });

    return () => {
      cancelled = true;
      handle.cancel();
      if (cleanupTimer) clearTimeout(cleanupTimer);
    };
  }, []);

  return <ctx.Provider value={analyzer}>{children}</ctx.Provider>;
}

export function useAnalyzer(): SeedAnalyzer {
  const value = useContext(ctx);
  if (!value) throw new Error("useAnalyzer must be inside <AnalyzerProvider>");
  return value;
}
