import { createContext, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import type { AppStateStatus } from "react-native";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Profile, Role } from "@advance-seeds/types";
import { supabase } from "./supabase";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Auto-refresh is disabled on the client (see lib/supabase.ts) to avoid
    // the boot-time "Refresh Token Not Found" noise. We drive refresh
    // ourselves: validate the persisted session at boot, then start the
    // tick. If the persisted token is stale, signOut locally and land the
    // user on the login screen — no log spam, no dead-token retry loop.
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error || !data.session) {
          if (error) await supabase.auth.signOut({ scope: "local" }).catch(() => {});
          setSession(null);
          setLoading(false);
          return;
        }
        // Probe the refresh token once before flipping on the auto-refresh
        // tick. If it's dead, the rejection is awaited here (caught) and
        // never reaches LogBox; if it's healthy, the SDK now owns the
        // ticking refresh until we stop it.
        const refresh = await supabase.auth.refreshSession();
        if (cancelled) return;
        if (refresh.error) {
          await supabase.auth.signOut({ scope: "local" }).catch(() => {});
          setSession(null);
        } else {
          setSession(refresh.data.session);
          void supabase.auth.startAutoRefresh();
        }
        setLoading(false);
      } catch {
        if (cancelled) return;
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
        setSession(null);
        setLoading(false);
      }
    };
    void bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    const onAppState = (next: AppStateStatus) => {
      if (next === "active") void supabase.auth.startAutoRefresh();
      else void supabase.auth.stopAutoRefresh();
    };
    const appStateSub = AppState.addEventListener("change", onAppState);

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      appStateSub.remove();
      void supabase.auth.stopAutoRefresh();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("id, email, full_name, role, locale")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) {
          setProfile({
            id: data.id,
            email: data.email,
            full_name: data.full_name,
            role: data.role as Role,
            locale: data.locale,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <ctx.Provider
      value={{
        session,
        profile,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </ctx.Provider>
  );
}

export function useAuth() {
  const value = useContext(ctx);
  if (!value) throw new Error("useAuth must be inside <AuthProvider>");
  return value;
}
