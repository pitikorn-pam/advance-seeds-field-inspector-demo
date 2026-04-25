# Supabase backend

Schema, RLS, and seed data for the Advance Seeds Field Inspector demo.

## Local development (recommended)

Requires Docker Desktop running. Ports are mapped to **64320–64329** to avoid clashing with other local Supabase projects on the default `5432X` range.

```bash
# Start the local stack (Postgres + Auth + Studio + Storage + …)
pnpm -F @advance-seeds/supabase start

# Apply migrations + seed.sql (this happens automatically on `start`,
# or after editing migrations call:)
pnpm -F @advance-seeds/supabase reset

# Seed users (Jane + Alex) and 7 demo inspections
pnpm -F @advance-seeds/supabase seed-all

# Generate TS types from the live local schema → packages/types/src/supabase.gen.ts
pnpm supabase:types

# Run the RLS smoke test (signs in as both users, verifies policies)
pnpm -F @advance-seeds/supabase smoke

# Stop the stack when done
pnpm -F @advance-seeds/supabase stop
```

Local Studio: <http://127.0.0.1:64323>

## Pushing to your hosted Supabase project

Once everything passes locally, link and push to `gqsxiohxokgwwugeoxmy`:

```bash
# One-time link (will prompt for the project's DB password)
cd supabase && supabase link --project-ref gqsxiohxokgwwugeoxmy

# Push migrations
supabase db push

# Apply seed.sql (manually via dashboard SQL editor, or:)
psql "$SUPABASE_DB_URL" -f seed.sql

# Seed users + inspections against cloud
SUPABASE_URL=https://gqsxiohxokgwwugeoxmy.supabase.co \
SUPABASE_ANON_KEY=… \
SUPABASE_SERVICE_ROLE_KEY=… \
pnpm -F @advance-seeds/supabase seed-all
```

> **Important.** The `SUPABASE_SERVICE_ROLE_KEY` is privileged and must NEVER be committed or shipped in client bundles. Store it in your shell profile or a CI secret.

## Demo accounts

| Email                   | Password         | Role      |
| ----------------------- | ---------------- | --------- |
| `jane@advanceseeds.com` | `DemoSeeds2026!` | inspector |
| `alex@advanceseeds.com` | `DemoSeeds2026!` | admin     |

## Layout

```
supabase/
├── config.toml                      ← ports, services, defaults
├── migrations/
│   ├── 20260425000001_init_schema.sql
│   ├── 20260425000002_rls_policies.sql
│   └── 20260425000003_storage.sql
├── seed.sql                         ← varieties + batches + calibration profiles
└── scripts/
    ├── _env.ts                      ← env resolver (local CLI → env vars)
    ├── grade-seed.ts                ← grading thresholds (variety baselines)
    ├── seed-users.ts                ← Jane + Alex via Auth Admin API
    ├── seed-inspections.ts          ← 7 inspections + 100+ child seeds
    ├── seed-all.ts                  ← runs both seeders in order
    └── smoke.test.mjs               ← RLS end-to-end checks
```

## Schema at a glance

```
profiles ─┬── inspections ── seeds
          │      │   │
varieties ┘      │   │
batches ─────────┘   │
calibration_profiles ┘
```

- `profiles` — 1:1 with `auth.users`; role is `inspector` or `admin`.
- `varieties`, `batches`, `calibration_profiles` — reference data, admin-write.
- `inspections` — owned by an inspector; admin reads all.
- `seeds` — child rows of `inspections`; visibility follows parent.

See [`migrations/20260425000002_rls_policies.sql`](migrations/20260425000002_rls_policies.sql) for the exact RLS contract.
