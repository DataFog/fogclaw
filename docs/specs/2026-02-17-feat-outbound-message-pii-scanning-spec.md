---
slug: 2026-02-17-feat-outbound-message-pii-scanning
status: intake-complete
date: 2026-02-17T00:00:00Z
owner: sidmohan
plan_mode: lightweight
spike_recommended: no
priority: high
---

# feat: Add PII scanning to outbound messages via message_sending hook

## Purpose / Big Picture

FogClaw now scans user prompts (`before_agent_start`) and tool results (`tool_result_persist`), but outbound messages — the agent's final responses delivered to Telegram, Slack, Discord, etc. — are not scanned. If PII slips through into the agent's response (hallucinated, echoed, or reassembled from partial data), it reaches external channels unredacted.

By hooking into OpenClaw's `message_sending` lifecycle, FogClaw adds a last-chance gate that scans and redacts PII in outbound messages before they are delivered to recipients.

Note: `message_sending` is defined in OpenClaw's type system but not yet invoked upstream. This handler will activate automatically when OpenClaw wires the hook into its outbound message flow.

## Scope

### In Scope

- Register a `message_sending` hook handler in FogClaw's plugin registration
- Scan `event.content` (outbound message text) using the **full Scanner** (regex + GLiNER) since this hook is async-capable
- Apply existing `guardrail_mode`, `entityActions`, `redactStrategy`, and `allowlist` config
- Redact PII spans in the outbound message content (all modes produce span-level redaction, never cancel)
- Return `{ content: redactedText }` when PII is found
- Emit audit log entries when `auditEnabled: true`
- Add unit tests for the handler
- Extend plugin smoke test

### Boundaries

- **No message cancellation.** FogClaw will never return `cancel: true`. Span-level redaction is always preferred over dropping messages silently.
- **No new config surface.** Reuse existing FogClaw config.
- **No changes to OpenClaw upstream.** Handler will activate when OpenClaw wires the hook.
- **No scanning of `event.metadata`.** Only `event.content` (the text delivered to the recipient).

## Non-Goals

- Cancelling message delivery
- Scanning message metadata or recipient addresses
- Modifying recipient routing

## Risks

- **Hook not invoked upstream.** The handler exists but won't fire until OpenClaw activates `message_sending`. This is accepted — the code is ready and waiting.
- **GLiNER latency on outbound path.** Scanner.scan() is async and may add 50-200ms per message. This is acceptable for outbound messages (not a hot-path like tool_result_persist) and provides coverage for person names and organizations.

## Requirements

| ID | Priority | Requirement |
|---|---|---|
| R1 | critical | Register a `message_sending` hook handler that scans outbound message content for PII using the full Scanner (regex + GLiNER) |
| R2 | critical | Redact detected PII spans using the configured `redactStrategy` |
| R3 | critical | Return `{ content: redactedText }` when PII is found; return void when clean |
| R4 | high | Apply existing `entityActions`, `guardrail_mode`, and `allowlist` config; all actions produce span-level redaction |
| R5 | high | Never return `cancel: true` — always deliver the (redacted) message |
| R6 | medium | Emit audit log entry with `source: "outbound"` when PII is detected and `auditEnabled: true` |
| R7 | low | Handler may be async (Scanner.scan() returns a Promise) |

## Success Criteria

- Unit tests pass for the message sending handler covering PII detection, redaction, allowlist, audit logging, and no-op cases
- Plugin smoke test verifies `message_sending` hook registration
- Plugin smoke test verifies PII in outbound content is redacted
- All existing tests pass (no regression)

## Constraints

- Must not introduce new dependencies
- Must not change the existing `FogClawConfig` type
- Must reuse the existing Scanner instance (not create a new one)

## Priority

- priority: high
- rationale: This is the last-chance safety net before PII reaches external messaging channels. Even if upstream scanning catches most PII, outbound scanning prevents hallucinated or reassembled PII from leaking.

## Initial Milestone Candidates

- M1: Create `src/message-sending-handler.ts` with async handler factory, plus unit tests
- M2: Register hook in `src/index.ts`, extend plugin smoke test, full suite validation

## Rollout

Ship with the next FogClaw release. The handler registers automatically during plugin startup. No feature flag needed — the hook only fires when OpenClaw wires `message_sending` into its outbound message flow.

## Validation and Acceptance Signals

- All unit tests pass for `src/message-sending-handler.ts` (PII detection, redaction, allowlist, audit, no-op)
- Plugin smoke test confirms `message_sending` hook registration and PII redaction in outbound content
- Full test suite passes with no regressions
- No new dependencies introduced

## Handoff

After spec approval, proceed directly to implementation (lightweight plan mode — code mirrors the established `tool-result-handler.ts` pattern).

## Revision Notes

- 2026-02-17T00:00:00Z: Initialized spec. message_sending hook is typed but not invoked in OpenClaw; handler ships as future-ready.
