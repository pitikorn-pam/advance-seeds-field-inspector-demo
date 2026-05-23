# Codex Agent Instructions Design

## Goal

Create Codex-native `AGENTS.md` instructions for the Advance Seeds workspace so
future Codex sessions can route work from `Seed/` and operate correctly when
opened directly inside either active repository.

## Context

The workspace has three current Claude instruction sources:

- `/Users/pitikorn/Work/Seed/CLAUDE.md` for multi-repo routing and shared
  contracts.
- `advance-seeds-field-inspector-demo/CLAUDE.md` for the Expo mobile demo app
  and its Supabase backend.
- `advance-seeds-field-inspector-ml/CLAUDE.md` for model training, export,
  registry, and registry dashboard work.

The demo and ML repositories are independent git repositories with independent
OpenSpec trees. The workspace root should become the orchestration entrypoint
for cross-repo work, while each repo needs enough local Codex context to remain
safe when opened by itself.

## Approaches Considered

### 1. Mirror Claude instructions into AGENTS files

Copy the existing `CLAUDE.md` guidance into equivalent `AGENTS.md` files at all
three levels. This gives broad coverage quickly, but it duplicates long
handoffs and creates drift risk between Claude and Codex instruction files.

### 2. Write Codex-native operational summaries

Create concise `AGENTS.md` files that preserve the operational rules Codex needs
while leaving long-form onboarding detail in the existing `CLAUDE.md` files.
This keeps instruction hierarchy clear and makes the workspace-root file useful
as an orchestrator instead of another full handoff copy.

### 3. Add only a workspace orchestrator

Create `Seed/AGENTS.md` and rely on repo-local `CLAUDE.md` files below it. This
is smaller, but Codex sessions opened directly inside the demo or ML repository
would miss repo-local instructions.

## Chosen Design

Use approach 2.

### Workspace Orchestrator

Create `/Users/pitikorn/Work/Seed/AGENTS.md` as the multi-repo entrypoint. It
will:

- identify the active sibling repositories and route tasks by ownership;
- direct agents into each repo's local `AGENTS.md` before making changes;
- state cross-repo rules for OpenSpec, shared Supabase resources, secrets, and
  the frozen mobile model artifact contract;
- make the expected order explicit for work that changes both ML exports and
  app consumers.

### Demo Repository Instructions

Create `advance-seeds-field-inspector-demo/AGENTS.md` for repo-local Codex work.
It will summarize:

- the Expo/React Native demo app and Supabase backend boundaries;
- the high-value code layout and command surface;
- app invariants such as the `SeedAnalyzer` seam, centralized query layer,
  design-token discipline, i18n parity, and custom dev-client requirement;
- migration, generated-type, RLS smoke-test, and OpenSpec expectations.

### ML Repository Instructions

Create `advance-seeds-field-inspector-ml/AGENTS.md` for repo-local Codex work.
It will summarize:

- training, export, registry, hosted worker, and dashboard ownership;
- the model export contract and artifact handoff to the demo repo;
- Python unittest defaults, optional heavy training dependencies, registry
  backend boundaries, and artifact/secrets restrictions;
- OpenSpec and cross-repo coordination expectations.

## File Boundaries

The change will create exactly these operational instruction files:

- `/Users/pitikorn/Work/Seed/AGENTS.md`
- `/Users/pitikorn/Work/Seed/advance-seeds-field-inspector-demo/AGENTS.md`
- `/Users/pitikorn/Work/Seed/advance-seeds-field-inspector-ml/AGENTS.md`

Existing `CLAUDE.md` files remain long-form context and will not be rewritten as
part of this change.

## Verification

Verification will focus on instruction quality rather than runtime behavior:

1. Review each new `AGENTS.md` against its paired `CLAUDE.md`.
2. Check that repo-local instructions do not contradict workspace-level routing.
3. Confirm path names, commands, and critical cross-repo contracts match the
   current project files.
4. Inspect git status in the demo and ML repos so unrelated existing work is not
   staged or overwritten.
