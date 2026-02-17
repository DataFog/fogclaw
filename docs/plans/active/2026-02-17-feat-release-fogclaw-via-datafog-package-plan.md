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

- [x] (2026-02-17T18:52:00Z) P1 [M1] Confirmed baseline package identity references and package files in the DataFog repo.
- [x] (2026-02-17T18:53:00Z) P2 [M1] Updated `package.json` and user docs to `@datafog/fogclaw`.
- [x] (2026-02-17T18:54:00Z) P3 [M1] Updated `package-lock` metadata and refreshed scope for build/release artifacts.
- [x] (2026-02-17T18:55:00Z) P4 [M2] Re-ran build/test/smoke + `npm pack --json` + `npm publish --dry-run` validations.
- [x] (2026-02-17T18:56:00Z) P5 [M2] Verified `openclaw plugins install` against the built `datafog-fogclaw-0.1.0.tgz` in a clean runtime; plugin now loads as `fogclaw` with status `loaded` and tools `fogclaw_scan, fogclaw_redact`.
- [x] (2026-02-17T20:33:00Z) P5 [M2] Verified `openclaw plugins install @datafog/fogclaw` resolves to published `0.1.4` in this runtime.
- [x] (2026-02-17T19:27:00Z) P6 [M2] Fixed GLiNER startup blocker in Node by pinning `onnxruntime-web` to `1.21.0`, preventing `./webgpu` export resolution errors from `gliner` in OpenClaw install paths.
- [x] (2026-02-17T19:34:00Z) P6 [M2] Added direct `sharp` dependency `0.34.5` with an override to prevent optional sharp native install failure (`sharp-darwin-arm64v8.node` missing) during OpenClaw install-time dependency bootstrap.
- [x] (2026-02-17T20:29:00Z) P6 [M3] Published the startup hardening update as `@datafog/fogclaw@0.1.4` (OTP already provisioned) and confirmed package availability.
- [x] (2026-02-17T18:56:00Z) P6 [M3] Prepare and execute V1 publish/release of `@datafog/fogclaw`.
- [x] (2026-02-17T18:57:00Z) P7 [M3] Capture release artifacts and update evidence notes; add follow-up for dependency install blocker in OpenClaw install path.


## Surprises & Discoveries

- Observation: In the DataFog repo, multiple docs and user-facing examples currently point to `@openclaw/fogclaw`, and migration must be done consistently across `README.md`, `docs/plugins/fogclaw.md`, and install examples to avoid user confusion.
  Evidence: `rg -n "@openclaw/fogclaw|openclaw plugins install"` in `/Users/sidmohan/Projects/datafog/fogclaw`.

- Observation: `package-lock.json` pins package metadata to `@openclaw/fogclaw` and must be regenerated after namespace rename.
  Evidence: top-level `package-lock.json` package metadata `name` field.

- Observation: `openclaw plugins install` of a clean extracted `datafog-fogclaw-0.1.0.tgz` now completes successfully on a clean runtime.
  Evidence: `openclaw plugins install /Users/sidmohan/Projects/datafog/fogclaw/datafog-fogclaw-0.1.0.tgz`, `openclaw plugins info fogclaw`, and `openclaw plugins list` all report plugin `fogclaw` as `loaded` with tools.

- Observation: The prior `TypeError: Cannot read properties of undefined (reading 'trim')` install failure was caused by OpenClaw's `registerTool` contract when tool objects omit a top-level `name`.
  Evidence: `src/plugins/registry.ts` in OpenClaw (`registerTool` maps `tool.name` without null-guard); fixed in this repository by adding `name` fields to both tool objects.

- Observation: `openclaw plugins install @datafog/fogclaw` now resolves and installs successfully from npm as version `0.1.4` in this environment.
  Evidence: `npm view @datafog/fogclaw@0.1.4` returns `version = '0.1.4'` and `openclaw plugins install @datafog/fogclaw` reports success with plugin `fogclaw` loaded.

- Observation: GLiNER startup now avoids the `onnxruntime-web/webgpu` exports failure after pinning `onnxruntime-web` to 1.21.0.
  Evidence: in install flows, the earlier `./webgpu` subpath export error no longer blocks plugin registration in this environment.
- Observation: optional sharp runtime failures are now mitigated in clean install flows by pinning direct `sharp` 0.34.5; this removes the previously recurrent `Cannot find module '../build/Release/sharp-darwin-arm64v8.node'` warning in OpenClaw plugin install logs.
  Evidence: `openclaw plugins install` from `datafog-fogclaw-0.1.4` no longer emits that missing binary warning.
- Observation: Running `pnpm openclaw` from the local OpenClaw source tree can still emit duplicate-plugin warnings when both the source-bundled `fogclaw` extension and installed `~/.openclaw/extensions/fogclaw` are present.
  Evidence: this is due discovery order (`global` then `bundled`) and not a packaging defect in `@datafog/fogclaw` when installed in a standard global runtime.

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

- Decision: Keep behavioral compatibility unchanged for the V1 scope.
  Rationale: The goal is install-path enablement and namespace migration, not feature changes to detection/redaction behavior.
  Date/Author: 2026-02-17T18:57:00Z / sidmohan

- Decision: Add a targeted registration compatibility fix for OpenClaw API expectations while keeping runtime behavior unchanged.
  Rationale: OpenClaw's `registerTool` requires a tool `name` field in object registrations to avoid `trim` crashes; adding `name` fields in FogClaw's tool registrations is a non-functional compatibility patch and required to complete installability.
  Date/Author: 2026-02-17T19:08:00Z / sidmohan

## Outcomes & Retrospective

- V1 package identity migration and documentation updates are complete in the DataFog repo with no runtime behavior changes.
- Local validation confirms namespace rename compiles and tests (`npm run build`, `npm run test`, `npm run test:plugin-smoke`) continue to pass.
- `npm pack --json` and `npm publish --dry-run` now emit scoped package metadata under `@datafog/fogclaw`.
- `openclaw plugins install` against a clean temporary state and local `datafog-fogclaw-0.1.0.tgz` now succeeds; `openclaw plugins info fogclaw` shows status `loaded` and tools `fogclaw_scan`, `fogclaw_redact`.
- `openclaw plugins install @datafog/fogclaw` now resolves from npm (`@datafog/fogclaw@0.1.4`) and plugin info/list flows show `fogclaw` as loaded.
- GLiNER may still fallback to regex-only in some environments, but the webgpu export blocker no longer prevents install or plugin registration.
- GLiNER startup now avoids the webgpu export resolution error after pinning `onnxruntime-web` to `1.21.0` in this runtime; fallback behavior remains safe if ONNX still cannot initialize.


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

- Install/documentation references should consistently show `@datafog/fogclaw` (legacy `@openclaw/fogclaw` references would be migration follow-ups).

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
- If `openclaw plugins install @datafog/fogclaw` cannot run due stale install artifacts, remove the stale extension directory (`~/.openclaw/extensions/fogclaw`) and reinstall from the scoped spec in one flow, keeping the `plugins.entries.fogclaw` config entry intact.
- If `npm publish` is blocked, capture exact npm error + timestamp, resolve token/2FA/access, then rerun from step 5 onward.
- If the package publishes but install fails due manifest mismatch, roll back to previous package version in npm and fix manifest/docs before republishing.

## Artifacts and Notes

- Scope migration evidence:

    package: @datafog/fogclaw
    version: 0.1.4
    `npm pkg get name` output: `"@datafog/fogclaw"`
    `npm pkg get openclaw` output:
    `{"extensions":["./dist/index.js"]}`

- Contract smoke evidence:

    `node - <<'NODE'
    import plugin from './dist/index.js';
    console.log(typeof plugin?.register, plugin?.id, plugin?.name);
    NODE`
    => `function fogclaw FogClaw`

- Reproducibility evidence:
  - `npm pack --json` output includes `datafog-fogclaw-0.1.4.tgz` and `openclaw.plugin.json`/`dist/index.js` in file list.
  - `npm publish --dry-run` succeeded and produced scoped package manifest notice.

- Installability evidence:
  - `openclaw plugins install @datafog/fogclaw` succeeds in this environment and installs the published `0.1.4` package.
  - `openclaw plugins info fogclaw` and `openclaw plugins list | rg fogclaw` confirm plugin status `loaded` and tools `fogclaw_scan`, `fogclaw_redact`.
  - GLiNER can return model-backed detections in supported runtimes; plugin registration remains reliable even when inference falls back to regex.

- `git rev-parse HEAD` (of implementation snapshot): capture before final merge.




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
- date: 2026-02-17T20:33:00Z
- open findings by priority (if any): pending
- evidence:
  - installability against clean runtime now succeeds for `openclaw plugins install @datafog/fogclaw` (version `0.1.4`) and `openclaw plugins info/list` confirms `fogclaw` plugin visibility.
  - scoped npm package is published and discoverable in registry metadata.
- rollback: revert to previous working scoped package state (or keep changes in branch) if publish credentials/visibility unavailable
- post-release checks:
  - `openclaw plugins install @datafog/fogclaw`
  - `openclaw plugins info fogclaw`
  - `openclaw plugins list | rg fogclaw`
- owner: sidmohan

## Revision Notes

- 2026-02-17T10:57:00Z: Initialized plan for V1 scoped-release path in `@datafog/fogclaw` and documented zero-logic-change constraints for immediate installability milestone.
- 2026-02-17T18:57:00Z: Completed namespace migration in package metadata and install/docs (`package.json`, `package-lock.json`, `README.md`, `docs/plugins/fogclaw.md`). Ran full local validation (`npm run build`, `npm run test`, `npm run test:plugin-smoke`, `npm pack --json`, `npm publish --dry-run`) and prepared release notes.
- 2026-02-17T19:08:00Z: Fixed OpenClaw compatibility in `src/index.ts` by adding explicit `name` fields to `fogclaw_scan` and `fogclaw_redact` tool registrations to avoid undefined `.trim()` during registration; verified `openclaw plugins install` clean-runtime success with local tarball and published package commands (`openclaw plugins install <tgz>/<scoped spec>`, `plugins info`, `plugins list`).
- 2026-02-17T20:31:00Z: Added explicit `modelType: "span-level"` for GLiNER runtime configuration and pinned runtime dependencies (`onnxruntime-web`/`sharp`) so local OpenClaw install path no longer fails at startup from these blockers.
- 2026-02-17T20:33:00Z: Confirmed `@datafog/fogclaw@0.1.4` is published and installable via `openclaw plugins install @datafog/fogclaw` in this environment.
