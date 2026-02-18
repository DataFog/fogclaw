---
slug: 2026-02-17-feat-pii-access-request-backlog
status: active
phase: verify-release-go
plan_mode: execution
detail_level: more
priority: high
owner: sidmohan
---

# Add PII Access Request Backlog

This Plan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, `Outcomes & Retrospective`, and `Revision Notes` current as work proceeds.

This plan must be maintained in accordance with `docs/PLANS.md`.

## Purpose / Big Picture

Today, when FogClaw redacts PII from agent-visible content, the agent loses that information permanently for the session. If the agent genuinely needs a redacted email address to send a message or a redacted name to look up a record, it has no recourse — the data is gone.

After this change, an agent can call `fogclaw_request_access` to submit a request for a specific piece of redacted data, explaining why it needs it. The developer using OpenClaw can then review pending requests via `fogclaw_requests`, and approve, deny, or ask the agent for more context via `fogclaw_resolve`. When approved, the original pre-redaction text is returned as tool output — scoped to the current session only.

To see it working: start an OpenClaw session with FogClaw enabled, send a message containing PII (e.g., an email address), observe it gets redacted to `[EMAIL_1]`, then have the agent call `fogclaw_request_access` with that placeholder. List the request with `fogclaw_requests`, approve it with `fogclaw_resolve`, and observe the original email address returned in the tool output.

## Progress

- [x] (2026-02-17T18:37:00Z) P1 [M1] Create `AccessRequest` and store types in `src/types.ts`
- [x] (2026-02-17T18:37:00Z) P2 [M1] Implement `BacklogStore` and `RedactionMapStore` in `src/backlog.ts`
- [x] (2026-02-17T18:37:00Z) P3 [M1] Write unit tests for `BacklogStore` in `tests/backlog.test.ts` — 25 tests passing
- [x] (2026-02-17T18:37:00Z) P4 [M1] Implement `fogclaw_request_access` tool handler in `src/backlog-tools.ts`
- [x] (2026-02-17T18:37:00Z) P5 [M1] Wire `RedactionMapStore` into existing hooks in `src/index.ts`
- [x] (2026-02-17T18:37:00Z) P6 [M1] Register `fogclaw_request_access` tool in `src/index.ts`
- [x] (2026-02-17T18:37:00Z) P7 [M1] Write tests for request tool in `tests/backlog-tools.test.ts`
- [x] (2026-02-17T18:37:33Z) P8 [M1] Verify M1: 48 new tests passing, agent can submit request and get REQ-1 confirmation
- [x] (2026-02-17T18:37:33Z) P9 [M2] Implement `fogclaw_requests` tool handler (list/filter)
- [x] (2026-02-17T18:37:33Z) P10 [M2] Implement `fogclaw_resolve` tool handler (approve/deny/follow-up)
- [x] (2026-02-17T18:37:33Z) P11 [M2] Register both tools in `src/index.ts`
- [x] (2026-02-17T18:37:33Z) P12 [M2] Write tests for list and resolve tools
- [x] (2026-02-17T18:37:53Z) P13 [M2] Verify M2: full request→list→resolve cycle works, approved request returns original text
- [x] (2026-02-17T18:37:33Z) P14 [M3] Add audit logging for request lifecycle events
- [x] (2026-02-17T18:37:00Z) P15 [M3] Add `maxPendingRequests` config option — pulled forward to M1 since BacklogStore constructor needs it
- [x] (2026-02-17T18:37:33Z) P16 [M3] Add batch resolve support to `fogclaw_resolve`
- [x] (2026-02-17T18:38:00Z) P17 [M3] Update `openclaw.plugin.json` with new config field
- [x] (2026-02-17T18:38:00Z) P18 [M3] Update `fogclaw.config.example.json`
- [x] (2026-02-17T18:36:00Z) P19 [M3] Update `docs/SECURITY.md` and `docs/OBSERVABILITY.md` — done during he-plan Phase 4.5
- [x] (2026-02-17T18:38:19Z) P20 [M3] Run full test suite — 213 tests passing, 0 failures, 0 type errors
- [x] (2026-02-17T18:38:19Z) P21 [M3] Verify M3: feature is production-ready

## Surprises & Discoveries

- Observation: `maxPendingRequests` needed to be pulled forward from M3 to M1 because `BacklogStore` constructor requires it.
  Evidence: TypeScript compilation would fail without it since `new BacklogStore(mapStore, config.maxPendingRequests)` references the field.

- Observation: All three milestones could be implemented in a single pass because the tool handler pattern is well-established and all code is purely additive.
  Evidence: 12 files changed, 1245 insertions, 4 deletions (only the smoke test count assertion changed in existing code).

## Decision Log

- Decision: Store redaction mappings from hooks in a shared in-memory `RedactionMapStore`.
  Rationale: The `redact()` function already returns a `mapping: Record<string, string>` (placeholder → original text). Currently this mapping is used within each hook handler and discarded. Storing it in a module-level store is the simplest way to make it available to the backlog tools without changing hook return values or behavior.
  Date/Author: 2026-02-17, sidmohan

- Decision: Use a global counter for request IDs (`REQ-1`, `REQ-2`, ...) scoped to the plugin instance lifetime.
  Rationale: Simple, human-readable, and unique within a session. No need for UUIDs since requests don't persist across sessions.
  Date/Author: 2026-02-17, sidmohan

- Decision: Rate limiting is global (not per-entity-type).
  Rationale: Per-entity-type limits add configuration complexity without clear benefit in v1. A single `maxPendingRequests` cap (default 50) is sufficient to prevent abuse.
  Date/Author: 2026-02-17, sidmohan

- Decision: `fogclaw_requests` tool handles both listing and agent-side checking of resolved requests via a `status` filter parameter.
  Rationale: One tool with a filter is simpler than two separate tools. The agent calls `fogclaw_requests` with `status: "approved"` or `status: "follow_up"` to check for responses. The user calls it with no filter or `status: "pending"` to review.
  Date/Author: 2026-02-17, sidmohan

## Outcomes & Retrospective

All three milestones completed in a single implementation pass:

- **M1**: `BacklogStore`, `RedactionMapStore`, and `fogclaw_request_access` tool implemented. Hooks wired to capture redaction mappings. 25 unit tests for store, additional tool tests.
- **M2**: `fogclaw_requests` (list/filter) and `fogclaw_resolve` (approve/deny/follow-up/batch) tools implemented. Full lifecycle integration tests pass.
- **M3**: Audit logging, `maxPendingRequests` config, batch resolve, manifest/config/doc updates all complete. 213 total tests, 0 failures, 0 type errors.

The implementation was purely additive — no existing behavior changed. The only modification to existing test assertions was updating the smoke test tool count from 3 to 6.

## Context and Orientation

FogClaw is an OpenClaw plugin for PII detection and redaction. It is a TypeScript project at repository root with source in `src/` and tests in `tests/`. It uses Vitest for testing and TypeScript for compilation. Node.js 22+ is required.

The plugin registers with OpenClaw via a default export in `src/index.ts`. The exported object has `id`, `name`, and a `register(api)` method. Inside `register`, the plugin calls `api.registerTool()` to add tools and `api.on()` to add hooks. The `api` object also provides `api.logger` for logging and `api.pluginConfig` for user configuration.

**Key files and what they do:**

`src/index.ts` — Plugin entry point. Creates a `Scanner` instance and a `RegexEngine` instance. Registers three hooks (`before_agent_start`, `tool_result_persist`, `message_sending`) and three tools (`fogclaw_scan`, `fogclaw_preview`, `fogclaw_redact`). Each hook scans text for entities, applies policy (block/warn/redact), and returns modified content or undefined.

`src/types.ts` — All type definitions. Key types: `Entity` (text, label, start, end, confidence, source), `FogClawConfig`, `RedactResult` (redacted_text, mapping, entities), `GuardrailAction` ("redact" | "block" | "warn"), `RedactStrategy` ("token" | "mask" | "hash"), `ScanResult` (entities, text).

`src/scanner.ts` — `Scanner` class that orchestrates regex + GLiNER detection. Method `scan(text, extraLabels?)` returns `Promise<ScanResult>`. Method `initialize()` loads GLiNER model asynchronously. Falls back to regex-only if GLiNER unavailable.

`src/redactor.ts` — `redact(text, entities, strategy)` function. Returns `RedactResult` with `mapping: Record<string, string>` where keys are replacement placeholders (e.g., `[EMAIL_1]`) and values are original text (e.g., `john@example.com`). Processes entities end-to-start to preserve string offsets.

`src/config.ts` — `loadConfig(overrides)` merges user config with defaults and validates. `DEFAULT_CONFIG` provides sensible defaults. Exports `loadConfig` and `DEFAULT_CONFIG`.

`src/message-sending-handler.ts` — Factory `createMessageSendingHandler(config, scanner, logger)` returns an async handler for the `message_sending` hook. Scans outbound messages, redacts PII, returns `{ content: redactedText }` or undefined.

`src/tool-result-handler.ts` — Factory `createToolResultHandler(config, regexEngine, logger)` returns a synchronous handler for `tool_result_persist`. Uses regex-only (sync constraint). Returns `{ message: modifiedMessage }` or undefined.

`src/extract.ts` — Utilities `extractText(message)` and `replaceText(message, redactedText)` for handling multiple message formats (plain string, `{ content: string }`, `{ content: [{ type: "text", text }] }`).

`tests/plugin-smoke.test.ts` — Integration test using a mock API object with `hooks`, `tools`, `on()`, `registerTool()`, `logger`, and `pluginConfig`. This is the pattern to follow for testing new tool registration.

**Tool registration contract** — Each tool is an object with: `name` (string), `id` (string), `description` (string for model context), `schema` (JSON Schema object with `type: "object"`, `properties`, `required`), and `handler` (async function returning `{ content: [{ type: "text", text: string }] }`).

**Redaction mapping flow** — When a hook detects PII and redacts it, the `redact()` call returns a `RedactResult` whose `mapping` field maps each replacement placeholder to the original text. For example, if the text `"Email john@doe.com"` is redacted to `"Email [EMAIL_1]"`, the mapping is `{ "[EMAIL_1]": "john@doe.com" }`. Currently this mapping is used only within the hook handler (for logging) and then discarded. This plan introduces a `RedactionMapStore` to capture these mappings so the backlog tools can look up original text when fulfilling approved requests.

## Milestones

### Milestone 1 — Backlog Store and Request Submission

After this milestone, the FogClaw plugin will have an in-memory backlog store and a `fogclaw_request_access` tool. An agent encountering a redacted placeholder like `[EMAIL_1]` can call this tool with the placeholder, entity type, and a reason. The tool returns a confirmation with a request ID (e.g., `REQ-1`). The existing hooks will capture their redaction mappings into a shared store so that future approval lookups can retrieve the original text.

What changes: New file `src/backlog.ts` with `BacklogStore` and `RedactionMapStore` classes. New file `src/backlog-tools.ts` with a `createRequestAccessHandler` factory. New types in `src/types.ts`. Modified `src/index.ts` to create the stores, pass the `RedactionMapStore` to hook handlers, and register the new tool. New test files `tests/backlog.test.ts` and `tests/backlog-tools.test.ts`.

Verification: Run `npm test` and confirm the new tests pass. The `fogclaw_request_access` tool handler, when called with `{ placeholder: "[EMAIL_1]", entity_type: "EMAIL", reason: "Need to send a follow-up email" }`, returns `{ content: [{ type: "text", text: '{"request_id":"REQ-1","status":"pending","message":"..."}' }] }`.

### Milestone 2 — Review and Resolve Tools

After this milestone, the full request-review-resolve cycle works end-to-end. A user can call `fogclaw_requests` to see all pending requests with their entity types, placeholders, context, and reasons. They can then call `fogclaw_resolve` to approve (which returns the original text), deny, or ask a follow-up question. The agent can call `fogclaw_requests` with a status filter to check for approved or follow-up responses.

What changes: New handler factories `createRequestsListHandler` and `createResolveHandler` in `src/backlog-tools.ts`. Registration of `fogclaw_requests` and `fogclaw_resolve` tools in `src/index.ts`. Additional tests in `tests/backlog-tools.test.ts`.

Verification: Run `npm test`. Execute a full cycle in tests: (1) hook redacts text and mapping is captured, (2) agent calls `fogclaw_request_access`, (3) user calls `fogclaw_requests` and sees the pending request, (4) user calls `fogclaw_resolve` with `action: "approve"` and receives the original text in the response, (5) agent calls `fogclaw_requests` with `status: "approved"` and sees the resolved request with original text.

### Milestone 3 — Integration Polish

After this milestone, the feature is production-ready. Audit logging emits structured events for request creation, approval, denial, and follow-up. The `maxPendingRequests` config option (default 50) caps the backlog size. Batch resolve allows approving or denying multiple requests in one tool call. The plugin manifest, example config, and domain docs are updated.

What changes: Audit logging added to each tool handler (following existing `[FOGCLAW AUDIT]` format). New `maxPendingRequests` field in `FogClawConfig` and `loadConfig`. Batch mode in `fogclaw_resolve` via `request_ids` array parameter. Updated `openclaw.plugin.json` schema and UI hints. Updated `fogclaw.config.example.json`. Updated `docs/SECURITY.md` (PII-in-memory threat) and `docs/OBSERVABILITY.md` (new audit events).

Verification: Run `npm test` — all tests pass, no regressions in existing tests. Run `npm run lint` — no type errors. Verify audit log tests confirm events are emitted with correct format and never include raw PII. Verify max pending requests enforcement in tests.

## Plan of Work

The work proceeds in three phases corresponding to the milestones. Each phase is additive — no existing behavior changes, only new code and wiring.

**Phase 1 (M1): Types, store, request tool, hook wiring.**

Start in `src/types.ts`. Add a `RequestStatus` type union (`"pending" | "approved" | "denied" | "follow_up"`). Add an `AccessRequest` interface with fields: `id` (string, e.g., `"REQ-1"`), `placeholder` (the redacted token like `"[EMAIL_1]"`), `entityType` (string), `originalText` (string or null — null until mapping is found), `reason` (string, agent's stated justification), `context` (optional string, surrounding text), `status` (RequestStatus), `createdAt` (ISO timestamp string), `resolvedAt` (optional ISO timestamp), `followUpMessage` (optional string, user's question to agent), `responseMessage` (optional string, resolution message).

Create `src/backlog.ts`. This file exports two classes:

`RedactionMapStore` — a simple class that holds a `Map<string, string>` mapping placeholder tokens to original text. It has methods `addMapping(mapping: Record<string, string>)` to merge new entries, `getOriginal(placeholder: string): string | undefined` to look up an original value, and `clear()` to reset. All hooks will call `addMapping` after redaction so the backlog tools can retrieve originals.

`BacklogStore` — manages the access request lifecycle. Constructor takes `maxPending: number` (default 50). Internal state is a `Map<string, AccessRequest>` keyed by request ID and a counter for ID generation. Methods: `createRequest(placeholder, entityType, reason, context?, originalText?)` returns the new `AccessRequest` (or throws if at max pending), `getRequest(id)` returns a single request, `listRequests(statusFilter?)` returns filtered array, `resolveRequest(id, action, message?)` transitions status and returns updated request, `resolveMultiple(ids, action, message?)` for batch operations. The `createRequest` method looks up `originalText` from the `RedactionMapStore` if not provided directly.

Write `tests/backlog.test.ts` with unit tests covering: creating requests, max pending enforcement, listing with filters, resolving (approve/deny/follow-up), batch resolve, and `RedactionMapStore` merge and lookup.

Create `src/backlog-tools.ts`. This file exports handler factories following the existing pattern. Start with `createRequestAccessHandler(backlog: BacklogStore, redactionMap: RedactionMapStore, config: FogClawConfig, logger?)`. The handler accepts `{ placeholder: string, entity_type: string, reason: string, context?: string }` and returns a tool response containing the new request ID and status. If the placeholder is found in the `RedactionMapStore`, the original text is stored on the request (but not returned to the agent — only returned on approval).

In `src/index.ts`, create instances of `RedactionMapStore` and `BacklogStore` inside `register()`. After each hook's redaction call, add the mapping to the `RedactionMapStore`. Specifically, in the `before_agent_start` hook, after calling `redact()`, call `redactionMapStore.addMapping(result.mapping)`. Do the same in the `tool_result_persist` handler factory (pass the store to `createToolResultHandler`) and in the `message_sending` handler factory (pass to `createMessageSendingHandler`). Then register the `fogclaw_request_access` tool.

Write tool tests in `tests/backlog-tools.test.ts` following the mock API pattern from `tests/plugin-smoke.test.ts`.

**Phase 2 (M2): List and resolve tools.**

Add `createRequestsListHandler(backlog: BacklogStore, logger?)` to `src/backlog-tools.ts`. The handler accepts `{ status?: string }` and returns a JSON response listing matching requests. Each request in the response includes: id, placeholder, entity_type, reason, context, status, created_at. For approved requests, it also includes the original_text so the agent can see the revealed data.

Add `createResolveHandler(backlog: BacklogStore, redactionMap: RedactionMapStore, config: FogClawConfig, logger?)` to `src/backlog-tools.ts`. The handler accepts `{ request_id: string, action: "approve" | "deny" | "follow_up", message?: string }`. On approve: transitions status to "approved", returns the original text in the response. On deny: transitions to "denied", returns confirmation. On follow_up: transitions to "follow_up", stores the user's message, returns confirmation. Returns an error if the request doesn't exist or is already resolved.

Register both tools in `src/index.ts` with appropriate JSON Schema definitions and descriptions.

Write comprehensive tests: full lifecycle cycle, error cases (unknown ID, double-resolve), follow-up flow (resolve with follow_up, agent checks with status filter, user then approves).

**Phase 3 (M3): Audit, config, batch, docs.**

Add audit logging to each tool handler. Follow the existing format: `[FOGCLAW AUDIT] access_request_created {...}`, `[FOGCLAW AUDIT] access_request_resolved {...}`. Include request_id, entity_type, action, but never the original PII text. Only emit when `config.auditEnabled` is true.

Add `maxPendingRequests` to `FogClawConfig` in `src/types.ts` (type: `number`). Add validation and default (50) in `src/config.ts` `loadConfig`. Pass the value to `BacklogStore` constructor.

Add batch resolve to `fogclaw_resolve`: accept `request_ids: string[]` as an alternative to `request_id`. When present, resolve all listed requests with the same action. Return array of results.

Update `openclaw.plugin.json`: add `maxPendingRequests` to the config schema with type number, default 50, minimum 1, and UI hints. Update `fogclaw.config.example.json` to include the new field.

Update `docs/SECURITY.md`: add a threat entry for PII stored in runtime memory via the backlog, document that it is session-scoped and never written to disk, and note the max pending cap as a mitigation.

Update `docs/OBSERVABILITY.md`: document the new audit event types and their fields.

## Concrete Steps

All commands run from the repository root: `/Users/sidmohan/Projects/datafog/fogclaw`

Build the project after changes:

    npm run build

Expected: clean compile, no errors.

Run the full test suite:

    npm test

Expected: all existing tests pass plus new tests for backlog and backlog-tools. Approximately 10-15 new test cases across two new test files.

Type-check without emitting:

    npm run lint

Expected: no type errors.

Run only backlog tests during development:

    npx vitest run tests/backlog.test.ts tests/backlog-tools.test.ts

Run plugin smoke test to verify registration:

    npx vitest run tests/plugin-smoke.test.ts

Expected: now expects 6 tools registered (3 existing + 3 new) and 3 hooks (unchanged).

## Validation and Acceptance

Acceptance is defined as observable behavior, not just passing tests.

**Milestone 1 acceptance:** After registering the plugin with a mock API, 4+ tools are registered (3 existing + at least `fogclaw_request_access`). The `before_agent_start` hook, when given text containing an email, returns redacted text. Then calling `fogclaw_request_access` with `{ placeholder: "[EMAIL_1]", entity_type: "EMAIL", reason: "Need to reply" }` returns `{ content: [{ type: "text", text: '{"request_id":"REQ-1","status":"pending",...}' }] }`. The `RedactionMapStore` contains the mapping `"[EMAIL_1]" → "original@email.com"`.

**Milestone 2 acceptance:** After submitting a request (M1), calling `fogclaw_requests` with no filter returns an array containing the pending request with all metadata. Calling `fogclaw_resolve` with `{ request_id: "REQ-1", action: "approve" }` returns `{ content: [{ type: "text", text: '{"request_id":"REQ-1","status":"approved","original_text":"original@email.com",...}' }] }`. Calling `fogclaw_requests` with `{ status: "approved" }` returns the resolved request with original text visible. For follow-up: resolving with `action: "follow_up"` and `message: "Why do you need this?"` stores the question; listing with `status: "follow_up"` shows the request with the question.

**Milestone 3 acceptance:** When `auditEnabled: true`, each tool call emits an audit log line. The `maxPendingRequests` config is validated (must be a number >= 1) and enforced (creating request #51 with default config returns an error). Batch resolve with `request_ids: ["REQ-1", "REQ-2"]` resolves both. `npm test` passes all tests. `npm run lint` produces no errors.

## Idempotence and Recovery

All changes are additive. No database, no migrations, no file-system state.

If implementation is interrupted partway through a milestone, the incomplete work can be identified via `Progress` checkboxes. Resume by reading this plan and picking up at the first unchecked item.

If a test fails after a change, the issue is in the new code — existing tests should remain green throughout since no existing behavior is modified. Roll back the specific new file or edit and retry.

The `BacklogStore` and `RedactionMapStore` are purely in-memory. Restarting the process resets all state, which is the intended behavior (session-scoped). No cleanup is needed.

To fully revert the feature: remove `src/backlog.ts`, `src/backlog-tools.ts`, `tests/backlog.test.ts`, `tests/backlog-tools.test.ts`, and undo the additions in `src/index.ts`, `src/types.ts`, `src/config.ts`, `openclaw.plugin.json`, and `fogclaw.config.example.json`.

## Artifacts and Notes

Test run output (final):

    Test Files  11 passed (11)
         Tests  213 passed (213)
      Duration  795ms

Type check:

    tsc --noEmit  (clean, no errors)

New test breakdown:
- tests/backlog.test.ts: 25 tests (RedactionMapStore: 5, BacklogStore: 20)
- tests/backlog-tools.test.ts: 23 tests (request: 5, list: 6, resolve: 8, lifecycle: 4)

## Interfaces and Dependencies

**New types in `src/types.ts`:**

`RequestStatus` — union type: `"pending" | "approved" | "denied" | "follow_up"`

`AccessRequest` — interface with fields: `id: string`, `placeholder: string`, `entityType: string`, `originalText: string | null`, `reason: string`, `context: string | null`, `status: RequestStatus`, `createdAt: string`, `resolvedAt: string | null`, `followUpMessage: string | null`, `responseMessage: string | null`

**New module `src/backlog.ts`:**

`RedactionMapStore` class — `addMapping(mapping: Record<string, string>): void`, `getOriginal(placeholder: string): string | undefined`, `clear(): void`

`BacklogStore` class — constructor takes `redactionMap: RedactionMapStore` and `maxPending?: number`. Methods: `createRequest(placeholder, entityType, reason, context?): AccessRequest`, `getRequest(id): AccessRequest | undefined`, `listRequests(statusFilter?): AccessRequest[]`, `resolveRequest(id, action, message?): AccessRequest`, `resolveMultiple(ids, action, message?): AccessRequest[]`, `pendingCount: number` (getter)

**New module `src/backlog-tools.ts`:**

`createRequestAccessHandler(backlog, config, logger?)` — returns async tool handler

`createRequestsListHandler(backlog, config, logger?)` — returns async tool handler

`createResolveHandler(backlog, config, logger?)` — returns async tool handler

**New tool schemas:**

`fogclaw_request_access` — `{ placeholder: string (required), entity_type: string (required), reason: string (required), context: string (optional) }`

`fogclaw_requests` — `{ status: string (optional, enum: pending/approved/denied/follow_up) }`

`fogclaw_resolve` — `{ request_id: string (optional), request_ids: string[] (optional), action: string (required, enum: approve/deny/follow_up), message: string (optional) }` — one of `request_id` or `request_ids` must be provided

**Modified config in `src/types.ts` and `src/config.ts`:**

`FogClawConfig.maxPendingRequests: number` (default: 50, min: 1)

**Dependencies:** No new npm packages. All implementation uses built-in TypeScript/Node.js features.

## Pull Request

Populated by `he-github`.

- pr:
- branch:
- commit:
- ci:

## Review Findings

Review date: 2026-02-17. Five parallel reviewers: correctness, architecture, security, data privacy, simplicity.

### Blocking (HIGH)

| ID | Dimension | File/Symbol | Finding | Required Action | Owner |
|---|---|---|---|---|---|
| S-17 | Security | `src/backlog.ts:21-45` `RedactionMapStore` | RedactionMapStore grows unboundedly — every redaction mapping is accumulated with no size cap, eviction, or cleanup. Long sessions accumulate PII in memory without limit. | Add `maxMappings` constructor parameter with FIFO eviction when cap is reached. Wire from config or hardcode sensible default (e.g. 10000). Add test for eviction behavior. | implementer |

### Non-blocking (MEDIUM) — routed to tech-debt tracker

| ID | Dimension | File/Symbol | Finding |
|---|---|---|---|
| S-1 | Security | `src/backlog-tools.ts` | No length validation on string inputs (placeholder, reason, context). Extremely long strings could cause memory pressure. |
| S-18 | Security | `src/backlog.ts` `BacklogStore` | Resolved requests with PII in `originalText` are never evicted from the requests map. Terminal-state requests should be prunable. |
| D-2 | Data | `src/backlog.ts:119-121` | `getRequest()` and `listRequests()` return mutable internal `AccessRequest` references. Callers can mutate store state. |
| SIM-1 | Simplicity | `src/backlog-tools.ts:160-257` | `createResolveHandler` inner closure exceeds 60 lines. Batch and single paths could be extracted into helpers. |

### Non-blocking (LOW) — routed to tech-debt tracker

| ID | Dimension | File/Symbol | Finding |
|---|---|---|---|
| C-1 | Correctness | `src/backlog.ts:98` | `getOriginal()` returning `undefined` is silently stored as `null`. No warning when placeholder is not found in mapping store. |
| C-2 | Correctness | `tests/backlog-tools.test.ts` | Tests use `vi.fn()` for logger but this is consistent with existing project patterns (not mock-based test logic). N/A for mock policy. |
| A-1 | Architecture | `src/backlog.ts:66-70` | `pendingCount` iterates all requests on every call. Consider caching for large backlogs. |
| A-2 | Architecture | `src/backlog-tools.ts:91` | Status string cast uses `as` without runtime exhaustive check after validation. |
| A-3 | Architecture | `src/index.ts` | RedactionMapStore is created inside `register()` but not exported for external testing. Already mitigated by re-export at module level. |
| D-1 | Data | `src/backlog.ts:108` | `createdAt` uses `new Date().toISOString()` — not injectable for deterministic testing. |
| D-3 | Data | `src/backlog-tools.ts` | Audit log entries use string concatenation for JSON. Consider structured logging objects. |
| SIM-2 | Simplicity | `src/backlog-tools.ts:106-132` | `listRequests` handler maps fields manually. Could use a shared serializer. |
| SIM-3 | Simplicity | `src/backlog-tools.ts:22-30` | `jsonResponse` and `errorResponse` helpers are fine but could be shared with existing tool handlers. |
| SIM-4 | Simplicity | `src/backlog.ts:174-187` | `resolveMultiple` wraps `resolveRequest` in try/catch per ID. Simple and correct but could be cleaner with a result type. |

### Priority Gate

- **HIGH findings:** 1 (S-17 — **RESOLVED**: added `maxMappings` constructor parameter with FIFO eviction, default 10000. Tests added for eviction behavior. 215/215 tests pass, 0 type errors.)
- **MEDIUM findings:** 4 (routed to tech-debt tracker TD-2026-02-17-03 through TD-2026-02-17-06)
- **LOW findings:** 10 (routed to tech-debt tracker TD-2026-02-17-07 through TD-2026-02-17-10, plus 6 informational)
- **Gate status:** CLEAR — all HIGH findings resolved, medium/low routed to tech-debt tracker

## Verify/Release Decision

- decision: **GO**
- date: 2026-02-17
- open findings by priority (if any): 0 critical, 0 high (S-17 resolved), 4 medium + 10 low routed to tech-debt tracker
- evidence:
  - TypeScript type check: `npx tsc --noEmit` — 0 errors
  - Full test suite: `npx vitest run` — 215/215 tests pass, 11 test files, 0 failures
  - Targeted backlog tests: 50 tests pass (27 backlog + 23 backlog-tools)
  - Architecture invariants verified: no PII in audit logs, session-scoped only, original text revealed only on approve, RedactionMapStore has FIFO eviction (maxMappings=10000), all 3 hooks wire mappings correctly
  - Review gate: CLEAR — security review performed (3 findings), data review performed (3 findings), 1 HIGH resolved
- rollback: Purely additive change. Revert by removing `src/backlog.ts`, `src/backlog-tools.ts`, `tests/backlog.test.ts`, `tests/backlog-tools.test.ts`, and reverting additions in `src/index.ts`, `src/types.ts`, `src/config.ts`, `openclaw.plugin.json`, `fogclaw.config.example.json`. No database, no migrations, no persistent state. Process restart clears all in-memory backlog state.
- post-release checks: Verify `npm test` passes in CI. Confirm 6 tools registered in plugin smoke test. Confirm audit events emit correctly with `auditEnabled: true` (no raw PII in logs). Confirm `maxPendingRequests` enforcement (request #51 returns error with default config).
- owner: sidmohan

## Revision Notes

- 2026-02-17T00:00:00Z: Initialized plan from spec `2026-02-17-feat-pii-access-request-backlog`. Three milestones: backlog store + request tool, review/resolve tools, polish. Detail level: MORE. Reason: establish PLANS-compliant execution baseline.
- 2026-02-17T18:38:00Z: All milestones completed. Implementation was purely additive (1245 lines added, 4 changed). maxPendingRequests pulled from M3 to M1 for type-safety. All 213 tests pass. Plan updated with evidence and outcomes.
- 2026-02-17T18:56:00Z: he-review completed. 5 parallel reviewers (correctness, architecture, security, data, simplicity). 1 HIGH finding (S-17: unbounded RedactionMapStore) fixed with FIFO eviction + maxMappings=10000 default. 4 MEDIUM + 10 LOW routed to tech-debt tracker. 215/215 tests pass post-fix. Priority gate CLEAR.
- 2026-02-17T19:00:00Z: he-verify-release completed. 5 gates verified in parallel (tests, architecture invariants, review gate, rollback, monitoring). All gates PASS. Decision: GO. 215/215 tests, 0 type errors, rollback documented, audit events documented.
