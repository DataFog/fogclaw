---
slug: 2026-02-17-feat-tool-result-pii-scanning
status: intake-complete
date: 2026-02-17T00:00:00Z
owner: sidmohan
plan_mode: lightweight
spike_recommended: no
priority: high
---

# feat: Add PII scanning to tool results via tool_result_persist hook

## Purpose / Big Picture

FogClaw currently only scans the user prompt text (`before_agent_start`). The majority of PII entering an agent's context comes from **tool results** — file reads, web fetches, API calls, database queries. This content bypasses FogClaw entirely today.

By hooking into OpenClaw's `tool_result_persist` lifecycle, FogClaw can scan and redact PII in tool results **before they are persisted to the session transcript**, closing the largest gap in FogClaw's coverage.

## Scope

### In Scope

- Register a `tool_result_persist` hook handler in FogClaw's plugin registration
- Extract text content from `AgentMessage` tool result payloads
- Scan extracted text using the **regex engine only** (synchronous constraint)
- Apply the existing `guardrail_mode`, `entityActions`, `redactStrategy`, and `allowlist` config to detected entities
- Redact PII spans in tool result text content (all modes — redact, block, warn — produce span-level redaction in tool results)
- Emit audit log entries for tool result detections when `auditEnabled: true`
- Add unit tests for the new hook handler
- Add integration test confirming the hook registers and transforms tool results

### Boundaries

- **No GLiNER on this path.** The `tool_result_persist` hook is synchronous-only; async handlers are rejected by OpenClaw. Regex covers structured PII (SSN, email, phone, credit card, IP, date, zip). Unstructured entity detection (person names, organizations) is out of scope for this hook.
- **No `before_tool_call` hook.** This hook exists in OpenClaw's type system but has zero active invocation sites upstream. Will be addressed in a future initiative once OpenClaw wires it in.
- **No `message_sending` hook.** Outbound message scanning is a separate priority.
- **No scanning of `event.messages` history.** Historical message scanning is a separate priority.
- **No new config surface.** Reuse existing FogClaw config — no `toolResultScanning` sub-object.
- **No changes to OpenClaw upstream.** This initiative is FogClaw-only.

## Non-Goals

- Blocking tool execution (requires `before_tool_call`, which is not wired upstream)
- Modifying files on disk
- Scanning binary/image content in tool results
- Real-time GLiNER inference on tool results

## Risks

- **Performance on hot path.** `tool_result_persist` runs synchronously on every tool result. Regex scanning is sub-millisecond for typical payloads, but very large tool results (e.g., reading a 10K-line file) could add measurable latency. Mitigation: benchmark and consider a size cap with configurable threshold.
- **AgentMessage structure varies.** Tool results are typed as `AgentMessage`, whose internal structure depends on the tool and provider. Text extraction must handle multiple content formats without crashing on unexpected shapes. Mitigation: defensive extraction with fallback to no-op.
- **Redaction alters tool output semantics.** Replacing `123-45-6789` with `[SSN_1]` in a tool result changes what the model sees. This is the intended behavior, but could cause unexpected downstream effects if the model tries to use the redacted value literally. Mitigation: this is inherent to the feature and matches existing `before_agent_start` behavior.

## Rollout

- Ship as part of next FogClaw patch release (0.1.7 or 0.2.0)
- Enabled by default when FogClaw is enabled (no separate toggle)
- Audit logging captures tool result scans for observability

## Validation and Acceptance Signals

- Unit tests pass for text extraction from various `AgentMessage` shapes
- Unit tests pass for regex scanning + redaction of tool result content
- Integration test confirms `tool_result_persist` hook registers via `api.on()`
- Integration test confirms a tool result containing PII is transformed before persistence
- Audit log entries are emitted for tool result detections
- Existing `before_agent_start` tests continue to pass (no regression)
- Manual verification: install FogClaw in OpenClaw, have agent read a file with PII, confirm session transcript shows redacted content

## Requirements

| ID | Priority | Requirement |
|---|---|---|
| R1 | critical | Register a `tool_result_persist` hook handler that scans tool result text for PII using the regex engine |
| R2 | critical | Redact detected PII spans in tool result messages using the configured `redactStrategy` (token/mask/hash) |
| R3 | critical | Handler must be synchronous (no Promises returned) — OpenClaw rejects async `tool_result_persist` handlers |
| R4 | high | Apply existing `entityActions` and `guardrail_mode` config to determine per-entity action; all actions produce span-level redaction in tool results |
| R5 | high | Respect existing `allowlist` config (global values, patterns, per-entity lists) |
| R6 | high | Extract text content defensively from `AgentMessage` payloads — handle string content, array-of-content-blocks, and unexpected shapes without throwing |
| R7 | medium | Emit audit log entry per tool result scan when `auditEnabled: true`, including tool name, entity count, and labels (no raw PII values in logs) |
| R8 | medium | Skip scanning for tool results with no extractable text content (binary, empty, non-string) |
| R9 | low | Include `source: "tool_result"` in audit log entries to distinguish from prompt-level scans |

## Key Decisions

- **Regex-only on hot path**: GLiNER is async and cannot run in a synchronous hook. Regex covers the 7 structured PII types (SSN, email, phone, credit card, IP, date, zip) at sub-millisecond latency. This is a deliberate tradeoff — unstructured entities (person names, orgs) are not scanned in tool results.
- **Reuse existing config**: No separate config section for tool result scanning. The same `guardrail_mode`, `entityActions`, `redactStrategy`, and `allowlist` apply everywhere. Simpler mental model for users.
- **Span-level redaction for all modes**: Even when `entityActions` says `block` for an entity type, the tool result is redacted at the span level (not replaced entirely). This preserves non-PII context for the agent while removing sensitive values.

## Success Criteria

- PII in tool results (file reads, web fetches, etc.) is redacted before entering the session transcript
- Regex engine detects SSN, email, phone, credit card, IP, date, and zip in tool result content
- No measurable latency impact for typical tool results (<1KB text)
- Audit log captures tool result scan events with entity counts and labels
- All existing tests pass; new tests cover the hook handler, text extraction, and edge cases

## Constraints

- `tool_result_persist` handler MUST be synchronous (OpenClaw constraint)
- Must not introduce new dependencies
- Must not change the existing `FogClawConfig` type (reuse existing fields)
- Regex engine only — no ONNX/GLiNER on this path

## Priority

- priority: high
- rationale: This closes the single largest gap in FogClaw's PII coverage. Tool results are the primary vector for PII entering agent context, and this hook is the only active interception point OpenClaw provides for that data flow.

## Initial Milestone Candidates

- M1: Text extraction utility — defensively extract text from `AgentMessage` tool result payloads, handling string content, content block arrays, and edge cases. Likely files: `src/extract.ts`, `tests/extract.test.ts`.
- M2: `tool_result_persist` hook handler — register the hook, wire in regex scanning + redaction + audit logging, return transformed message. Likely files: `src/index.ts`, `tests/tool-result-hook.test.ts`.
- M3: Integration smoke test — end-to-end test confirming a registered FogClaw plugin transforms a tool result containing PII. Likely files: `tests/plugin-smoke.test.ts` (extend existing).

## Handoff

After spec approval, proceed to `he-plan` for implementation breakdown. No spike needed — the OpenClaw hook contract is well-documented and the regex engine + redactor already exist in FogClaw.

## Revision Notes

- 2026-02-17T00:00:00Z: Initialized spec from template. Reason: establish intake baseline for tool result PII scanning via `tool_result_persist` hook.
