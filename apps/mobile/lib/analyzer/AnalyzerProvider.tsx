import type { SeedAnalyzer } from "@advance-seeds/types";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { InteractionManager } from "react-native";
import { useAuth } from "@/lib/auth";
import { ClassicalSeedAnalyzer } from "./ClassicalSeedAnalyzer";
import { selectAnalyzer } from "./selectAnalyzer";

const ctx = createContext<SeedAnalyzer | null>(null);

export function AnalyzerProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
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
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // The registry probe runs only after sign-in. It publishes the resolve
    // result so the Models screen and the Home update banner know whether
    // an install or update is available — but it never DOWNLOADS a model
    // on its own. First-launch auto-install was removed because the
    // ~60 MB download made the post-login experience feel stuck; the
    // user installs manually from /more/models or via the Inspect-tab
    // gate, both of which surface the missing-model message clearly.
    //
    // `runAutoInstallIfEligible` is still wired for the user-opt-in
    // "auto-install updates on Wi-Fi" pref (default off) — it never
    // triggers a first-launch download because that path is gone.
    if (!session) return;

    let cancelled = false;
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
  }, [session]);

  return <ctx.Provider value={analyzer}>{children}</ctx.Provider>;
}

export function useAnalyzer(): SeedAnalyzer {
  const value = useContext(ctx);
  if (!value) throw new Error("useAnalyzer must be inside <AnalyzerProvider>");
  return value;
}
