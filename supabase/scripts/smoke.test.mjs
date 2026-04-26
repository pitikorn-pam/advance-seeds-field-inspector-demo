// RLS smoke test — proves the policies work end-to-end against the live
// (or local) Supabase project. Sign in as Jane, attempt to read/write Alex's
// data, expect access denials. Sign in as Alex, attempt to delete Jane's
// inspection, expect denial. Read all expected rows.
//
// Run:  pnpm -F @advance-seeds/supabase smoke
// Pre:  pnpm -F @advance-seeds/supabase seed-all

import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const DEMO_PASSWORD = "DemoSeeds2026!";
const JANE = "jane@advanceseeds.com";
const ALEX = "alex@advanceseeds.com";

const supabaseDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  // Explicit env vars first — lets us point the smoke test at cloud
  // even when local Docker is up. Local CLI is the fallback.
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    return { url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY };
  }
  try {
    const out = execFileSync("supabase", ["status", "--output", "env"], {
      encoding: "utf8",
      cwd: supabaseDir,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const map = {};
    for (const line of out.split("\n")) {
      const m = line.match(/^([A-Z_]+)="(.*)"$/);
      if (m) map[m[1]] = m[2];
    }
    if (map.API_URL && map.ANON_KEY) return { url: map.API_URL, anonKey: map.ANON_KEY };
  } catch {
    /* fall through */
  }
  throw new Error("Cannot resolve Supabase env. Start the local stack or export env vars.");
}

const env = loadEnv();
const newClient = () => createClient(env.url, env.anonKey, { auth: { persistSession: false } });

async function signIn(email) {
  const sb = newClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  assert.equal(error, null, `signIn ${email}: ${error?.message}`);
  return { sb, userId: data.user.id };
}

test("inspector reads only own inspections", async () => {
  const { sb, userId } = await signIn(JANE);
  const { data, error } = await sb.from("inspections").select("inspector_id");
  assert.equal(error, null);
  assert.ok(data.length > 0, "Jane should have at least one inspection");
  for (const row of data) {
    assert.equal(row.inspector_id, userId, "RLS leak: Jane saw a non-own row");
  }
});

test("admin reads all inspections (Jane's + Alex's)", async () => {
  const { sb } = await signIn(ALEX);
  const { data, error } = await sb.from("inspections").select("inspector_id");
  assert.equal(error, null);
  const owners = new Set(data.map((r) => r.inspector_id));
  assert.ok(owners.size >= 2, `admin should see ≥2 distinct owners, saw ${owners.size}`);
});

test("inspector cannot insert variety (admin-only write)", async () => {
  const { sb } = await signIn(JANE);
  const { error } = await sb.from("varieties").insert({
    name: "RLS-test-variety-should-fail",
  });
  assert.notEqual(error, null, "expected RLS to block inspector insert into varieties");
});

test("admin can insert and then clean up a variety", async () => {
  const { sb } = await signIn(ALEX);
  const tag = `RLS-smoke-${Date.now()}`;
  const { data, error } = await sb
    .from("varieties")
    .insert({ name: tag, color_key: "rice" })
    .select("id")
    .single();
  assert.equal(error, null, `admin insert variety: ${error?.message}`);
  const { error: delErr } = await sb.from("varieties").delete().eq("id", data.id);
  assert.equal(delErr, null);
});

test("admin cannot delete an inspector's inspection", async () => {
  const jane = await signIn(JANE);
  const { data: janeRows } = await jane.sb.from("inspections").select("id").limit(1);
  assert.ok(janeRows.length > 0);
  const targetId = janeRows[0].id;

  const { sb: adminSb } = await signIn(ALEX);
  const { error } = await adminSb.from("inspections").delete().eq("id", targetId);
  // Supabase silently returns success but RLS prevents the row from being affected.
  // Verify the row still exists.
  const { data: after, error: readErr } = await adminSb
    .from("inspections")
    .select("id")
    .eq("id", targetId)
    .single();
  assert.equal(readErr, null);
  assert.equal(after.id, targetId, "admin delete should not have removed Jane's inspection");
  if (error) {
    /* explicit denial is also acceptable; what matters is the row survives */
  }
});
