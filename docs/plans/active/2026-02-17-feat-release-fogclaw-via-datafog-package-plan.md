---
slug: 2026-02-17-feat-release-fogclaw-via-datafog-package
status: active
phase: plan
plan_mode: execution
detail_level: more
priority: high
owner: DataFog Platform Team
---

# Enable an interim DataFog-owned `@datafog/fogclaw` release path

This Plan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, `Outcomes & Retrospective`, and `Revision Notes` must be kept current as work proceeds.

This plan is maintained in accordance with `docs/PLANS.md`.

## Purpose / Big Picture

Users should be able to install and use FogClaw today from a DataFog-owned namespace without waiting for official OpenClaw plugin listing approval. The result should be a published package `@datafog/fogclaw` that can be installed with `openclaw plugins install @datafog/fogclaw`, loads correctly through OpenClaw plugin discovery, and exposes the same guardrail + tool behavior that was already validated for the merged FogClaw line.

## Progress

- [ ] (2026-02-17T10:57:00Z) P1 [M1] Confirm baseline package identity and all `@openclaw/fogclaw` references in the DataFog repo.
- [ ] (2026-02-17T10:57:00Z) P2 [M1] Update package and docs references to `@datafog/fogclaw`.
- [ ] (2026-02-17T10:57:00Z) P3 [M1] Update lockfile and build artifacts for the namespace change.
- [ ] (2026-02-17T10:57:00Z) P4 [M2] Run build/test/reproducibility validations on the renamed package.
- [ ] (2026-02-17T10:57:00Z) P5 [M2] Verify OpenClaw install flow from npm spec (`openclaw plugins install`) in a clean environment and record evidence.
- [ ] (2026-02-17T10:57:00Z) P6 [M3] Prepare `npm pack`/publish artifacts and publish V1 release of `@datafog/fogclaw`.
- [ ] (2026-02-17T10:57:00Z) P7 [M3] Update initiative-specific docs/runbook references and capture post-release verification handoff.

## Surprises & Discoveries

- Observation: In the DataFog repo, multiple docs and user-facing examples currently point to `@openclaw/fogclaw`, and migration must be done consistently across `README.md`, `docs/plugins/fogclaw.md`, and install examples to avoid user confusion.
  Evidence: `rg -n "@openclaw/fogclaw|openclaw plugins install"` in `/Users/sidmohan/Projects/datafog/fogclaw`.

- Observation: `package-lock.json` pins package metadata to `@openclaw/fogclaw` and must be regenerated after namespace rename.
  Evidence: top-level `package-lock.json` package metadata `name` field.

## Decision Log

- Decision: Keep package behavior unchanged while implementing namespace migration and release plumbing.
  Rationale: V1 goal is immediate user availability through DataFog namespace, not plugin runtime changes.
  Date/Author: 2026-02-17T10:57:00Z / sidmohan

- Decision: Maintain plugin `id: "fogclaw"` and `openclaw.extensions` compatibility.
  Rationale: OpenClaw discovery is keyed by plugin id in manifest and extension path; changing `id` would require user-facing config migration.
  Date/Author: 2026-02-17T10:57:00Z / sidmohan

- Decision: Use `@datafog/fogclaw` for interim installs and document fallback to official listing work separately.
  Rationale: This matches the user objective for independently publishable DataFog namespace while official inclusion is pending.
  Date/Author: 2026-02-17T10:57:00Z / sidmohan

## Outcomes & Retrospective

- To be filled after M1-M3 completion.

## Context and Orientation

This repository is `/Users/sidmohan/Projects/datafog/fogclaw`.

Key files:

- `package.json`: package identity (`name`) and plugin manifest pointer (`openclaw.extensions`).
- `package-lock.json`: locked package metadata used by npm publish and reproducibility checks.
- `openclaw.plugin.json`: plugin manifest required by OpenClaw (`id`, config schema, metadata).
- `dist/index.js`: compiled plugin entrypoint referenced by `openclaw.extensions`.
- `src/index.ts`: plugin registration (`before_agent_start`, `fogclaw_scan`, `fogclaw_redact`).
- `tests/plugin-smoke.test.ts`: local contract check for hook/tool registration.
- `README.md` and `docs/plugins/fogclaw.md`: primary install and usage documentation.
- `/Users/sidmohan/Projects/datafog/openclaw` provides target runtime install behavior for `openclaw plugins install`.

**OpenClaw install flow (important for this initiative):**
`openclaw plugins install <npm-spec>` invokes `npm pack`, extracts into plugin extension directory, records install metadata, and loads the extracted package through plugin manifest/entrypoint discovery.

## Milestones

### Milestone 1 — Namespace migration in DataFog repo

Rename the package to `@datafog/fogclaw` across package metadata and documentation without changing runtime behavior. This milestone exists so users can consistently install the package from DataFog namespace and the published tarball name matches the user-facing command.

### Milestone 2 — Validation of local contract and installability

Prove the renamed package remains install-ready by running build/tests/pack checks and an end-to-end OpenClaw install smoke flow. This milestone ensures compatibility with OpenClaw’s plugin loader and confirms no manifest or entrypoint regressions.

### Milestone 3 — Release and evidence publishing

Publish V1 package release to npm, then record release evidence and update operational/runbook notes so users can reliably install `@datafog/fogclaw` today.

## Plan of Work

Work should proceed in small, testable edits.

First, update DataFog package metadata and references to the desired scope and verify there are no conflicting names left behind. This includes package name, lockfile metadata, user documentation commands, and plugin docs in the DataFog repo.

Second, run an installability verification sequence in the same repo: compile and test, generate a dry-run publish artifact, and validate OpenClaw loading behavior from a clean install path using the newly scoped npm spec. For the smoke path, use either a temporary local publish or a pre-release test package if external network restrictions prevent immediate production publish.

Third, perform the final publish/release steps and capture deterministic artifacts (pack info, version, install command, expected `openclaw plugin` diagnostics) in the plan’s evidence section. Keep open questions explicit if npm publish access/rate-limiting or token setup is an external blocker.

## Concrete Steps

From repo root `/Users/sidmohan/Projects/datafog/fogclaw`:

1. Inspect current scope references.

    rg -n "@openclaw/fogclaw|@datafog/fogclaw|openclaw plugins install" README.md package.json package-lock.json docs/plugins/fogclaw.md src docs/PLANS.md

Expected:

- All install/documentation references show `@openclaw/fogclaw` and can be migrated in-place to `@datafog/fogclaw` for V1.

2. Update package identity to DataFog namespace.

    python - <<'PY'
import json
from pathlib import Path
p = Path('package.json')
obj = json.loads(p.read_text())
obj['name'] = '@datafog/fogclaw'
p.write_text(json.dumps(obj, indent=2) + "\n")
print('updated', p)

p = Path('package-lock.json')
obj = json.loads(p.read_text())
obj['name'] = '@datafog/fogclaw'
if isinstance(obj.get('packages'), dict) and '' in obj['packages']:
    obj['packages']['']['name'] = '@datafog/fogclaw'
p.write_text(json.dumps(obj, indent=2) + "\n")
print('updated', p)
PY

Expected:

- Both files use `@datafog/fogclaw` as package `name`.
- `package-lock.json` root package and lock metadata are coherent.

3. Update install/docs references to the scoped package.

    rg -n "@openclaw/fogclaw|openclaw plugins install @" README.md docs/plugins/fogclaw.md docs/specs/*.md docs/plans/active/*.md

Then edit all DataFog user-facing examples to:

- `openclaw plugins install @datafog/fogclaw`

and adjust standalone import examples if they currently imply `@openclaw/fogclaw` identity.

Expected:

- Documentation consistently points users at `@datafog/fogclaw` for interim install path.
- Core plugin `id` and extension path references remain unchanged.

4. Rebuild and refresh lock-derived metadata as needed.

    npm install
    npm run build
    npm test
    npm run test:plugin-smoke

Expected:

- Build/test suite passes.
- `dist/index.js` and test artifacts remain valid.
- Plugin contract checks still pass.

5. Validate package pack shape before publish.

    npm pack --json
    npm publish --dry-run

Expected:

- Tarball contains `dist/index.js` and `openclaw.plugin.json` and `package.json`.
- No unintended paths (e.g., local `.git`, build cache, editor artifacts) leak into the packed payload.

6. Verify install path from OpenClaw using scoped spec on a local/clean extension path.

    openclaw plugins install @datafog/fogclaw
    openclaw plugins info fogclaw
    openclaw plugins list | rg fogclaw

Expected:

- `fogclaw` plugin appears and can be enabled/referenced in OpenClaw config.
- No manifest/schema errors are thrown in plugin load.

## Validation and Acceptance

A completed V1 initiative is successful when all commands below pass in this repo and in an `openclaw` runtime that can install third-party packages.

- Run:
  - `npm install`
  - `npm run build`
  - `npm test`
  - `npm run test:plugin-smoke`
  - `npm pack --json`
  - `npm publish --dry-run`

Expect:

- Plugin build/tests pass.
- Pack metadata is minimal and includes `openclaw.plugin.json` + `dist/index.js`.
- Installability command either succeeds with a published `@datafog/fogclaw` package or demonstrates a reproducible blocker (e.g., publish access) with mitigation.

- `openclaw plugins install @datafog/fogclaw`
- `openclaw plugins info fogclaw`
- `openclaw plugins list | rg fogclaw`

Expect:

- Plugin installation metadata registers as `fogclaw` and lists both hook/tool availability from manifest.
- `openclaw plugins info fogclaw` shows no critical errors.

## Idempotence and Recovery

- Re-running namespace renames is safe if done as a single set of edits (`package.json`, `package-lock.json`, docs).
- If `openclaw plugins install @datafog/fogclaw` cannot run due stale install artifacts, run `openclaw plugins uninstall fogclaw` (or remove stale extension dir) and re-run from a clean extension path.
- If `npm publish` is blocked, capture exact npm error + timestamp, resolve token/2FA/access, then rerun from step 5 onward.
- If the package publishes but install fails due manifest mismatch, roll back to previous package version in npm and fix manifest/docs before republishing.

## Artifacts and Notes

- Add release evidence from:
  - `npm pack --json`
  - `npm publish --dry-run`
  - OpenClaw install smoke output
  - `git rev-parse HEAD` + version from `package.json`

- Record whether scoped package is discoverable in npm before/after publishing.

## Interfaces and Dependencies

- OpenClaw plugin package contract:
  - `package.json` field `openclaw.extensions` still points to `./dist/index.js`.
  - `openclaw.plugin.json` remains installable by OpenClaw manifest parser.
- Build and verification commands rely on:
  - `typescript`, `vitest`, and Node runtime already present in project.
- Publish path depends on npm credentials and any 2FA / publish policy in DataFog org scope.

## Pull Request

- pr: <url>
- branch:
- commit:
- ci:

## Review Findings

- Pending until review stage.

## Verify/Release Decision

- decision: pending
- date:
- open findings by priority (if any): pending
- evidence:
- rollback:
- post-release checks:
- owner:

## Revision Notes

- 2026-02-17T10:57:00Z: Initialized plan for V1 scoped-release path in `@datafog/fogclaw` and documented zero-logic-change constraints for immediate installability milestone.
