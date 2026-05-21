# Codex Agent Instructions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Thai Codex `AGENTS.md` instructions at the Advance Seeds workspace root and in the demo and ML repositories.

**Architecture:** The workspace-root file is an orchestrator that routes cross-repo work. Each repo-local file is a concise Codex operational summary derived from the current Claude onboarding docs, so a session opened directly in that repo still receives its local constraints.

**Tech Stack:** Markdown instruction files, multi-repo Advance Seeds workspace, OpenSpec workflow.

---

## File Structure

- Create `/Users/pitikorn/Work/Seed/AGENTS.md` as the workspace orchestrator.
- Create `/Users/pitikorn/Work/Seed/advance-seeds-field-inspector-demo/AGENTS.md` as the demo app Codex instruction file.
- Create `/Users/pitikorn/Work/Seed/advance-seeds-field-inspector-ml/AGENTS.md` as the ML repo Codex instruction file.

### Task 1: Workspace Routing Instructions

**Files:**

- Create: `/Users/pitikorn/Work/Seed/AGENTS.md`

- [ ] **Step 1: Write the workspace orchestrator**

Create Thai Markdown that:

- declares `Seed/` a multi-repo workspace rather than one git repository;
- routes app, camera, calibration UI, mobile Supabase, i18n, and design-token tasks to `advance-seeds-field-inspector-demo/`;
- routes training, dataset, model export, registry, registry dashboard, and Modal worker tasks to `advance-seeds-field-inspector-ml/`;
- tells agents to read the target repo's local `AGENTS.md` before editing;
- records shared OpenSpec, Supabase, secrets, and frozen artifact-contract rules.

- [ ] **Step 2: Verify the routing summary**

Run:

```bash
rtk sed -n '1,260p' /Users/pitikorn/Work/Seed/AGENTS.md
```

Expected: Thai operational instructions with literal repo names and cross-repo contract details.

### Task 2: Demo Repository Instructions

**Files:**

- Create: `/Users/pitikorn/Work/Seed/advance-seeds-field-inspector-demo/AGENTS.md`

- [ ] **Step 1: Write demo repo instructions**

Create Thai Markdown that:

- summarizes the Expo mobile demo, shared packages, Supabase backend, and OpenSpec tree;
- highlights `apps/mobile/lib/queries.ts`, the `SeedAnalyzer` seam, design tokens, i18n parity, custom dev-client requirements, and generated Supabase types;
- includes root and mobile command surfaces already documented in the repo;
- states when to run RLS smoke checks and when to use OpenSpec.

- [ ] **Step 2: Verify the demo summary**

Run:

```bash
rtk sed -n '1,320p' AGENTS.md
```

Expected: Thai repo-local instructions that match the current demo repo layout and commands.

### Task 3: ML Repository Instructions

**Files:**

- Create: `/Users/pitikorn/Work/Seed/advance-seeds-field-inspector-ml/AGENTS.md`

- [ ] **Step 1: Write ML repo instructions**

Create Thai Markdown that:

- summarizes Python training, export scripts, Supabase registry, R2 artifacts, Modal worker, and `apps/web/`;
- records the frozen `configs/model_export_contract.json` contract and handoff path into the demo repo;
- preserves unittest defaults, optional heavy training dependencies, no-secrets/no-large-artifacts rules, and OpenSpec expectations;
- identifies cross-repo work that must be coordinated with the demo app.

- [ ] **Step 2: Verify the ML summary**

Run:

```bash
rtk sed -n '1,360p' /Users/pitikorn/Work/Seed/advance-seeds-field-inspector-ml/AGENTS.md
```

Expected: Thai repo-local instructions with literal contract paths and validation commands.

### Task 4: Cross-File Review

**Files:**

- Review: `/Users/pitikorn/Work/Seed/AGENTS.md`
- Review: `/Users/pitikorn/Work/Seed/advance-seeds-field-inspector-demo/AGENTS.md`
- Review: `/Users/pitikorn/Work/Seed/advance-seeds-field-inspector-ml/AGENTS.md`

- [ ] **Step 1: Check critical terms across the new files**

Run:

```bash
rtk rg -n "OpenSpec|Supabase|yolo11n-seeds.tflite|SeedAnalyzer|AGENTS.md|queries.ts|model_export_contract" /Users/pitikorn/Work/Seed/AGENTS.md /Users/pitikorn/Work/Seed/advance-seeds-field-inspector-demo/AGENTS.md /Users/pitikorn/Work/Seed/advance-seeds-field-inspector-ml/AGENTS.md
```

Expected: the orchestrator and repo-local files expose the critical workflow and contract terms at the right level.

- [ ] **Step 2: Inspect git state per repository**

Run:

```bash
rtk git status --short
rtk git -C /Users/pitikorn/Work/Seed/advance-seeds-field-inspector-ml status --short
```

Expected: the demo and ML repositories show only intended new instruction files plus pre-existing untracked `CLAUDE.md` files.
