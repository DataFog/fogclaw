---
slug: 2026-02-16-feat-openclaw-official-submission
status: intake-complete
date: 2026-02-16T17:35:00Z
owner: sidmohan
plan_mode: execution
spike_recommended: no
priority: high
---

# Prepare FogClaw for Official OpenClaw Plugin Submission

## Purpose / Big Picture
FogClaw already has a working PII/custom-entity redaction core; this initiative is to move it from "feature-complete" to "submission-ready" as an official OpenClaw plugin so maintainers can review and install it directly from the plugin ecosystem with reliable tests and repeatable packaging checks.

## Scope

### In Scope
- Confirm and, if needed, adjust repository structure and metadata to match OpenClaw plugin submission expectations for official listing.
- Add/standardize verification steps that prove plugin loadability, tool registration, and guardrail hook wiring from a clean checkout.
- Add PR-facing execution evidence (commands + expected outputs) for submission readiness.
- Stabilize test/packaging behavior for CI and maintainers (e.g., deterministic output, clear failure diagnostics) without changing detection algorithms.
- Validate local install path, built artifact correctness, and versioning assumptions used by OpenClaw.

### Boundaries
- No changes to regex or GLiNER detection logic (entity patterns, model behavior, labels, or thresholds).
- No new engine integrations, retraining, or additional model support.
- No changes to core OpenClaw platform behavior outside plugin surface.
- No new product features beyond what the plugin already exposes (`before_agent_start`, `fogclaw_scan`, `fogclaw_redact`).

## Non-Goals
- Building an alternate PII engine.
- Adding user-facing dashboards or external service integrations.
- Performing a full security audit or formal compliance certification.

## Risks
- OpenClaw official plugin submission may have stricter manifest/metadata constraints than what is currently in the repo.
- CI environments used by maintainers may differ from local Node versions and fail model-download or ONNX runtime behaviors unless mocked/guarded appropriately.
- Test expectations can become unstable if packaging assumes environment-specific paths.

## Rollout
- Validate locally, then verify against the same commands that CI or reviewers will run.
- Prepare a PR checklist in the issue/PR description with explicit pass/fail commands and artifact outputs.
- Submit/refresh PR only after all acceptance criteria in this spec are met and documented in the review thread.

## Validation and Acceptance Signals
- `npm test` passes 100% with no skipped suites.
- `npm run build` completes without TypeScript errors and emits the expected `dist/` entry points.
- Plugin manifest is loadable by OpenClaw with `dist/index.js` as the entry point and valid `openclaw.plugin.json` schema.
- A reviewer can run a minimal smoke test to confirm: guardrail hook executes, `fogclaw_scan` returns entities, and `fogclaw_redact` redacts at least one sample value.
- PR includes a reproducible command log proving plugin installation and invocation in a clean environment.

## Requirements

| ID | Priority | Requirement |
|---|---|---|
| R1 | critical | Confirm plugin metadata and layout match official OpenClaw plugin expectations, including `openclaw.plugin.json` manifest and plugin export surface from `dist/index.js`.
| R2 | high | Establish submission-ready verification commands for loadability, guardrail operation, and tool invocation so a reviewer can validate behavior end-to-end.
| R3 | high | Ensure tests and build are deterministic in CI-like environments, including clear diagnostics when optional GLiNER/ONNX initialization degrades.
| R4 | medium | Document PR submission checklist and expected outputs (exact commands, pass criteria, and known fallbacks) in repository docs.
| R5 | medium | Capture release-readiness constraints and owner decisions that affect publication (version, package name, maintainer expectations) as explicit open questions or constraints.

## Chosen Direction (Recommended)
- Proceed with a submission-readiness initiative (rather than adding any new detection features); focus on packaging, validation, and PR evidence as the primary v1 deliverable. This reduces review risk and directly addresses maintainer blockers for the current PR.

## Alternatives Considered
- **Address detection logic first** — Rejected because the current engine work appears functionally complete and would delay PR readiness without improving submission eligibility.
- **Open a broad refactor pass first** — Rejected because this would reduce review clarity and increase the risk of introducing regressions during an already time-sensitive submission.

## Key Decisions
- Decision: Treat plugin submission hardening as a single, measurable pre-release initiative and keep engine behavior unchanged.
  Rationale: Maintainers can review functional and packaging concerns independently; this minimizes risk of review churn and keeps the current plugin semantics stable.

## Open Questions
- **[decision]** Which exact OpenClaw ecosystem target (registry path and expected metadata contract) should be used for the first-party listing?
- **[research]** Is a dedicated CI workflow/pipeline required by OpenClaw reviewers beyond existing project checks, and if so what exact command matrix is expected?
- **[planning]** Should we include a semantic release/version-bump policy in this same initiative or defer to a follow-up plan after initial acceptance?

## Success Criteria
- All current unit tests remain green (`98` tests passing as baseline).
- A local review command can verify plugin registration and tool availability in one run with no manual code edits.
- PR description includes reproducible evidence covering: bootstrap state, tests, build, plugin smoke test, and any known degradations.
- No functional changes to existing scanning/redaction APIs (signatures and outputs remain as currently implemented).

## Constraints
- Maintain Node.js `>=22.0.0` compatibility and existing TypeScript module format (`type: module`).
- Keep GLiNER optional and fallback-safe so environments without model assets still pass plugin-level tests via regex-only flow.
- Preserve current public interfaces in `src/index.ts`, `Scanner`, and redaction utilities.
- Keep the initiative PR-sized and review-friendly: no broad architectural refactor unless required by submission gates.

## Tech Preferences
- **Language/runtime**: TypeScript / Node.js 22+.
- **Framework**: OpenClaw plugin API and existing test stack (`vitest`).
- **Infrastructure**: NPM scripts and repository-level CI checks only (no external services required for baseline validation).
- **Rationale**: Minimizes external dependencies and makes the PR reproducible by maintainers.

## Reference Artifacts
- None provided by user in this session.

## Priority
- priority: high
- rationale: This is a prerequisite for official listing, and unresolved submission-readiness blockers prevent release despite working core features.

## Initial Milestone Candidates
- M1: Submission Readiness Baseline — verify manifest, entrypoint, and smoke tests are documented and passing on clean checkout.
- M2: PR Evidence Pack — add concise contributor-facing evidence and rollout instructions for PR reviewers.
- M3: Final Review Gate — cross-check remaining open questions and obtain sign-off to move into `he-plan` and PR merge flow.

## Handoff
- Owner hands this artifact to `he-plan` for executable planning.
- `he-plan` should first resolve open questions that block official submission criteria, then sequence changes in small PR-safe milestones.
- After planning, transition target is `he-implement` unless `[research]` or `[spike]` questions remain, in which case route first to `he-research`/`he-spike`.

## Revision Notes
- 2026-02-16T17:35:00Z: Initialized spec from existing implementation state and known PR intent. Reason: move from feature-complete code to official OpenClaw submission readiness.
