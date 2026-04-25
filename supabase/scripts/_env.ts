// Resolves the Supabase URL + service-role key for seed scripts.
// Local-first: if `supabase status --output env` runs cleanly, use those values.
// Otherwise fall back to env vars (for CI / direct cloud seeding).

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

const supabaseDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fromCli(): SupabaseEnv | null {
  try {
    const out = execFileSync("supabase", ["status", "--output", "env"], {
      encoding: "utf8",
      cwd: supabaseDir,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const map: Record<string, string> = {};
    for (const line of out.split("\n")) {
      const m = line.match(/^([A-Z_]+)="(.*)"$/);
      if (m) map[m[1]!] = m[2]!;
    }
    if (map.API_URL && map.ANON_KEY && map.SERVICE_ROLE_KEY) {
      return {
        url: map.API_URL,
        anonKey: map.ANON_KEY,
        serviceRoleKey: map.SERVICE_ROLE_KEY,
      };
    }
  } catch {
    // local stack not running
  }
  return null;
}

function fromEnv(): SupabaseEnv | null {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && anon && srv) return { url, anonKey: anon, serviceRoleKey: srv };
  return null;
}

export function loadEnv(): SupabaseEnv {
  const env = fromCli() ?? fromEnv();
  if (!env) {
    throw new Error(
      "Supabase env not found. Either run `pnpm -F @advance-seeds/supabase start` " +
        "(local stack) or export SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return env;
}
