import { createContext, useContext, useEffect, useState } from "react";
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
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
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
