// Creates Jane (inspector) and Alex (admin) via Supabase Auth Admin API.
// Idempotent: running twice updates the password / metadata in place.

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_env.js";

const DEMO_PASSWORD = "DemoSeeds2026!";

interface DemoUser {
  email: string;
  full_name: string;
  role: "inspector" | "admin";
  locale: "en" | "th";
}

const users: DemoUser[] = [
  { email: "jane@advanceseeds.com", full_name: "Jane Saetang", role: "inspector", locale: "en" },
  { email: "alex@advanceseeds.com", full_name: "Alex Pongsri", role: "admin", locale: "th" },
];

async function main() {
  const env = loadEnv();
  const admin = createClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const u of users) {
    const { data: existing } = await admin.auth.admin.listUsers();
    const found = existing?.users.find((x) => x.email === u.email);

    if (found) {
      const { error } = await admin.auth.admin.updateUserById(found.id, {
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.full_name, role: u.role, locale: u.locale },
      });
      if (error) throw error;
      // Force-update profile because trigger only fires on insert.
      const { error: pErr } = await admin
        .from("profiles")
        .update({ full_name: u.full_name, role: u.role, locale: u.locale })
        .eq("id", found.id);
      if (pErr) throw pErr;
      console.info(`[users] updated ${u.email} (${u.role})`);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.full_name, role: u.role, locale: u.locale },
      });
      if (error || !data.user) throw error ?? new Error("createUser returned no user");
      console.info(`[users] created ${u.email} (${u.role})`);
    }
  }

  console.info(`[users] demo password: ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
