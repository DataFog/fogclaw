---
slug: 2026-02-17-feat-e2e-recorded-baseline-test
status: active
phase: plan
plan_mode: execution
detail_level: more
priority: high
owner: sidmohan
---

# Add E2E Recorded Baseline Test for FogClaw Plugin

This Plan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This document must be maintained in accordance with `docs/PLANS.md`.

## Purpose / Big Picture

FogClaw has 149+ unit and integration tests but zero end-to-end tests against a real OpenClaw instance. After this change, running `npm run test:e2e` launches an automated test that sends PII-laden prompts through a live OpenClaw gateway, verifies that FogClaw's three scanning layers redact the PII, exercises the access request backlog workflow, captures screenshots at each critical step, and saves a video recording of the entire browser session. The recording becomes the release baseline — every new feature must pass this test before shipping.

A developer sees this working by running `npm run test:e2e` and observing: (1) all assertions pass, (2) a video file appears at `tests/e2e/recordings/`, and (3) screenshots appear at `tests/e2e/screenshots/`. An agent can run the same test autonomously and produce the same evidence.

## Progress

- [ ] (2026-02-17) P1 [M1]: Install Playwright and `@playwright/test` as devDependencies
- [ ] (2026-02-17) P2 [M1]: Create `tests/e2e/` directory structure with fixtures and config
- [ ] (2026-02-17) P3 [M1]: Add `test:e2e` npm script to `package.json`
- [ ] (2026-02-17) P4 [M1]: Create PII fixture file at `tests/e2e/fixtures/pii-sample.txt`
- [ ] (2026-02-17) P5 [M1]: Create Playwright config at `tests/e2e/playwright.config.ts`
- [ ] (2026-02-17) P6 [M2]: Write E2E test for plugin update and verification
- [ ] (2026-02-17) P7 [M2]: Write E2E test for `before_agent_start` hook — send PII prompt, assert redaction tokens in response
- [ ] (2026-02-17) P8 [M2]: Write E2E test for `tool_result_persist` hook — trigger file read containing PII, assert redaction
- [ ] (2026-02-17) P9 [M2]: Write E2E test for `message_sending` hook — verify outbound message redaction
- [ ] (2026-02-17) P10 [M3]: Write E2E test for access request backlog cycle (request → list → approve → verify original)
- [ ] (2026-02-17) P11 [M4]: Add Playwright browser automation for Dashboard visual evidence
- [ ] (2026-02-17) P12 [M4]: Add video recording configuration and screenshot capture at key steps
- [ ] (2026-02-17) P13 [M4]: Validate full E2E suite runs end-to-end with video output

## Surprises & Discoveries

(None yet — will be populated during implementation.)

## Decision Log

- Decision: Hybrid CLI + browser architecture. CLI (`openclaw agent --json`) handles prompt/response assertions; Playwright handles Dashboard screenshots and video recording.
  Rationale: CLI is faster, returns structured JSON, and avoids browser flakiness for the critical assertion path. Browser adds visual evidence.
  Date/Author: 2026-02-17 / sidmohan

- Decision: Use `@playwright/test` (not Vitest + Playwright) for the E2E test suite.
  Rationale: `@playwright/test` has built-in video recording, screenshot capture, parallel workers, and retries. Vitest doesn't natively support these features. The E2E tests live in a separate `tests/e2e/` directory with their own Playwright config, keeping them independent from the unit test suite.
  Date/Author: 2026-02-17 / sidmohan

- Decision: Text/role-based Playwright selectors (not data-testid).
  Rationale: OpenClaw Dashboard has no data-testid convention. Spike confirmed text labels like button "Send", link "Config" are stable and descriptive.
  Date/Author: 2026-02-17 / sidmohan

## Outcomes & Retrospective

(Will be populated at completion.)

## Context and Orientation

FogClaw is a TypeScript OpenClaw plugin at `/Users/sidmohan/Projects/datafog/fogclaw`. It scans messages for personally identifiable information (PII) and redacts it before the AI agent sees or responds with it. It uses two detection engines: a regex engine (fast, synchronous, detects emails/phones/SSNs/credit cards) and a GLiNER engine (zero-shot NER via ONNX, detects arbitrary entity types).

The plugin registers three hooks with OpenClaw — these are the "scanning layers" that intercept messages at different points:

1. **`before_agent_start`** — scans the user's inbound prompt before the agent processes it. Async. Uses both regex and GLiNER engines. Defined in `src/index.ts`.
2. **`tool_result_persist`** — scans tool outputs (file reads, API responses) before they enter the session transcript. Synchronous, regex-only for speed. Defined in `src/tool-result-handler.ts`.
3. **`message_sending`** — scans the agent's outbound reply before it reaches external channels (Telegram, WhatsApp, etc.). Async, uses both engines. Defined in `src/message-sending-handler.ts`.

The plugin also registers six tools: `fogclaw_scan` (detect PII), `fogclaw_preview` (preview policy without side effects), `fogclaw_redact` (redact PII and return mapping), `fogclaw_request_access` (request access to a redacted value), `fogclaw_requests` (list pending requests), and `fogclaw_resolve` (approve/deny access requests).

Redaction uses token strategy by default: `[EMAIL_1]`, `[SSN_1]`, `[PHONE_1]`, etc. The `RedactionMapStore` in `src/backlog.ts` stores placeholder-to-original mappings so approved access requests can reveal the original text.

OpenClaw is the agent orchestration platform that hosts FogClaw. It runs a WebSocket gateway at `ws://127.0.0.1:18789` with a Dashboard UI at `http://127.0.0.1:18789/`. Authentication uses a hash-token in the URL fragment: `http://127.0.0.1:18789/#token=<hex>`. The CLI command `openclaw dashboard --no-open` prints the authenticated URL.

The CLI command `openclaw agent --session-id "<uuid>" --message "<prompt>" --json` sends a prompt to the agent and returns a structured JSON response containing the agent's reply text, tool call details, usage stats, and metadata. `openclaw sessions --json` lists active sessions with their UUIDs.

FogClaw is currently installed at `~/.openclaw/extensions/fogclaw/` at version 0.1.6. Running `openclaw plugins update fogclaw` updates it to the latest npm version (0.3.0). After updating, a gateway restart may be needed for the new tools to register.

The existing test suite uses Vitest (`npm run test`) with tests in `tests/`. The E2E tests will use `@playwright/test` in a separate `tests/e2e/` directory with their own config and npm script (`npm run test:e2e`).

Key source files:
- `src/index.ts` — plugin entry point, exports `fogclaw` plugin with `register(api)` function
- `src/scanner.ts` — `Scanner` class (async, regex + GLiNER)
- `src/redactor.ts` — `redact()` function (synchronous)
- `src/backlog.ts` — `RedactionMapStore`, `BacklogStore`
- `src/backlog-tools.ts` — `fogclaw_request_access`, `fogclaw_requests`, `fogclaw_resolve` tool handlers
- `src/tool-result-handler.ts` — `tool_result_persist` hook handler
- `src/message-sending-handler.ts` — `message_sending` hook handler
- `src/engines/regex.ts` — regex patterns for EMAIL, PHONE, SSN, CREDIT_CARD, IP_ADDRESS, DATE, ZIP_CODE
- `package.json` — scripts, dependencies, version 0.3.0
- `openclaw.plugin.json` — plugin manifest with config schema and UI hints

Reference documents:
- Spec: `docs/specs/2026-02-17-feat-e2e-recorded-baseline-test-spec.md`
- Spike: `docs/spikes/2026-02-17-feat-e2e-recorded-baseline-test-spike.md`

## Milestones

### Milestone 1: Test Infrastructure Setup

This milestone creates the foundation for E2E testing. At the end, the `tests/e2e/` directory exists with a Playwright config, a PII fixture file, and a working `npm run test:e2e` script that runs (and passes with a trivial placeholder test). No actual E2E logic yet — just the skeleton.

The PII fixture file contains a realistic paragraph with multiple PII types that FogClaw's regex engine detects: an email address, an SSN, a phone number, and a credit card number. This file serves as the input for the `tool_result_persist` hook test — the agent will be asked to read this file, and FogClaw should redact the PII before it enters the session.

Verification: Run `npm run test:e2e` from the project root. Expect Playwright to start, execute the placeholder test, and exit with code 0. The `tests/e2e/recordings/` directory should be created (empty, since video is configured but no browser test runs yet).

### Milestone 2: Core CLI-Driven E2E Tests (Three Scanning Layers)

This milestone implements the three critical E2E assertions that prove FogClaw's scanning layers work against a real OpenClaw instance. All three tests use `openclaw agent --json` to send prompts and parse responses programmatically. No browser automation yet.

The test flow for each scanning layer:

For **`before_agent_start`** (inbound prompt scanning): Send a prompt containing raw PII (e.g., "Contact John Smith at john.smith@example.com, SSN 123-45-6789, phone 555-867-5309"). Parse the JSON response. The agent should receive and respond with redacted tokens (`[EMAIL_1]`, `[SSN_1]`, `[PHONE_1]`) — the original PII values should not appear in the response text.

For **`tool_result_persist`** (file read scanning): Send a prompt asking the agent to read the PII fixture file at a known path. The agent uses the `read` tool to access the file. FogClaw's `tool_result_persist` hook intercepts the tool result and redacts PII before the agent sees it. Parse the JSON response and verify the agent's reply references redaction tokens, not the original PII.

For **`message_sending`** (outbound reply scanning): This layer is harder to assert from CLI alone because it intercepts the reply before delivery to external channels (Telegram, WhatsApp). The test verifies this by checking that the agent's reply text in the JSON response does not contain raw PII. If the agent was asked to repeat specific PII and FogClaw is working, the reply should contain redaction tokens instead.

Before running these tests, the suite ensures FogClaw is updated to v0.3.0 and verifies it is loaded with all 6 tools registered. This is a setup step that runs once in `beforeAll`.

Verification: Run `npm run test:e2e`. All three scanning-layer tests pass. The test output shows the JSON responses from OpenClaw with redaction tokens present and raw PII absent.

### Milestone 3: Access Request Backlog E2E

This milestone tests the full backlog workflow that was added in FogClaw v0.3.0. The test sends a prompt containing PII, then uses the agent to exercise the three backlog tools in sequence:

1. **Request access**: Ask the agent to use `fogclaw_request_access` for a specific redacted placeholder (e.g., `[EMAIL_1]`).
2. **List pending**: Ask the agent to use `fogclaw_requests` and verify the request appears in the pending list.
3. **Resolve (approve)**: Ask the agent to use `fogclaw_resolve` to approve the request.
4. **Verify original returned**: After approval, verify the agent's response includes the original PII text that was previously redacted.

This test proves the entire redaction-request-approval lifecycle works end-to-end. It depends on the `RedactionMapStore` capturing placeholder-to-original mappings during the scanning-layer tests, so it must run in sequence after the scanning tests within the same session.

Verification: Run `npm run test:e2e`. The backlog test passes, showing a successful request → list → approve → reveal cycle.

### Milestone 4: Browser Visual Evidence and Video Recording

This milestone adds Playwright browser automation to capture visual evidence of FogClaw working in the OpenClaw Dashboard. The browser tests run after the CLI tests complete, opening the Dashboard to screenshot the results.

The browser captures:
1. **Dashboard overview** — screenshot showing the OpenClaw Dashboard is accessible and FogClaw is loaded.
2. **Chat view** — screenshot showing the chat session with redaction tokens visible in the conversation (the CLI tests already sent PII prompts, so the chat history should show `[EMAIL_1]`, `[SSN_1]`, etc.).
3. **Full session video** — Playwright records the browser session from the moment it opens the Dashboard through navigation to the chat page. The video is saved to `tests/e2e/recordings/<timestamp>.webm`.

Screenshots are saved to `tests/e2e/screenshots/` with descriptive filenames (e.g., `dashboard-overview.png`, `chat-redaction-evidence.png`).

Verification: Run `npm run test:e2e`. After all tests complete, check `tests/e2e/recordings/` for a `.webm` video file and `tests/e2e/screenshots/` for `.png` screenshot files. Open the video — it should show the Dashboard with FogClaw evidence visible.

## Plan of Work

The work proceeds in four phases matching the milestones.

First, install `@playwright/test` as a devDependency. This package provides the Playwright test runner, browser automation APIs, and built-in video/screenshot support. Create the `tests/e2e/` directory with subdirectories for fixtures, recordings, and screenshots. Write a `playwright.config.ts` that configures Chromium, video recording to `tests/e2e/recordings/`, and screenshot capture. Add a `test:e2e` script to `package.json` that runs `npx playwright test --config tests/e2e/playwright.config.ts`. Create the PII fixture file with sample data containing email, SSN, phone, and credit card.

Second, write the core E2E test file at `tests/e2e/fogclaw-e2e.spec.ts`. This file uses `@playwright/test`'s `test` function but primarily calls `openclaw` CLI commands via Node.js `child_process.execSync` (or Playwright's `test.step` with shell execution). The `beforeAll` hook runs `openclaw plugins update fogclaw` and `openclaw plugins info fogclaw` to ensure v0.3.0 is loaded with 6 tools. Each test sends a prompt via `openclaw agent --session-id <id> --message <text> --json`, parses the JSON response, and asserts on the presence of redaction tokens and absence of raw PII.

Third, add the backlog workflow test as additional test cases in the same spec file. These tests run sequentially after the scanning-layer tests within the same session, so the `RedactionMapStore` has mappings from earlier prompts.

Fourth, add browser automation tests in the same or a separate spec file. These use Playwright's `page.goto()` to open the Dashboard URL (obtained from `openclaw dashboard --no-open`), navigate to the chat page, and capture screenshots. The Playwright config's `video: 'on'` setting handles video recording automatically.

The `.gitignore` at `tests/e2e/recordings/` and `tests/e2e/screenshots/` ensures generated evidence artifacts are not committed to the repo but are available locally after each run.

## Concrete Steps

All commands run from the project root `/Users/sidmohan/Projects/datafog/fogclaw` unless otherwise noted.

**M1: Infrastructure setup**

Install Playwright:

    npm install --save-dev @playwright/test

Create directory structure:

    mkdir -p tests/e2e/fixtures tests/e2e/recordings tests/e2e/screenshots

Add `.gitkeep` files to `recordings/` and `screenshots/` so the directories are tracked but contents are ignored. Add a `.gitignore` in `tests/e2e/` to ignore `recordings/*.webm`, `screenshots/*.png`, and `test-results/`.

Create the PII fixture at `tests/e2e/fixtures/pii-sample.txt` with content containing at least: an email (`john.smith@example.com`), an SSN (`123-45-6789`), a phone number (`(555) 867-5309`), and a credit card number (`4111-1111-1111-1111`).

Create the Playwright config at `tests/e2e/playwright.config.ts`. Configure: single Chromium project, `video: 'on'` in `use`, screenshot `'on'`, output dir `tests/e2e/test-results`, timeout of 120 seconds per test (agent responses can be slow).

Add to `package.json` scripts:

    "test:e2e": "npx playwright test --config tests/e2e/playwright.config.ts"

Expected output of `npm run test:e2e` after M1 with a placeholder test:

    Running 1 test using 1 worker
      ✓ placeholder test
    1 passed

**M2: Core CLI-driven tests**

Create `tests/e2e/fogclaw-e2e.spec.ts`. In `beforeAll`:
1. Run `openclaw plugins update fogclaw` via `execSync`.
2. Run `openclaw plugins info fogclaw` and parse output to verify version is `0.3.0` and tools include all 6.
3. Run `openclaw sessions --json` to get the session ID.

Test "before_agent_start redacts PII in inbound prompt":
1. Run `openclaw agent --session-id <id> --message "Contact John Smith at john.smith@example.com, SSN 123-45-6789" --json`.
2. Parse JSON response.
3. Assert `result.payloads[0].text` contains `[EMAIL_1]` or `[SSN_1]`.
4. Assert `result.payloads[0].text` does NOT contain `john.smith@example.com` or `123-45-6789`.

Test "tool_result_persist redacts PII in file reads":
1. Copy the PII fixture to a known location in the agent's workspace (or use an absolute path the agent can access).
2. Run `openclaw agent --session-id <id> --message "Read the file at <path> and tell me what it contains" --json`.
3. Parse JSON response.
4. Assert the response text contains redaction tokens and does NOT contain raw PII values.

Test "message_sending redacts PII in outbound replies":
1. Run `openclaw agent --session-id <id> --message "Please repeat exactly: my email is alice@widgets.io and SSN is 987-65-4321" --json`.
2. Parse JSON response.
3. Assert the response text does NOT contain `alice@widgets.io` or `987-65-4321`.

Expected output after M2:

    Running 4 tests using 1 worker
      ✓ setup: FogClaw v0.3.0 loaded with 6 tools
      ✓ before_agent_start redacts PII in inbound prompt
      ✓ tool_result_persist redacts PII in file reads
      ✓ message_sending redacts PII in outbound replies
    4 passed

**M3: Backlog workflow test**

Add sequential tests after the scanning tests:

Test "access request backlog cycle":
1. Run `openclaw agent --session-id <id> --message "Use fogclaw_request_access to request access to [EMAIL_1]" --json`.
2. Assert response acknowledges the request.
3. Run `openclaw agent --session-id <id> --message "Use fogclaw_requests to list pending access requests" --json`.
4. Assert response shows a pending request for `[EMAIL_1]`.
5. Run `openclaw agent --session-id <id> --message "Use fogclaw_resolve to approve the request for [EMAIL_1]" --json`.
6. Assert response includes the original email address that was previously redacted.

Expected output after M3:

    Running 5 tests using 1 worker
      ✓ setup: FogClaw v0.3.0 loaded with 6 tools
      ✓ before_agent_start redacts PII in inbound prompt
      ✓ tool_result_persist redacts PII in file reads
      ✓ message_sending redacts PII in outbound replies
      ✓ access request backlog cycle
    5 passed

**M4: Browser evidence and video**

Add browser tests (can be in a separate spec file or appended):

Test "Dashboard shows FogClaw evidence":
1. Get Dashboard URL: `openclaw dashboard --no-open` → parse URL.
2. `page.goto(dashboardUrl)` → wait for network idle.
3. Screenshot: `page.screenshot({ path: 'tests/e2e/screenshots/dashboard-overview.png' })`.
4. Navigate to Chat: `page.getByRole('link', { name: 'Chat' }).click()`.
5. Wait for chat to load.
6. Screenshot: `page.screenshot({ path: 'tests/e2e/screenshots/chat-redaction-evidence.png' })`.
7. Assert the page contains visible text with redaction tokens (e.g., `[EMAIL_1]`).

Video recording happens automatically via the Playwright config `video: 'on'` setting. After all tests complete, video files are in `tests/e2e/test-results/` and copied to `tests/e2e/recordings/` with a timestamp name by a `afterAll` hook.

Expected output after M4 (final):

    Running 6 tests using 1 worker
      ✓ setup: FogClaw v0.3.0 loaded with 6 tools
      ✓ before_agent_start redacts PII in inbound prompt
      ✓ tool_result_persist redacts PII in file reads
      ✓ message_sending redacts PII in outbound replies
      ✓ access request backlog cycle
      ✓ Dashboard shows FogClaw evidence
    6 passed

    Evidence saved:
      tests/e2e/screenshots/dashboard-overview.png
      tests/e2e/screenshots/chat-redaction-evidence.png
      tests/e2e/recordings/2026-02-17T20-30-00.webm

## Validation and Acceptance

Run from the project root:

    npm run test:e2e

All 6 tests pass. Verify:

1. Exit code is 0.
2. `tests/e2e/screenshots/dashboard-overview.png` exists and shows the OpenClaw Dashboard.
3. `tests/e2e/screenshots/chat-redaction-evidence.png` exists and shows redaction tokens in the chat.
4. `tests/e2e/recordings/` contains a `.webm` video file. Open it — it should show Dashboard navigation from overview to chat with redaction evidence visible.

To verify scanning assertion correctness, run the E2E test with `--debug` to see the JSON responses:

    npx playwright test --config tests/e2e/playwright.config.ts --debug

The JSON responses from `openclaw agent` should contain redaction tokens (`[EMAIL_1]`, `[SSN_1]`, `[PHONE_1]`) and should NOT contain raw PII values (`john.smith@example.com`, `123-45-6789`, `555-867-5309`).

The existing unit test suite must still pass:

    npm run test

Expect 149+ tests passed, 0 failed.

## Idempotence and Recovery

Every step is safe to re-run:

- `npm install --save-dev @playwright/test` is idempotent — reinstalls if present, installs if missing.
- `openclaw plugins update fogclaw` is idempotent — no-ops if already at the latest version.
- The E2E tests create a new session or reuse an existing one. If a test fails midway, re-running starts fresh assertions against the same or a new session.
- Video and screenshot files are overwritten on each run (timestamped filenames avoid conflicts).
- If the OpenClaw gateway is not running, the E2E tests fail with a clear connection error. Fix: start the gateway with `openclaw gateway` and re-run.
- If Playwright browsers are not installed, run `npx playwright install chromium` and re-run.

To clean up and start fresh:

    rm -rf tests/e2e/recordings/* tests/e2e/screenshots/* tests/e2e/test-results/

## Artifacts and Notes

(Will be populated during implementation with evidence snippets.)

## Interfaces and Dependencies

New devDependency: `@playwright/test` (latest version, provides `test`, `expect`, `Page`, `BrowserContext` APIs).

External dependencies (must be running):
- OpenClaw gateway at `ws://127.0.0.1:18789`
- OpenClaw Dashboard at `http://127.0.0.1:18789/`
- FogClaw plugin v0.3.0 installed in `~/.openclaw/extensions/fogclaw/`

New files created by this plan:
- `tests/e2e/playwright.config.ts` — Playwright test configuration
- `tests/e2e/fogclaw-e2e.spec.ts` — main E2E test file
- `tests/e2e/fixtures/pii-sample.txt` — PII fixture for file-read testing
- `tests/e2e/recordings/.gitkeep` — directory placeholder
- `tests/e2e/screenshots/.gitkeep` — directory placeholder
- `tests/e2e/.gitignore` — ignore generated evidence artifacts

Modified files:
- `package.json` — add `test:e2e` script and `@playwright/test` devDependency

CLI tools used in tests (from OpenClaw, not npm):
- `openclaw agent --session-id <id> --message <text> --json` — send prompts, get JSON responses
- `openclaw sessions --json` — list sessions with UUIDs
- `openclaw plugins update fogclaw` — update plugin to latest
- `openclaw plugins info fogclaw` — verify plugin version and tools
- `openclaw dashboard --no-open` — get authenticated Dashboard URL

## Pull Request

- pr: (pending)
- branch: (pending)
- commit: (pending)
- ci: (pending)

## Review Findings

(Populated by `he-review`.)

## Verify/Release Decision

(Populated by `he-verify-release`.)

## Revision Notes

- 2026-02-17T20:15:00Z: Initial plan draft. 4 milestones: infrastructure setup, CLI-driven scanning layer tests, backlog workflow test, browser visual evidence with video recording. Hybrid CLI + browser architecture based on spike findings.
