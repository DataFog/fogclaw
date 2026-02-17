---
title: "Reliability"
use_when: "Capturing reliability goals, failure modes, and operational guardrails for this repo."
---

## Reliability Goals

This plugin should behave predictably for two success paths: (1) full detection flow with GLiNER available and (2) degraded mode with regex-only detection when GLiNER cannot initialize.

Primary targets:

- Plugin registration should succeed on a clean build and load via OpenClaw extension loading.
- Guardrail hook should never throw uncaught errors to the request path.
- Tool responses should be deterministic for the same input and schema.
- Degraded flow should preserve baseline privacy protection via regex and continue processing traffic.

## Failure Modes

1. **GLiNER model fails to initialize or load**
   - Signal: startup warning in build/test output or runtime log.
   - Effect: semantic entities from GLiNER are unavailable.
   - Mitigation: continue with regex-only scan (already implemented with warning path).

2. **Runtime GLiNER inference errors**
   - Signal: scanner logs and returns regex-only results.
   - Effect: temporary loss of semantic detections only.
   - Mitigation: keep regex detections and return a best-effort result.

3. **Wrong plugin package metadata during review/installation**
   - Signal: mismatch across `package.json`, lockfile, and docs.
   - Effect: reviewer confusion or install friction.
   - Mitigation: document and verify package identity consistently for submission target.

4. **Model download or environment path issues**
   - Signal: GLiNER init failures in constrained environments.
   - Effect: reduced detection coverage.
   - Mitigation: allow fallback to deterministic regex tests and avoid hard dependency in test harness.

## Monitoring

No centralized telemetry is included in this repository. Reliability should be observed by:

- test pass/fail trends,
- OpenClaw plugin load or registration diagnostics,
- explicit warning signals when GLiNER is unavailable.

## Operational Guardrails

- Keep `enabled: false` as a quick mitigation switch if plugin behavior needs immediate suppression.
- Validate with reviewer smoke commands before any package-level change.
- Prefer small, atomic commits for submission-related metadata and test updates.
- For release risk, run build + unit tests before pushing, and re-run on merge.

## Rollback Path

If submission metadata changes cause regressions, revert to the last green commit from this initiative branch, then revalidate:

- `npm test`
- `npm run build`
- plugin contract smoke test for hook/tool behavior.
