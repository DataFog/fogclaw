---
slug: 2026-02-17-feat-submit-fogclaw-to-openclaw
status: intake-complete
date: 2026-02-17T01:56:00Z
owner: sidmohan
plan_mode: execution
spike_recommended: yes
priority: high
---

# Submit FogClaw to OpenClaw official plugin channel

## Purpose / Big Picture

FogClaw is already installable and usable via the `@openclaw/fogclaw` package, and it now has repository-side submission readiness artifacts. This initiative is to prepare and execute the **next submission step**: opening and completing the cross-repository contribution in the OpenClaw ecosystem so the plugin can be discovered through official OpenClaw workflows.

The outcome is observable when a maintainer-facing OpenClaw repo PR is opened with reproducible validation evidence and receives maintainer review status. A user should be able to verify this by checking the new upstream PR and the documented checklist that proves package identity, installability, hook/tool behavior, and testability in a clean environment.

## Scope

### In Scope

- Identify the exact official OpenClaw submission path for plugins and prepare the required contribution artifacts for FogClaw.
- Create a maintainer-facing submission PR in the OpenClaw repository using the already-merged `DataFog/fogclaw` release state.
- Include submission evidence mapping between this repository and OpenClaw review expectations (package name/version, manifest, installation command, and reproducible test checks).
- Add/confirm any minimal metadata or docs updates needed specifically for external submission in this repo (if required after upstream validation).
- Track and document outcomes, open questions, and blockers in spec/plan artifacts.

### Boundaries

- No changes to detection logic, redaction strategies, or plugin runtime behavior.
- No implementation changes to OpenClaw platform code.
- No introduction of new dependencies or CI infrastructure in the plugin repo.
- No security/privacy model changes; this effort only covers publication workflow and submission evidence.

## Non-Goals

- Reworking plugin internals or adding new plugin features.
- Re-running full internal feature validation already completed in the plugin merge.
- Creating a parallel package/brand strategy beyond the existing `@openclaw/fogclaw` identity.

## Risks

- OpenClaw may enforce additional fields, naming constraints, or review expectations that were not covered by the DataFog repo readiness work.
- Upstream PR template may require evidence format changes from repo-local PR notes.
- There may be a delay between contribution and maintainer review if expectations remain unclear.
- Maintainers may request a packaging/metadata adjustment after we submit, requiring a follow-up PR.

## Rollout

- Use the already-merged `main` state of `DataFog/fogclaw` as the submission baseline.
- Draft and open the OpenClaw submission PR with reproducible commands and exact expected outputs.
- If OpenClaw maintainers request changes, loop through `respond-to-feedback` and reopen on the same submission branch.
- Close the initiative once the upstream PR is accepted and merged, or route back to `he-implement` if repository changes are required.

## Validation and Acceptance Signals

- Reproducible local evidence command block exists and matches what is sent in the OpenClaw submission PR.
- `@openclaw/fogclaw` package identity remains stable and points to the merged `DataFog/fogclaw` release state.
- OpenClaw upstream PR reaches at least “ready for review” with all requested evidence attachments present.
- The maintainer-facing PR includes explicit answers for submission criteria and known caveats (for example model/download behavior in constrained environments).

## Requirements

| ID | Priority | Requirement |
|---|---|---|
| R1 | high | Prepare a submission PR in the OpenClaw repo that references the `@openclaw/fogclaw` package and the merged DataFog commit history relevant for reviewers.
| R2 | high | Include a clean check list in the OpenClaw PR body with outputs for `npm test`, `npm run build`, `npm run test:plugin-smoke`, and package manifest verification.
| R3 | medium | Confirm any OpenClaw-specific metadata expectations (template fields, review checklist, review labels, or required docs) before requesting maintainer action.
| R4 | medium | Capture and resolve any maintainer feedback by returning to local implementation only when repository edits are required.
| R5 | low | Record submission status and next action in durable docs (`docs/plans/...` and open questions log).

## Chosen Direction (Recommended)

- Use a single upstream pull request targeting the designated OpenClaw repository path as the primary submission vehicle (recommended) because it minimizes fragmentation and matches standard contributor workflows. The risk is that external process details may require iteration.
- A second, duplicate submission route should be avoided unless a maintainer explicitly requests it, because duplicate PRs tend to create conflicting discussions and slower review.

## Open Questions

- **[research]** What exact OpenClaw repository/path and PR template must FogClaw target for official plugin publication?
- **[research]** Does OpenClaw require an additional manifest or catalog file update inside their own repository in addition to package metadata?
- **[decision]** Should this initiative include one follow-up patch branch for any requested metadata changes, or remain submission-only until maintainer asks?
- **[planning]** If additional upstream packaging adjustments are required, should those be merged through the current open submission branch or a fresh follow-up branch?

## Success Criteria

- A new OpenClaw-side PR is created with: plugin identity, install command, reproducible tests, and evidence of `src/index.ts` contract behavior.
- The submission PR body cites the merged plugin-merge commit from `DataFog/fogclaw` as canonical source-of-truth.
- Maintainers can reproduce the core checks from the PR body without guessing or adding setup instructions.
- Any blocking submission questions are answered in the PR thread or captured in plan artifacts before proceeding to final merge.

## Constraints

- Only proceed with outward-facing submission work while preserving plugin behavior unchanged.
- Keep all package names and registry scope aligned to `@openclaw/fogclaw` unless OpenClaw maintainer instruction requires a temporary exception.
- Do not assume access to external OpenClaw maintainer accounts beyond normal GitHub contributor permissions.
- Avoid changing internal plugin code until submission blockers are confirmed as code-level.

## Tech Preferences

- **Language/runtime**: TypeScript / Node.js (repository remains unchanged).
- **Framework/API**: OpenClaw plugin API and GitHub PR process for upstream submission.
- **Infrastructure**: GitHub CLI and repository PR workflow.
- **Rationale**: Keeps this initiative low-risk and focused on process and reviewability rather than implementation.

## Handoff

- This spec should transition to `he-plan` once the exact OpenClaw target path and submission requirements are clear.
- `he-plan` should define submission mechanics and maintainer-proof evidence formatting as separate milestones.
- If significant process uncertainty remains after planning, first route to `he-research` for missing process facts.

## Priority

- priority: high
- rationale: This is the final official publication step and required for wider ecosystem discoverability.

## Initial Milestone Candidates

- M1: Confirm official OpenClaw submission target and required review template/evidence format.
- M2: Draft and open the upstream OpenClaw PR with reproducible checks, package identity, and maintainer-facing rationale.
- M3: Respond to initial feedback loop and either land metadata fixes or close with explicit blocker notes.

## Revision Notes

- 2026-02-17T01:56:00Z: Initialized spec to formalize the cross-repo OpenClaw submission step after plugin readiness merge landed on `DataFog/fogclaw` main.
