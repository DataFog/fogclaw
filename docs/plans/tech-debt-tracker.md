# Tech Debt Tracker

General-purpose deferred-work queue. Review findings, cleanup tasks, improvement ideas — anything we want to address later but shouldn't block now. Any skill can append to this file.

Treat this file as append-and-update: do not delete historical rows unless duplicated by mistake. When status changes, update both the index table row and the detail entry.

## Status Semantics

- `new`: captured, not yet scheduled.
- `queued`: prioritized for a future slug.
- `in_progress`: being addressed in an active plan.
- `resolved`: fixed, evidence linked.
- `wont_fix`: consciously accepted with documented rationale.

## Index

| ID | Date | Priority | Source | Status | Summary |
|---|---|---|---|---|---|
| TD-2026-02-17-01 | 2026-02-17 | high | 2026-02-17-feat-submit-fogclaw-to-openclaw-plan | resolved | Define and document the canonical upstream PR path for external plugin submissions from non-fork plugin repos.
| TD-2026-02-17-02 | 2026-02-17 | medium | 2026-02-17-feat-submit-fogclaw-to-openclaw-plan | new | Track package scope/publish readiness (`@openclaw/fogclaw` visibility) separately from PR review progress.
| TD-2026-02-17-03 | 2026-02-17 | medium | 2026-02-17-feat-pii-access-request-backlog | new | Add length validation on string inputs in backlog tools (S-1).
| TD-2026-02-17-04 | 2026-02-17 | medium | 2026-02-17-feat-pii-access-request-backlog | new | Add eviction for resolved/terminal-state requests in BacklogStore (S-18).
| TD-2026-02-17-05 | 2026-02-17 | medium | 2026-02-17-feat-pii-access-request-backlog | new | Return defensive copies from getRequest/listRequests (D-2).
| TD-2026-02-17-06 | 2026-02-17 | medium | 2026-02-17-feat-pii-access-request-backlog | new | Extract batch/single resolve paths in createResolveHandler (SIM-1).
| TD-2026-02-17-07 | 2026-02-17 | low | 2026-02-17-feat-pii-access-request-backlog | new | Warn when placeholder not found in RedactionMapStore (C-1).
| TD-2026-02-17-08 | 2026-02-17 | low | 2026-02-17-feat-pii-access-request-backlog | new | Cache pendingCount instead of iterating all requests (A-1).
| TD-2026-02-17-09 | 2026-02-17 | low | 2026-02-17-feat-pii-access-request-backlog | new | Use injectable clock for deterministic timestamps (D-1).
| TD-2026-02-17-10 | 2026-02-17 | low | 2026-02-17-feat-pii-access-request-backlog | new | Use structured logging objects instead of string concatenation (D-3).

## Detail Entries

<!-- Append new entries below this line. -->

- **TD-2026-02-17-01**
  - **Source:** initiative `docs/plans/active/2026-02-17-feat-submit-fogclaw-to-openclaw-plan.md`
  - **Status:** resolved
  - **Priority:** high
  - **Owner:** sidmohan / OpenClaw intake coordination
  - **Action:** Add and maintain the submission-runbook path so all future external plugin submissions use the same fork-first + forked PR pattern.
  - **Evidence/Reference:** Created `DataFog/openclaw` fork and moved active PR to `openclaw/openclaw` PR #18791 from `DataFog:openclaw-upstream-submission`.
  - **Rollback:** none; process doc update is now in place as docs-only.

- **TD-2026-02-17-02**
  - **Source:** initiative `docs/plans/active/2026-02-17-feat-submit-fogclaw-to-openclaw-plan.md`
  - **Status:** new
  - **Priority:** medium
  - **Owner:** sidmohan / OpenClaw release coordinators
  - **Action:** Add release gate that confirms `npm view @openclaw/<plugin>` visibility before merge is finalized.
  - **Evidence/Reference:** `npm view @openclaw/fogclaw version` currently returns E404 from this environment.
  - **Rollback:** if scope changes, update entry to `resolved` with release evidence and PR link.

- **TD-2026-02-17-03**
  - **Source:** review finding S-1, initiative `2026-02-17-feat-pii-access-request-backlog`
  - **Status:** new
  - **Priority:** medium
  - **Dimension:** Security
  - **File:** `src/backlog-tools.ts`
  - **Action:** Add max-length validation on `placeholder`, `reason`, and `context` string inputs in `createRequestAccessHandler` to prevent memory pressure from extremely long strings.

- **TD-2026-02-17-04**
  - **Source:** review finding S-18, initiative `2026-02-17-feat-pii-access-request-backlog`
  - **Status:** new
  - **Priority:** medium
  - **Dimension:** Security
  - **File:** `src/backlog.ts` `BacklogStore`
  - **Action:** Add configurable eviction for resolved (approved/denied) requests. Terminal-state requests holding `originalText` should be prunable after a retention window or count limit.

- **TD-2026-02-17-05**
  - **Source:** review finding D-2, initiative `2026-02-17-feat-pii-access-request-backlog`
  - **Status:** new
  - **Priority:** medium
  - **Dimension:** Data
  - **File:** `src/backlog.ts:119-121`
  - **Action:** Return defensive copies (spread or `structuredClone`) from `getRequest()` and `listRequests()` to prevent callers from mutating internal store state.

- **TD-2026-02-17-06**
  - **Source:** review finding SIM-1, initiative `2026-02-17-feat-pii-access-request-backlog`
  - **Status:** new
  - **Priority:** medium
  - **Dimension:** Simplicity
  - **File:** `src/backlog-tools.ts:160-257`
  - **Action:** Extract batch-resolve and single-resolve paths in `createResolveHandler` into separate helper functions to reduce closure complexity below 60 lines.

- **TD-2026-02-17-07**
  - **Source:** review finding C-1, initiative `2026-02-17-feat-pii-access-request-backlog`
  - **Status:** new
  - **Priority:** low
  - **Dimension:** Correctness
  - **File:** `src/backlog.ts:98`
  - **Action:** Log a warning when `getOriginal(placeholder)` returns `undefined` during request creation, so operators know the mapping was not captured.

- **TD-2026-02-17-08**
  - **Source:** review finding A-1, initiative `2026-02-17-feat-pii-access-request-backlog`
  - **Status:** new
  - **Priority:** low
  - **Dimension:** Architecture
  - **File:** `src/backlog.ts:66-70`
  - **Action:** Cache `pendingCount` with increment/decrement on create/resolve instead of iterating all requests. Only relevant if backlogs grow large.

- **TD-2026-02-17-09**
  - **Source:** review finding D-1, initiative `2026-02-17-feat-pii-access-request-backlog`
  - **Status:** new
  - **Priority:** low
  - **Dimension:** Data
  - **File:** `src/backlog.ts:108`
  - **Action:** Accept an injectable clock function (`() => string`) to allow deterministic timestamps in tests.

- **TD-2026-02-17-10**
  - **Source:** review finding D-3, initiative `2026-02-17-feat-pii-access-request-backlog`
  - **Status:** new
  - **Priority:** low
  - **Dimension:** Data
  - **File:** `src/backlog-tools.ts`
  - **Action:** Replace string-concatenated JSON in audit log entries with structured logging objects for better parseability.
