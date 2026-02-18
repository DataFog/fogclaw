---
slug: 2026-02-17-feat-e2e-recorded-baseline-test
status: intake-complete
date: 2026-02-17T19:30:00Z
owner: sidmohan
plan_mode: execution
spike_recommended: yes
priority: high
---

# feat: Add E2E recorded baseline test for FogClaw plugin

## Purpose / Big Picture

FogClaw has 215 unit and integration tests but zero end-to-end tests against a real OpenClaw instance. There is no automated way to verify that the plugin actually works when installed via npm, configured through the OpenClaw Dashboard UI, and exercised through real agent prompts. When a new feature ships (like the access request backlog), there is no regression gate that proves the full user experience still works.

After this initiative, a single command runs a fully automated E2E test sequence against a real local OpenClaw instance: install FogClaw from npm, configure it via the Dashboard UI, send prompts containing PII, verify redaction in all three scanning layers, exercise the access request backlog, and capture a video recording of the entire run. This recording serves as the baseline evidence artifact. Every future feature must pass this test before release.

## Scope

### In Scope

- Browser automation (Playwright) for the OpenClaw Dashboard UI: plugin installation, configuration, request review/resolution
- CLI automation for OpenClaw agent interactions: sending prompts, observing redacted output, triggering tool calls
- Video recording of the full E2E run via Playwright's built-in recording
- Test scenario covering all three scanning layers: `before_agent_start` (inbound prompt), `tool_result_persist` (file read), `message_sending` (outbound reply)
- Test scenario for the PII access request backlog: request, list, follow-up, approve, verify original text returned
- Test fixture: a sample file containing structured PII (email, SSN, phone, credit card, person name)
- CI integration: the E2E test can be triggered manually or as part of a release gate
- Evidence storage: video recordings saved to a predictable path for human review

### Boundaries

- **Not a replacement for unit tests.** The 215 existing unit/integration tests remain the primary fast-feedback loop. This E2E test is slower and complementary.
- **No headless-only mode in v1.** The video recording requires a visible browser. Headless optimization is a follow-up.
- **No automatic video diffing.** v1 relies on human review of recordings. Automated visual regression is a future enhancement.
- **No multi-platform testing.** v1 targets macOS local development only. Cross-platform CI (Linux containers) is a follow-up.
- **No OpenClaw upstream changes.** This test works with OpenClaw as-is. If the Dashboard API changes, the test adapts.

## Non-Goals

- Replacing existing unit/integration tests
- Automated visual diff or AI-powered video analysis
- Performance benchmarking or load testing
- Testing OpenClaw itself (we test FogClaw's behavior within OpenClaw)

## Risks

- **OpenClaw Dashboard UI instability.** If OpenClaw changes its UI, browser selectors break. Mitigation: use data-testid selectors where available, fall back to stable aria/role selectors.
- **GLiNER model download in E2E.** The ONNX model is ~1.4GB. E2E tests that trigger GLiNER will be slow on first run. Mitigation: pre-cache the model or test regex-only mode for speed, with a separate GLiNER-inclusive run.
- **OpenClaw installation/startup complexity.** Setting up a real local OpenClaw instance may require specific Node.js versions, API keys, or configuration. Mitigation: document prerequisites clearly; spike to validate the setup.
- **Flaky browser automation.** UI tests are inherently more fragile than API tests. Mitigation: explicit waits, retry logic, and clear failure diagnostics in recordings.

## Rollout

Ship as a new test target (`npm run test:e2e`) alongside existing tests. Initially triggered manually by developers before release. After the baseline is validated, integrate into the release gate (he-verify-release adds "E2E recording reviewed" as a checklist item).

## Validation and Acceptance Signals

- `npm run test:e2e` completes successfully against a running local OpenClaw instance with FogClaw installed
- A video recording (`.webm` or `.mp4`) is saved to `tests/e2e/recordings/` after each run
- The recording shows: plugin visible in Dashboard, PII in prompt being redacted, PII in file read being redacted, access request created and approved, original text revealed
- An agent can run the full E2E sequence autonomously using `agent-browser` for the Dashboard UI portions
- The test fails (non-zero exit) if any critical assertion fails (e.g., PII not redacted, tool not registered)

## Requirements

| ID | Priority | Requirement |
|---|---|---|
| R1 | critical | E2E test installs FogClaw into a real local OpenClaw instance and verifies plugin registration (3 hooks, 6 tools) |
| R2 | critical | Test sends a prompt containing PII (email, SSN, phone, credit card, person name) and verifies the agent receives redacted text, not originals |
| R3 | critical | Test triggers a file read containing PII and verifies `tool_result_persist` hook redacts the content before the agent sees it |
| R4 | critical | Test verifies `message_sending` hook redacts PII in outbound agent replies |
| R5 | high | Test exercises the full access request backlog cycle: request access to `[EMAIL_1]` → list pending → approve → verify original email returned |
| R6 | high | Full E2E run is video-recorded and saved to a predictable path (`tests/e2e/recordings/<timestamp>.webm`) |
| R7 | high | Test can be run by an agent autonomously (agent-browser for Dashboard, CLI automation for prompts) |
| R8 | medium | OpenClaw Dashboard UI interactions are automated via Playwright: navigate to plugin config, verify FogClaw is listed, verify settings |
| R9 | medium | Test includes a "before FogClaw" baseline run showing PII flowing through unprotected, followed by an "after FogClaw" run showing redaction |
| R10 | low | Test produces a structured summary (JSON or markdown) of pass/fail results alongside the video |

## Open Questions

- ~~**[spike]** **[Affects R1, R7, R8]** How does OpenClaw's local development setup work?~~ **RESOLVED**: Gateway runs as LaunchAgent on `ws://127.0.0.1:18789`, Dashboard at `http://127.0.0.1:18789/`, token auth via `openclaw dashboard --no-open`. CLI agent: `openclaw agent --session-id <id> --message <text> --json`. See spike findings.
- ~~**[spike]** **[Affects R7]** Can `agent-browser` drive the OpenClaw Dashboard reliably?~~ **RESOLVED**: Yes. No data-testid selectors, but text/role selectors are stable and descriptive (e.g., button "Send", link "Config", link "Chat"). Playwright automation confirmed working.
- **[planning]** **[Affects R6]** What video format and resolution? Playwright supports `.webm` natively. Should we transcode to `.mp4` for broader compatibility?
- **[decision]** **[Affects R9]** Should the "before/after" comparison be two separate test runs, or a single run that enables FogClaw mid-test?

## Success Criteria

- A developer can run `npm run test:e2e` and get a video recording proving FogClaw works end-to-end
- An agent can run the same test autonomously and produce the same evidence
- The recording serves as the release baseline: every new feature's verify-release step includes reviewing the E2E recording
- If PII leaks through any scanning layer, the test fails with a clear assertion error

## Constraints

- Must use Playwright (TypeScript, consistent with existing test stack)
- Must not require paid services or API keys beyond what OpenClaw already needs
- Video recordings must be under 60 seconds for typical runs (excluding GLiNER model download)
- Must work on macOS with Node.js 22+

## Tech Preferences

- **Browser automation**: Playwright (TypeScript API, built-in video recording, maintained by Microsoft)
- **CLI automation**: Node.js child_process or Playwright's terminal integration
- **Video format**: `.webm` (Playwright native) with optional `.mp4` transcode
- **Rationale**: Playwright is the industry standard for browser E2E, has first-class TypeScript support, and integrates with Vitest. Its built-in video recording eliminates the need for external screen capture tools.

## Priority

- priority: high
- rationale: Without E2E tests, every release relies on manual verification that the plugin works in a real OpenClaw instance. As features accumulate (3 hooks, 6 tools, backlog workflow), manual testing becomes unsustainable. This is the foundation for autonomous agent-driven quality gates.

## Initial Milestone Candidates

- M1: **Spike — OpenClaw local setup and Dashboard automation feasibility.** Validate that we can start OpenClaw locally, access the Dashboard UI, and drive it with Playwright. Determine selectors, auth flow, and CLI interaction patterns. Output: spike findings doc with setup commands and selector inventory. Risk hotspot: OpenClaw Dashboard may not have stable selectors.

- M2: **Core E2E test — CLI + browser automation with video recording.** Implement the full test scenario: install plugin, configure, send PII prompts, verify redaction across all three layers, exercise backlog. Record video. Output: `tests/e2e/` directory with test files, fixtures, and recording output. Risk hotspot: flaky browser selectors, GLiNER model download latency.

- M3: **Agent autonomy + CI integration.** Ensure the test can be run by an agent via `agent-browser` skill. Add `npm run test:e2e` script. Document the E2E test as a required step in he-verify-release. Output: updated runbooks, CI workflow addition. Risk hotspot: agent-browser reliability with OpenClaw's specific UI.

## Handoff

Spike complete. All `[spike]` questions resolved — Dashboard automation is feasible, CLI agent automation works, plugin update is a single command. Proceed to `he-plan` with concrete knowledge from `docs/spikes/2026-02-17-feat-e2e-recorded-baseline-test-spike.md`.

## Revision Notes

- 2026-02-17T19:30:00Z: Initialized spec. E2E recorded baseline test for FogClaw against real OpenClaw instance. Spike recommended to validate Dashboard automation feasibility. Video recording chosen over screenshots for richer evidence with human review loop.
- 2026-02-17T20:00:00Z: Updated from spike findings. Closed `[spike]` open questions (R1/R7/R8). Dashboard uses text/role selectors (no data-testid). CLI agent returns structured JSON. Plugin update is `openclaw plugins update fogclaw`. Handoff updated to proceed to planning.
