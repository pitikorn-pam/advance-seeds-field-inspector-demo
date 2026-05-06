import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Database } from "@advance-seeds/types";

// Belt-and-suspenders: even with autoRefreshToken disabled below, the SDK
// can still raise "Invalid Refresh Token: Refresh Token Not Found" via
// console.error from internal recovery paths during a manual refresh on a
// dead token. The error is informational — the app already routes the
// user to login when the recovery fails. Filter only this exact message.
const REFRESH_TOKEN_NOISE = /Invalid Refresh Token: Refresh Token Not Found/;
const matchesNoise = (v: unknown) =>
  v instanceof Error
    ? REFRESH_TOKEN_NOISE.test(v.message)
    : typeof v === "string"
      ? REFRESH_TOKEN_NOISE.test(v)
      : false;
const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (args.some(matchesNoise)) return;
  originalConsoleError(...args);
};
type RejectionEvent = { reason?: unknown; preventDefault?: () => void };
(
  globalThis as { addEventListener?: (e: string, h: (ev: RejectionEvent) => void) => void }
).addEventListener?.("unhandledrejection", (event) => {
  if (matchesNoise(event.reason)) event.preventDefault?.();
});

// Expo CLI inlines any env var prefixed with EXPO_PUBLIC_ at build time:
// `process.env.EXPO_PUBLIC_X` is replaced with the literal string before
// the bundler runs. Reading from `process.env` here is safe in RN because
// the values are baked into the bundle.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing — " +
      "check apps/mobile/.env and restart `expo start --clear`",
  );
}

export const supabase = createClient<Database>(
  url ?? "https://placeholder.supabase.co",
  anonKey ?? "placeholder-anon-key",
  {
    auth: {
      storage: AsyncStorage,
      // Disable the background auto-refresh tick. On boot with a stale
      // persisted refresh token (logged out elsewhere, JWT secret rotated,
      // expired refresh window) the SDK's tick raises an unhandled
      // AuthApiError("Refresh Token Not Found") that surfaces in LogBox
      // before our auth-state listener can react. With autoRefreshToken
      // off, the error never fires; we drive refresh manually from
      // AuthProvider once the session has been validated, gated on
      // AppState so we only refresh while the app is foregrounded.
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
