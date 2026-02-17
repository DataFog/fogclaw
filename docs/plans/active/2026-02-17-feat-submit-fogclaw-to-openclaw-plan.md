---
slug: 2026-02-17-feat-submit-fogclaw-to-openclaw
status: active
phase: plan
plan_mode: execution
detail_level: more
priority: high
owner: sidmohan
---

# Submit FogClaw to OpenClaw's official plugin submission path

This plan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, `Outcomes & Retrospective`, and `Revision Notes` current as work progresses.

This plan must be maintained in accordance with `docs/PLANS.md`.

## Purpose / Big Picture

The plugin is already merged in `DataFog/fogclaw` and ready for publication. This initiative moves beyond local repository hardening to complete the **official OpenClaw submission process** in the upstream ecosystem, so maintainers and users can discover FogClaw through OpenClaw’s normal plugin intake path.

After this initiative, a reviewer should be able to find a dedicated upstream OpenClaw PR containing reproducible evidence for plugin loadability, tool/guardrail behavior, and package identity, with clear status and follow-up notes if maintainers request changes.

## Progress

- [x] (2026-02-17T01:56:00Z) P1 [Setup] Create submission intent spec for official OpenClaw side flow in `docs/specs/2026-02-17-feat-submit-fogclaw-to-openclaw.md`.
- [x] (2026-02-17T01:58:00Z) P2 [M1] Read and align the plan against repository conventions (`docs/PLANS.md` + `docs/runbooks/`) and confirm open questions from spec.
- [ ] (2026-02-17T02:00:00Z) P3 [M1] Confirm target OpenClaw submission repository/path and required PR checklist/template.
- [ ] (2026-02-17T02:10:00Z) P4 [M2] Draft external PR body with reproducible evidence block and maintainer-facing rationale.
- [ ] (2026-02-17T02:15:00Z) P5 [M2] Open upstream OpenClaw PR from branch containing no code changes outside `@openclaw/fogclaw` submission evidence/supporting docs.
- [ ] (2026-02-17T02:20:00Z) P6 [M3] Record maintainer feedback and implement any required follow-up in repository or PR only when explicitly requested.
- [ ] (2026-02-17T02:30:00Z) P7 [M3] Update this plan `Pull Request` and `Verify/Review` sections with final submission state and closeout status.

## Surprises & Discoveries

- Observation: The initial phase of this initiative remains uncertain because the exact OpenClaw submission target path is not yet confirmed in this repo.
  Evidence: Existing work has completed DataFog-side plugin merge, but there is no confirmed upstream submission path in `docs/specs` or existing plans.

## Decision Log

- Decision: Scope this initiative to upstream OpenClaw submission only, with zero functional/plugin code changes.
  Rationale: Plugin behavior and API are already stabilized and merged locally; additional code changes would dilute the submission objective and risk destabilizing already verified artifacts.
  Date/Author: 2026-02-17T01:58:00Z / sidmohan

- Decision: Keep `@openclaw/fogclaw` as the canonical package identity and treat manifest evidence (`openclaw.plugin.json`, `dist/index.js`, and install command) as mandatory submission evidence.
  Rationale: Submission evidence must be reproducible and match what was already validated in the internal PR phase.
  Date/Author: 2026-02-17T01:58:00Z / sidmohan

## Outcomes & Retrospective

- A merged baseline exists in `DataFog/fogclaw` and the next step is organizational rather than technical.
- Submission-specific actions are now separated from detection hardening to reduce rework.

## Context and Orientation

This repository (`/Users/sidmohan/Projects/datafog/fogclaw`) currently contains the source plugin, build outputs configuration, and release evidence updates already merged into `main`.

Key runtime files are:

- `src/index.ts`: registers `before_agent_start`, `fogclaw_scan`, and `fogclaw_redact`.
- `openclaw.plugin.json`: plugin manifest used by OpenClaw to discover package entry.
- `package.json`: plugin identity (`name: @openclaw/fogclaw`) and `openclaw.extensions` entry.
- `README.md`: reviewer-facing install/evidence commands.
- `tests/plugin-smoke.test.ts`: non-mocked contract test proving tool and hook behavior on a local mock API.
- `docs/plans/active/2026-02-16-feat-openclaw-official-submission-plan.md`: closed internal submission-readiness initiative details.

For this initiative, a repository branch/PR in an external OpenClaw repo is an **upstream submission route**: it is the place maintainers expect to receive plugin listing evidence. The core task is therefore documentation and submission logistics, not code edits.

## Milestones

### Milestone 1 - Confirm upstream submission target and acceptance expectations

At the end of this milestone, the team has identified exactly where and how OpenClaw accepts plugin submissions and what explicit checklist fields must be present in the upstream PR. This is required before drafting or opening the PR and avoids submitting to the wrong repo/branch.

### Milestone 2 - Prepare and open the upstream OpenClaw PR

At the end of this milestone, a ready-to-review OpenClaw PR exists with clear install and verification evidence. The PR body should include commands and expected output and point to this repo’s validated artifact path. The branch should contain only submission-facing changes if any are required, not detection logic changes.

### Milestone 3 - Maintain submission loop and close evidence handoff

At the end of this milestone, maintainer feedback is either satisfied or clearly documented as a blocker with exact follow-up action. This plan is updated with final PR status, and the submission outcome is captured for handoff or continue-work.

## Plan of Work

The work begins by confirming the exact OpenClaw repository path for official plugin submissions. If the target and PR template are known from existing policy, proceed to drafting the upstream PR body.

Draft a clean upstream submission body in local notes, ensuring it contains explicit commands and expected outputs from this repository’s `main` branch state. Include the merge commit reference and package identity evidence (`npm pkg get openclaw`, smoke import check from `dist/index.js`, and test status).

Open the upstream PR with a title and body that maps directly to maintainer review needs, avoiding implementation detail beyond what was already merged internally. If no additional documentation changes are required locally, this milestone should avoid new feature edits.

If maintainers request adjustments, isolate required follow-up work to the smallest possible set. If changes are non-code metadata tasks (for example: clarifying submission checklist text), prefer direct PR updates; if code/manifest edits are requested, open a follow-up branch with precise evidence.

## Concrete Steps

From repo root `/Users/sidmohan/Projects/datafog/fogclaw`:

1) Confirm local state and current merged commit hash:

    git log --oneline --max-count=3

Expected (example pattern):

    <hash> docs(plan): record PR merge completion on main
    3deae34 Merge pull request #1 from DataFog/openclaw-plugin-submission

2) Validate submission evidence locally one more time:

    npm test
    npm run build
    npm run test:plugin-smoke
    npm pkg get openclaw
    node - <<'NODE'
import plugin from './dist/index.js';
console.log(typeof plugin?.register === 'function', plugin?.id, plugin?.name);
NODE

Expected:

    Test and build complete successfully.
    npm pkg get openclaw returns { "extensions": ["./dist/index.js"] }.
    node import prints `true fogclaw FogClaw`.

3) Capture upstream submission inputs:

    openclaw-target=<openclaw-repo-path>
    openclaw-pr-title="feat(openclaw): official fogclaw plugin submission"

Then prepare PR body fields including: package ID, install command, evidence command list, and maintainer-impact notes.

4) Open upstream PR (using OpenClaw submission target):

    gh pr create --repo <openclaw-target> --base main --head <your-branch> --title "$openclaw-pr-title" --body-file <generated-body>

Expected:

    PR URL printed and state set to open.

5) Track review and iterate:

    gh pr view --repo <openclaw-target> --json number,title,state,reviewDecision,url,headRefName,baseRefName
    gh pr checks --repo <openclaw-target> --watch

Expected:

    Visible PR state and any required checks or maintainer feedback.

## Validation and Acceptance

A successful outcome for this initiative is: the upstream submission PR is open in the official OpenClaw path and contains reproducible proof that the plugin package is installable and contract-safe.

Specifically:

- The PR body includes install and verification commands from this merged plugin state.
- Evidence output matches this repo’s local validations (tests, build, smoke, package manifest path).
- No code changes are introduced without a maintainer-triggered request.
- If maintainer asks for changes, they are closed with a targeted follow-up and documented in this plan.

## Idempotence and Recovery

If the upstream target path is wrong, update only the submission-path variables and rerun steps 3–5. If review feedback requires code edits, apply minimal patches, rerun the same local evidence commands, and either amend or recreate the upstream PR as needed. If a submission PR was opened incorrectly, close it with a short note and open a corrected PR to avoid mixed evidence.

Rollback during this initiative is low-risk: no functional code changes are planned, so revert only submission artifacts or follow-up docs after maintainer feedback confirmation.

## Artifacts and Notes

- Internal merge evidence already exists in `docs/plans/active/2026-02-16-feat-openclaw-official-submission-plan.md` and includes:
  - `npm test` run success
  - `npm run build` success
  - `npm run test:plugin-smoke` pass
  - `npm pkg get openclaw` and import smoke output

- Open question that must be resolved before PR open:
  - Exact OpenClaw target repository and PR template requirements.

## Interfaces and Dependencies

No new runtime interfaces are introduced in this initiative. The key artifacts to reference are:

- `package.json` `openclaw.extensions` + `name`.
- `openclaw.plugin.json`.
- `README.md` evidence section (already updated).
- `tests/plugin-smoke.test.ts` for local behavioral proof.
- GitHub CLI (`gh`) for PR operations.

The external OpenClaw PR should reference these repo files without changing their internals in this phase.

## Pull Request

- pr: (populate after opening upstream submission PR)
- branch:
- commit:
- ci:

## Review Findings

(Reserved for `he-review`.)

## Verify/Release Decision

- decision: pending
- date:
- open findings by priority (if any): pending
- evidence:
- rollback:
- post-release checks:
- owner: sidmohan

## Revision Notes

- 2026-02-17T01:58:00Z: Initialized plan from spec `2026-02-17-feat-submit-fogclaw-to-openclaw`. Reason: transition intent to upstream OpenClaw submission as the remaining official readiness step.
