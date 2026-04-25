import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import type { Database } from "@advance-seeds/types";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;
const url = process.env.SUPABASE_URL ?? extra.supabaseUrl ?? "";
const anonKey = process.env.SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? "";

if (!url || !anonKey) {
  console.warn("[supabase] SUPABASE_URL or SUPABASE_ANON_KEY missing — check apps/mobile/.env");
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
