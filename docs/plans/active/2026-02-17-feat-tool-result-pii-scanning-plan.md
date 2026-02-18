---
slug: 2026-02-17-feat-tool-result-pii-scanning
status: active
phase: plan
plan_mode: lightweight
detail_level: more
priority: high
owner: sidmohan
---

# Add PII scanning to tool results via tool_result_persist hook

This Plan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, `Outcomes & Retrospective`, and `Revision Notes` current as work proceeds.

This plan must be maintained in accordance with `docs/PLANS.md`.

## Purpose / Big Picture

FogClaw currently scans only the user prompt for PII. When an agent reads a file, fetches a web page, or queries an API, the tool result flows into the session transcript unscanned. After this change, FogClaw will intercept every tool result via OpenClaw's `tool_result_persist` hook and redact PII spans (SSN, email, phone, credit card, IP address, date, zip code) before the content is persisted to the session. The agent will see `[SSN_1]` instead of `123-45-6789`.

To verify it works: install FogClaw in OpenClaw, ask the agent to read a file that contains a phone number and an SSN, then inspect the session transcript. The raw values should be replaced with redaction tokens.

## Progress

- [x] (2026-02-17T17:28:00Z) P1 [M1] Create `src/extract.ts` with `extractText` and `replaceText` functions
- [x] (2026-02-17T17:28:00Z) P2 [M1] Create `tests/extract.test.ts` covering string content, content block arrays, nested structures, empty/null, and non-text types
- [x] (2026-02-17T17:28:00Z) P3 [M1] All extract tests pass — 27 tests passed
- [x] (2026-02-17T17:29:00Z) P4 [M2] Create `src/tool-result-handler.ts` with synchronous `createToolResultHandler` factory
- [x] (2026-02-17T17:29:00Z) P5 [M2] Create `tests/tool-result-handler.test.ts` covering scanning, redaction, audit logging, allowlist, and edge cases
- [x] (2026-02-17T17:29:00Z) P6 [M2] Register `tool_result_persist` hook in `src/index.ts`
- [x] (2026-02-17T17:29:00Z) P7 [M2] All tool-result-handler tests pass — 21 tests passed
- [x] (2026-02-17T17:30:00Z) P8 [M3] Extend `tests/plugin-smoke.test.ts` with `tool_result_persist` hook registration and transformation tests
- [x] (2026-02-17T17:30:00Z) P9 [M3] Full test suite passes — 149 tests, 8 files, 0 failures
- [x] (2026-02-17T17:30:00Z) P10 [M3] Commit all changes — 3b7564f

## Surprises & Discoveries

- Observation: The Scanner class's `regexEngine` field is private, so we instantiated a fresh `RegexEngine` directly in `register()` rather than exposing the Scanner's internal instance.
  Evidence: `const toolResultRegex = new RegexEngine();` in src/index.ts. RegexEngine is stateless (only uses pattern matching), so a separate instance is functionally identical.

- Observation: The null byte separator approach for multi-block content works cleanly — regex PII patterns never match across `\0` boundaries.
  Evidence: 27 extract tests pass including multi-block scenarios with mixed text/image blocks.

## Decision Log

- Decision: Use RegexEngine and redact() directly instead of going through Scanner
  Rationale: Scanner.scan() is declared `async` (returns a Promise) even when GLiNER is disabled, because the method signature is `async scan(...)`. The `tool_result_persist` hook in OpenClaw is synchronous-only — if a handler returns a Promise, OpenClaw logs a warning and ignores the result. RegexEngine.scan() and redact() are both fully synchronous, so we call them directly.
  Date/Author: 2026-02-17, sidmohan

- Decision: All guardrail modes (redact, block, warn) produce span-level redaction in tool results
  Rationale: Unlike `before_agent_start` where "block" can only prepend a warning context, `tool_result_persist` actually transforms the message. Span-level redaction is the safest behavior — it removes the PII while preserving surrounding context that the agent needs to reason. Replacing the entire tool result would destroy useful non-PII information.
  Date/Author: 2026-02-17, sidmohan

- Decision: Reuse existing FogClaw config (guardrail_mode, entityActions, redactStrategy, allowlist)
  Rationale: Users should have one mental model — "I set SSN to block, and it's blocked everywhere." Adding a separate config section for tool results would create inconsistency and confusion. If a user needs different behavior per-surface, that can be a future initiative.
  Date/Author: 2026-02-17, sidmohan

## Outcomes & Retrospective

All three milestones completed. FogClaw now scans tool results for PII via `tool_result_persist` hook using the regex engine synchronously. 149 tests pass across 8 test files with zero regressions. New modules: `src/extract.ts` (text extraction/replacement), `src/tool-result-handler.ts` (synchronous handler factory). The implementation adds 52 new tests (27 extract + 21 handler + 4 smoke).

## Context and Orientation

FogClaw is an OpenClaw plugin that detects and redacts PII in agent conversations. The plugin lives at `/Users/sidmohan/Projects/datafog/fogclaw`.

Key files relevant to this plan:

- `src/index.ts` — Plugin entry point. Exports a plugin object with `id`, `name`, and `register(api)`. The `register` function loads config, initializes the Scanner, registers the `before_agent_start` hook, and registers three tools (`fogclaw_scan`, `fogclaw_preview`, `fogclaw_redact`). This is where we will add the `tool_result_persist` hook registration.

- `src/engines/regex.ts` — The RegexEngine class. Has a `scan(text: string): Entity[]` method that is fully synchronous. Detects 7 PII types: EMAIL, PHONE, SSN, CREDIT_CARD, IP_ADDRESS, DATE, ZIP_CODE. Each match gets confidence 1.0 and source "regex".

- `src/redactor.ts` — The `redact(text, entities, strategy)` function. Fully synchronous. Takes text, detected entities, and a strategy ("token", "mask", or "hash"). Returns `{ redacted_text, mapping, entities }`. Sorts entities by position descending and replaces from end to start to avoid offset corruption.

- `src/types.ts` — Type definitions including `Entity`, `RedactStrategy`, `GuardrailAction`, `FogClawConfig`, `ScanResult`, `RedactResult`. Also has `canonicalType()` for normalizing entity labels and `CANONICAL_TYPE_MAP`.

- `src/config.ts` — `loadConfig(raw)` merges defaults with overrides and validates. The `FogClawConfig` type includes `guardrail_mode`, `entityActions`, `redactStrategy`, `allowlist`, `auditEnabled`, and others.

- `src/scanner.ts` — The `Scanner` class that orchestrates regex + GLiNER engines. Its `scan()` method is `async` (cannot be used in synchronous hooks). Includes `filterByPolicy()` which applies allowlist filtering — we will need to replicate or extract this logic for the synchronous path.

- `tests/plugin-smoke.test.ts` — Integration tests for the plugin contract. Creates a mock `api` object with `pluginConfig`, `logger`, `on()`, and `registerTool()`. Tests verify hook registration and tool behavior.

OpenClaw's `tool_result_persist` hook contract (from OpenClaw's `src/plugins/types.ts`):

- **Event type**: `{ toolName?: string, toolCallId?: string, message: AgentMessage, isSynthetic?: boolean }`
- **Context type**: `{ agentId?: string, sessionKey?: string, toolName?: string, toolCallId?: string }`
- **Result type**: `{ message?: AgentMessage }` — return a modified message, or void to leave it unchanged
- **Execution**: Synchronous only. If a handler returns a Promise, OpenClaw warns and ignores the result.
- **Where it runs**: Inside `SessionManager.appendMessage`, via `session-tool-result-guard-wrapper.ts`. Fires on every tool result before it is written to the session transcript.

The `AgentMessage` type varies by provider and tool, but tool results typically contain text content in one of these shapes:
- A plain string
- An array of content blocks, each with `{ type: "text", text: string }` or `{ type: "image", ... }`
- A structured object with a `content` property that is one of the above

## Milestones

### Milestone 1 — Text extraction and replacement utilities

After this milestone, FogClaw will have a utility module that can defensively extract all text from an `AgentMessage` tool result payload (regardless of its internal shape) and replace text spans within it. This is the foundation for scanning — you need to get text out of the message to scan it, and put redacted text back in.

The module will be at `src/extract.ts` with two exported functions:

- `extractText(message: unknown): string` — walks the message structure and concatenates all text content into a single string, with segment boundaries marked so offsets can be mapped back. Returns empty string for non-text content.
- `replaceText(message: unknown, redactedText: string): unknown` — takes the original message and a redacted version of the extracted text, and returns a new message object with text content replaced. Preserves the original structure (arrays of content blocks stay as arrays, etc.).

Verification: run `pnpm test tests/extract.test.ts` and see all tests pass, covering: plain string messages, content block arrays with mixed text/image blocks, nested content properties, empty/null messages, and messages with no text content.

### Milestone 2 — Synchronous tool result handler

After this milestone, FogClaw will have a handler factory at `src/tool-result-handler.ts` that produces a synchronous `tool_result_persist` handler, and the handler will be registered in `src/index.ts`.

The factory function `createToolResultHandler(config, regexEngine, logger?)` returns a function with the signature `(event, ctx) => { message } | void`. The handler:

1. Extracts text from `event.message` using `extractText`
2. Scans text with `regexEngine.scan(text)` (synchronous)
3. Filters results through the allowlist (replicating `Scanner.filterByPolicy` logic synchronously)
4. Determines per-entity action from `config.entityActions` with `config.guardrail_mode` as fallback
5. Redacts all actionable entities using `redact()` (synchronous)
6. Replaces text in the message using `replaceText`
7. Emits an audit log entry if `config.auditEnabled` and entities were found
8. Returns `{ message: modifiedMessage }` if any redaction occurred, or `void` if no PII found

The hook will be registered in `src/index.ts` inside the `register(api)` function, alongside the existing `before_agent_start` hook:

    api.on("tool_result_persist", handler);

Verification: run `pnpm test tests/tool-result-handler.test.ts` and see all tests pass, covering: SSN redaction in tool results, email/phone detection, allowlist exclusion, audit log emission, no-op when no PII found, and various message shapes.

### Milestone 3 — Integration smoke test

After this milestone, the existing plugin smoke test at `tests/plugin-smoke.test.ts` will be extended to verify that FogClaw registers a `tool_result_persist` hook and that invoking it with a tool result containing PII produces a transformed message.

Verification: run `pnpm test` (full suite) and see all tests pass with no regressions.

## Plan of Work

The work proceeds in three sequential steps. Each builds on the previous.

**Step 1: Text extraction module.** Create `src/extract.ts` with `extractText` and `replaceText`. The `extractText` function should handle these `AgentMessage` shapes: (a) the message itself is a string, (b) the message has a `content` property that is a string, (c) the message has a `content` property that is an array of blocks where each text block has `{ type: "text", text: string }`. For arrays, concatenate text blocks with a newline separator and track the offset ranges so `replaceText` can map redacted text back to the correct blocks. Create `tests/extract.test.ts` with tests for each shape plus edge cases (null, undefined, empty string, image-only content blocks, deeply nested content).

**Step 2: Tool result handler.** Create `src/tool-result-handler.ts`. Import `RegexEngine` from `src/engines/regex.ts`, `redact` from `src/redactor.ts`, `extractText`/`replaceText` from `src/extract.ts`, and types from `src/types.ts`. The factory function `createToolResultHandler` takes `FogClawConfig`, a `RegexEngine` instance, and an optional logger object. It returns a synchronous handler function. Inside the handler: extract text, scan, filter by allowlist (replicate the allowlist filtering logic from `Scanner.filterByPolicy` in `src/scanner.ts` — the filtering checks `config.allowlist.values`, `config.allowlist.patterns`, and `config.allowlist.entities`), determine actions, redact, replace, audit, return. Then update `src/index.ts` to call `createToolResultHandler` during registration and register the returned handler with `api.on("tool_result_persist", handler)`. Create `tests/tool-result-handler.test.ts`.

**Step 3: Smoke test extension.** In `tests/plugin-smoke.test.ts`, add a test that verifies `tool_result_persist` appears in the registered hooks after `register(api)` is called. Add a second test that invokes the hook handler with a mock tool result message containing an SSN, and asserts the returned message has the SSN replaced with a redaction token like `[SSN_1]`.

## Concrete Steps

All commands run from the FogClaw repo root at `/Users/sidmohan/Projects/datafog/fogclaw`.

After creating `src/extract.ts` and `tests/extract.test.ts`:

    pnpm test tests/extract.test.ts

Expected: all extract tests pass (text extraction from various message shapes, replacement, edge cases).

After creating `src/tool-result-handler.ts` and `tests/tool-result-handler.test.ts` and updating `src/index.ts`:

    pnpm test tests/tool-result-handler.test.ts

Expected: all handler tests pass (scanning, redaction, audit, allowlist, no-op cases).

After extending `tests/plugin-smoke.test.ts`:

    pnpm test tests/plugin-smoke.test.ts

Expected: all smoke tests pass, including new `tool_result_persist` tests.

Full suite validation:

    pnpm test

Expected: all tests pass, no regressions in existing `before_agent_start`, scanner, redactor, regex, or config tests.

Type check:

    pnpm lint

Expected: no type errors.

## Validation and Acceptance

The feature is complete when:

1. `pnpm test` passes with all existing tests plus new tests for extract, tool-result-handler, and extended smoke tests.
2. `pnpm lint` passes with no type errors.
3. A tool result message containing `"Call 555-123-4567 or email john@example.com"` is passed to the `tool_result_persist` handler and the returned message contains `"Call [PHONE_1] or email [EMAIL_1]"` (with token strategy) and the original values do not appear.
4. A tool result message containing no PII returns `void` (no modification).
5. An allowlisted value (e.g., `noreply@example.com`) is not redacted even when detected.
6. When `auditEnabled: true`, the logger receives an audit entry with `source: "tool_result"`, entity count, and labels but no raw PII values.

## Idempotence and Recovery

All changes are additive — new files (`src/extract.ts`, `src/tool-result-handler.ts`) and new tests. No existing files are modified except `src/index.ts` (adding a hook registration) and `tests/plugin-smoke.test.ts` (adding test cases).

If a step fails partway, delete the partially created files and restart from the milestone. No database migrations, no state files, no destructive operations.

Running `pnpm test` at any point is safe and idempotent.

## Artifacts and Notes

Full test suite output:

    ✓ tests/extract.test.ts (27 tests) 4ms
    ✓ tests/config.test.ts (6 tests) 4ms
    ✓ tests/redactor.test.ts (21 tests) 6ms
    ✓ tests/regex.test.ts (39 tests) 11ms
    ✓ tests/tool-result-handler.test.ts (21 tests) 10ms
    ✓ tests/gliner.test.ts (12 tests) 10ms
    ✓ tests/plugin-smoke.test.ts (8 tests) 9ms
    ✓ tests/scanner.test.ts (15 tests) 13ms

    Test Files  8 passed (8)
         Tests  149 passed (149)

Type check: `npx tsc --noEmit` — clean, no errors.

## Interfaces and Dependencies

**New module `src/extract.ts`:**

    export function extractText(message: unknown): string
    export function replaceText(message: unknown, redactedText: string): unknown

**New module `src/tool-result-handler.ts`:**

    import { RegexEngine } from "./engines/regex.js";
    import { FogClawConfig } from "./types.js";

    interface Logger {
      info(msg: string): void;
      warn(msg: string): void;
    }

    interface ToolResultPersistEvent {
      toolName?: string;
      toolCallId?: string;
      message: unknown;
      isSynthetic?: boolean;
    }

    interface ToolResultPersistContext {
      agentId?: string;
      sessionKey?: string;
      toolName?: string;
      toolCallId?: string;
    }

    export function createToolResultHandler(
      config: FogClawConfig,
      regexEngine: RegexEngine,
      logger?: Logger,
    ): (event: ToolResultPersistEvent, ctx: ToolResultPersistContext) =>
      { message: unknown } | void

**Modified `src/index.ts`:**

Inside the `register(api)` function, after the existing `before_agent_start` registration, add:

    const toolResultHandler = createToolResultHandler(config, scanner.regexEngine, api.logger);
    api.on("tool_result_persist", toolResultHandler);

This requires exposing `regexEngine` from the Scanner class (currently private). Either make it a public property or instantiate a separate RegexEngine in `register()`.

**No new dependencies.** All imports are from existing FogClaw modules or Node built-ins.

## Pull Request

Populated by `he-github`.

- pr:
- branch:
- commit:
- ci:

## Review Findings

Populated by `he-review`.

## Verify/Release Decision

Populated by `he-verify-release`.

- decision:
- date:
- open findings by priority (if any):
- evidence:
- rollback:
- post-release checks:
- owner:

## Revision Notes

- 2026-02-17T00:00:00Z: Initialized plan from template. Reason: establish PLANS-compliant execution baseline for tool result PII scanning.
- 2026-02-17T17:30:00Z: All milestones completed. Updated Progress, Surprises & Discoveries, Outcomes & Retrospective, and Artifacts sections with implementation evidence.
