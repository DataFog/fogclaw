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
