---
title: "Submitting a third-party plugin for official OpenClaw listing"
called_from:
  - he-learn
  - he-implement
  - he-verify-release
read_when:
  - You need to submit an external plugin package for official OpenClaw intake
  - You are preparing a reviewable PR to openclaw/openclaw for plugin visibility
---

# Submitting a third-party plugin for official OpenClaw listing

This repository is the third-party plugin source, while OpenClaw core intake is handled through `openclaw/openclaw`. Use this checklist when promoting a plugin from an external repo to official listing visibility.

## Scope

Apply this process for a plugin that is already validated in its own repo and needs official OpenClaw documentation/intake handling.

## Prerequisites (in plugin repo)

- Plugin manifest and metadata validated (`openclaw.plugin.json`, `package.json#openclaw.extensions`, `package.json#name`).
- Plugin smoke/contract checks pass.
- Runtime evidence available for plugin load and behavior.

## Prepare upstream fork PR

Because `openclaw/openclaw` generally expects cross-repo PRs from a fork, use this sequence unless the plugin repo is itself an existing fork:

1. Fork `openclaw/openclaw` in your GitHub account.
2. Create a branch in the fork (for example `openclaw-fogclaw-submission`).
3. Copy only official-listing artifacts from the plugin source repo (typically one or more docs/pages under `docs/plugins/`).
4. Open PR from the fork branch to `openclaw/openclaw` (base `main`).

Do **not** include unrelated code changes in this PR unless required by maintainer feedback.

## Evidence to include in PR body

Use a compact, reproducible evidence block:

- `npm test`
- `npm run build` or `pnpm build` (repo-specific)
- `npm run test:plugin-smoke`
- `npm pkg get openclaw`
- Node import smoke from `dist/index.js`

## Useful PR body sections

- Summary and impact
- What changed and what did not change (scope boundary)
- Security impact
- Commands + expected outputs
- Human verification
- Compatibility/rollback

## Review-time guardrails

- Verify PR template expectations from `.github/pull_request_template.md` in upstream repo.
- Keep PR title clear and scoped to official-listing changes.
- Track maintainer feedback separately; only apply plugin code changes if explicitly requested.

## Post-creation tracking

- Record PR URL, branch/commit, and CI check status in the active initiative plan.
- Keep plugin evidence/release status in sync with maintainer review and upstream merge checks.
- If `@openclaw/<plugin>` is not yet visible in npm, record that as an explicit follow-up item rather than conflating it with code issues.
