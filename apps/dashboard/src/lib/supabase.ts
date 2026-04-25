import { createClient } from "@supabase/supabase-js";
import type { Database } from "@advance-seeds/types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    "[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing — check apps/dashboard/.env.local",
  );
}

export const supabase = createClient<Database>(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "as.dashboard.auth",
  },
});
