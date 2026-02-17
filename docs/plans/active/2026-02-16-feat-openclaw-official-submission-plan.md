---
slug: 2026-02-16-feat-openclaw-official-submission
status: active
phase: plan
plan_mode: execution
detail_level: more
priority: high
owner: sidmohan
---

# Prepare FogClaw for Official OpenClaw Plugin Submission

This plan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, `Outcomes & Retrospective`, and `Revision Notes` current as work proceeds.

This plan is maintained to the contract in `docs/PLANS.md`.

## Purpose / Big Picture

The objective is to make this repository ready for official OpenClaw submission from the `@openclaw/fogclaw` package line without changing any existing detection behavior.

A reviewer should be able to take a clean checkout of this branch, run the documented evidence commands, and verify three behaviors without guessing: plugin metadata is loadable, guardrail context is applied through the `before_agent_start` flow, and the two tools (`fogclaw_scan`, `fogclaw_redact`) return deterministic, observable outputs.

## Progress

- [x] (2026-02-16T17:40:10Z) P1 [Setup] Read `docs/specs/2026-02-16-feat-openclaw-official-submission-spec.md` and captured all requirements.
- [x] (2026-02-16T17:40:25Z) P2 [Setup] Read `docs/PLANS.md`, `docs/DOMAIN_DOCS.md`, and `he-plan` instructions.
- [x] (2026-02-16T17:41:05Z) P3 [Baseline] Ran `npm test` and confirmed current tests are green.
- [x] (2026-02-16T17:41:10Z) P4 [Baseline] Ran `npm run build` and confirmed TypeScript emits cleanly.
- [x] (2026-02-16T17:50:00Z) P5 [Scope Alignment] Locked focus to the `@openclaw/fogclaw` branch/package for this iteration and documented `@datafog/fogclaw` as out-of-scope unless requested.
- [ ] (2026-02-16T17:50:30Z) P6 [M1] Validate and, if needed, normalize package/manifest alignment for official submission expectations.
- [ ] (2026-02-16T17:51:00Z) P7 [M2] Add deterministic plugin verification commands and reviewer evidence outputs.
- [ ] (2026-02-16T17:51:30Z) P8 [M3] Prepare PR-facing submission evidence docs (what reviewers should run and expected pass markers).
- [x] (2026-02-16T17:53:20Z) P9 [M4] Identify and populate needed domain-doc updates, then finalize handoff sections for transition.

## Surprises & Discoveries

- Observation: This branch is currently configured with `name: "@openclaw/fogclaw"` in `package.json`, while `package-lock.json` and README installation examples still reference `@datafog/fogclaw`.
  Evidence: `package.json` root `name` entry is `@openclaw/fogclaw`; `package-lock.json` root package and `README.md` still mention `@datafog/fogclaw`.

- Observation: Plugin bootstrap behavior in `src/index.ts` already uses an OpenClaw-compatible default export object with `register(api)` and calls to `api.on("before_agent_start", ...)` plus `api.registerTool(...)`.
  Evidence: `src/index.ts` defines `const fogclaw = { id: "fogclaw", name: "FogClaw", register(api) { ... } }` and `export default fogclaw`.

- Observation: There is no existing automated smoke test that simulates OpenClaw API registration from a clean environment, so submission reviewers must currently infer behavior from code and unit tests.
  Evidence: tests currently cover scanner/regex/redactor/config paths, but no OpenClaw plugin API shim test exists.

## Decision Log

- Decision: For this session, treat `@openclaw/fogclaw` as the active publication target.
  Rationale: You explicitly scoped the work to the latter branch/package and that aligns with official OpenClaw listing expectations.
  Date/Author: 2026-02-16T17:50:00Z / sidmohan

- Decision: Keep implementation behavior unchanged and do not alter regex/GLiNER detection semantics.
  Rationale: The objective is submission readiness, and current detection logic is already functionally complete and tested.
  Date/Author: 2026-02-16T17:50:05Z / sidmohan

- Decision: Do not complete PR transition until domain-doc updates are finished at end of planning.
  Rationale: `docs/PLANS.md` requires domain-doc population for handoff and this work introduces publication and trust constraints that should be documented.
  Date/Author: 2026-02-16T17:50:10Z / sidmohan

## Outcomes & Retrospective

- Current baseline is stable: green tests and clean build provide a low-risk starting point.
- The plan confirms there are no unresolved core engine failures blocking submission readiness.
- The remaining risks are purely packaging, verification, and evidence quality for maintainers, especially naming consistency (`@openclaw` vs `@datafog`) and reproducibility of plugin registration.

## Context and Orientation

This repository’s source tree is small and focused: `src/` contains runtime plugin code, `tests/` contains unit coverage, and `docs/` contains planning and runbook artifacts.

Key files a novice needs to know right away:

- `src/index.ts` — plugin entrypoint. It registers hook and tools.
- `src/scanner.ts` — orchestrates regex + GLiNER detection.
- `src/redactor.ts` — implements token/mask/hash replacement.
- `src/config.ts` — validates and defaults configuration.
- `openclaw.plugin.json` — plugin manifest.
- `package.json` — package metadata, dependencies, and `openclaw.extensions` pointer to `./dist/index.js`.
- `README.md` — install and usage guidance.

Repository naming context:
- Branch `openclaw-plugin-submission` is where this `@openclaw` effort is taking place.
- `main` in this repo currently points to a shorter baseline state where package naming and docs are not the focus of this iteration.

## Milestones

### Milestone 1 - Submission Contract Alignment

By the end of this milestone, all metadata and publishing-facing naming for the `@openclaw/fogclaw` line should be internally consistent so maintainers do not have to infer intent. Expected changes are focused on docs and lockfile/package identity, not scanning logic. Verification should show a single package identity in plugin-facing docs and manifest assumptions.

### Milestone 2 - Deterministic Smoke Proof Path

By the end of this milestone, there is a reproducible command sequence for a reviewer to confirm plugin wiring without external services. This includes a way to execute plugin registration through a minimal mock OpenClaw API call path and assert both tool outputs and hook prepended context behavior.

### Milestone 3 - PR Evidence and Submission Handback

By the end of this milestone, the PR should include concise evidence artifacts and required docs that demonstrate command outputs, plus updates to domain docs if needed to capture any newly formalized operational constraints (security/reliability expectations around redaction and optional GLiNER fallback).

## Plan of Work

Start by making all plan deliverables explicit and low-risk.

For Milestone 1, the work is to normalize package-facing identity around `@openclaw/fogclaw` for this branch and verify `openclaw.plugin.json` and exported plugin contract are already coherent. If any mismatch remains, only update naming and references; do not alter detection algorithms.

For Milestone 2, define and document a deterministic test strategy for the plugin contract in tests (or a script plus test fixture), so reviewer behavior can be validated without downloading models. This strategy should reuse mocked GLiNER behavior already present in tests and should validate all three behaviors: hook registration shape, scan tool output shape, and redact tool output shape.

For Milestone 3, add a short evidence section in docs (README or dedicated file under docs) that lists the exact commands and expected outputs. Then update `docs/SECURITY.md` or `docs/RELIABILITY.md` only if this initiative established a new operating rule not already documented in those files.

Throughout, keep `docs/PLANS.md` requirements in mind:

- all milestones must be independently verifiable;
- each `Progress` item must stay timestamped and stable;
- include evidence snippets in `Artifacts and Notes`.

## Concrete Steps

From repo root:

    npm test

Expected:

    ✓ tests/... (all passing)

From repo root:

    npm run build

Expected:

    Dist artifacts in `dist/` and no TypeScript errors.

From repo root:

    cat package.json | rg '"name":'
    cat package-lock.json | rg '"name":'

Expected:

    Both should clearly reflect `@openclaw/fogclaw` for this branch.

From repo root:

    rg -n 'openclaw plugins install|fogclaw\.plugin\.json|export default fogclaw|register\(api\)' README.md src/openclaw.plugin.json src/index.ts docs

Expected:

    No conflicting publish/package identity references across the main files.

From repo root:

    npm pkg get openclaw

Expected:

    { "extensions": ["./dist/index.js"] }

From repo root:

    npm run build
    node -e "const plugin = (await import('./dist/index.js')).default; console.log(typeof plugin?.register === 'function', plugin?.id, plugin?.name)"

Expected:

    true fogclaw FogClaw

From repo root (to be executed after adding a lightweight plugin-contract smoke test):

    npm test -- tests/openclaw-plugin-smoke.test.ts

Expected:

    test suite passes and validates hook + tool contract behavior using mocked OpenClaw API.

## Validation and Acceptance

Acceptance is behavior-based:

- Build command is green and produces the expected output artifact entry points.
- Package/manifest consistency for the `@openclaw/fogclaw` track is explicit and verified.
- Plugin registration path is testable from a clean Node import and outputs known values in mocked OpenClaw context.
- `fogclaw_scan` and `fogclaw_redact` produce deterministic outputs in tests, including redaction replacement in at least one scenario.
- Open questions remain none for release-critical mismatches on this branch.

Acceptance checkpoints:

- Run `npm test` and ensure no regressions.
- Run `npm run build` and ensure no compile failure.
- Run the smoke evidence sequence and attach command output in PR body.
- Validate PR text includes explicit mention of `@openclaw/fogclaw` as scope.

## Idempotence and Recovery

Most edits are idempotent string replacements and test/doc additions, so repeating them should not alter behavior.

If plugin-smoke test creation fails, run only that file and inspect fixture expectations first. If failures persist, remove the failing expectation and realign to the actual `OpenClaw` API contract surfaced by `src/index.ts` before re-running.

If package-lock mismatch appears after `npm install`, prefer rerunning `npm install` and reviewing resulting root metadata changes before applying manual edits.

If there is uncertainty during transition, preserve this plan and branch as the single source of truth and pause in this repo before PR handoff.

## Artifacts and Notes

Repository baseline evidence:

    npm test
    npm run build

Expected output summary:

    All tests pass and tsc compile succeeds.

Planned evidence artifacts:

- A new section in README or docs describing exact reviewer commands for plugin smoke verification.
- Test output from plugin contract smoke run.
- Evidence that package identity lines in `package.json`, `package-lock.json`, and install instructions are aligned for this branch.

## Interfaces and Dependencies

Repository interfaces used by this initiative:

- OpenClaw plugin export contract: default export with `{ id, name, register(api) }`.
- `api.on("before_agent_start", handler)` for guardrail hook flow.
- `api.registerTool({...})` for `fogclaw_scan` and `fogclaw_redact`.
- `DEFAULT_CONFIG` and `loadConfig` from `src/config.js` for runtime defaults and validation.
- `Scanner` + `redact` functions in `src/scanner.ts` and `src/redactor.ts` for deterministic entity handling.

Third-party dependencies relevant to this plan:

- `gliner` and `onnxruntime-node` remain production dependencies.
- `vitest` is used for deterministic testing.
- `typescript` ensures build and typing.

## Pull Request

- pr: (populate in transition)
- branch:
- commit:
- ci:

## Review Findings

- pending (to be filled by `he-review`)

## Verify/Release Decision

- decision: pending
- date:
- open findings by priority (if any):
- evidence:
- rollback:
- post-release checks:
- owner:

## Revision Notes

- 2026-02-16T17:50:00Z: Aligned planning scope to `@openclaw/fogclaw` explicitly based on user instruction; marked `@datafog/fogclaw` references as historical/out-of-scope for this iteration.
- 2026-02-16T17:50:15Z: Replaced incomplete/partial plan draft with a complete PLANS.md-compliant structure, including all required sections and milestone sequence.
- 2026-02-16T17:53:20Z: Completed end-of-`he-plan` domain-doc population (`docs/SECURITY.md`, `docs/RELIABILITY.md`) with repository-specific submission-safety rules and recovery/rollback guidance.
